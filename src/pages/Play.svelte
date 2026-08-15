<script>
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  import { createChannel } from '../lib/sync.js';
  import { play as playSound } from '../lib/sound.js';
  import Projection from '../components/Projection.svelte';
  import Slide from '../components/Slide.svelte';

  export let sessionId;
  export let settings = { sounds: true, animations: true };

  let s = null;
  let phase = 'load';        // load | intro | question | revealed | done
  let idx = -1;
  let secondsLeft = 0;
  let paused = false;
  let winners = [];
  let timerId = null;
  let confetti = [];
  let verifyOpen = false;
  let verifyCode = '';
  let verifyResult = null;
  let verifyError = '';
  let announce = null;
  let presenterMode = false;
  let displayConnected = false;
  let raceStats = null;
  let showRace = true;
  let channel = null;
  let slide = null;          // diapositive libre en cours (affichée entre deux questions)
  let remoteCode = null;
  let remoteSrc = null;
  let remoteOnline = false;
  let joinCode = null;
  let participants = [];
  let answersThisQ = { total: 0, correct: 0 };
  let dist = null;
  let autoBingos = [];       // bingos numériques annoncés
  let bonus = null;          // {q, open, revealed}
  let leaderboard = [];
  let questionStartedAt = null;
  let consoleAbort = null;
  $: hasParticipants = participants.length > 0;
  $: digitalOn = (s?.params?.participation || 'mixed') !== 'paper';
  $: ambiance = s?.params?.ambiance || settings.ambiance || 'classic';
  $: pendingSlides = s ? (s.slides || []) : [];

  $: q = s && idx >= 0 ? s.questions[idx] : null;
  $: nextQ = s && idx + 1 < N ? s.questions[idx + 1] : null;
  $: N = s ? s.questions.length : 0;
  $: effectsOn = (s?.params?.animations ?? settings.animations);
  $: soundsOn = (s?.params?.sounds ?? settings.sounds);
  $: correctLetters = q ? q.correct.map(i => 'ABCDE'[i]).join(' + ') : '';
  $: elapsedMin = s?.startedAt ? Math.max(0, Math.round((Date.now() - new Date(s.startedAt + 'Z').getTime()) / 60000)) : 0;
  $: remainingMin = s ? Math.round((N - idx - 1) * (s.params.secondsPerQuestion + 15) / 60) : 0;

  onMount(async () => {
    s = await api.get('/api/sessions/' + sessionId);
    winners = s.state?.winners || [];
    channel = createChannel(sessionId, onChannelMessage);
    if (s.status === 'running' && s.currentIndex >= 0) {
      idx = s.currentIndex;
      phase = s.state?.revealed ? 'revealed' : 'question';
      if (phase === 'question') startTimer(s.state?.secondsLeft ?? s.params.secondsPerQuestion);
    } else if (s.status === 'done') {
      idx = s.currentIndex; phase = 'done';
    } else {
      phase = 'intro';
    }
    window.addEventListener('keydown', onKey);
    refreshRace();
    // Télécommande : code + flux d'événements
    try {
      const rc = await api.get(`/api/sessions/${sessionId}/remote-code`);
      remoteCode = rc.code || (await api.post(`/api/sessions/${sessionId}/remote-code`)).code;
      listenRemote();
    } catch {}
    try {
      if ((s.params.participation || 'mixed') === 'paper') throw new Error('paper');
      joinCode = (await api.post(`/api/sessions/${sessionId}/join-code`, {})).code;
      participants = await api.get(`/api/sessions/${sessionId}/participants`);
      autoBingos = participants.filter(p => p.bingoAt).map(p => ({ id: p.id, name: p.name, gridCode: p.gridCode, atQuestion: p.bingoAt }));
      listenConsole();
    } catch {}
    pushLive();
  });
  onDestroy(() => { clearInterval(timerId); window.removeEventListener('keydown', onKey); channel?.close(); remoteSrc?.close(); consoleAbort?.abort(); });

  /* ---------- Boîtier de vote : diffusion + événements ---------- */
  let liveTimer = null;
  function pushLive(event) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(async () => {
      try {
        await api.post(`/api/sessions/${sessionId}/live`, {
          idx, phase: phase === 'done' ? 'done' : phase, event: event || null, questionId: q?.id || null,
          deadline: phase === 'question' && !paused ? Date.now() + secondsLeft * 1000 : null,
          startedAt: questionStartedAt, slide, bonus: bonus ? { q: bonus.q, open: bonus.open, revealed: bonus.revealed } : null
        });
      } catch {}
    }, 80);
  }
  function listenConsole() {
    consoleAbort = new AbortController(); const tk = localStorage.getItem('docbingo_token');
    (async () => {
      while (!consoleAbort.signal.aborted) {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/console-events`, { headers: tk ? { 'X-DocBingo-Token': tk } : {}, signal: consoleAbort.signal });
          const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
              const ev = /event: (\w+)/.exec(chunk)?.[1]; const data = /data: (.*)/.exec(chunk)?.[1];
              if (!data) continue;
              const d = JSON.parse(data);
              if (ev === 'joined') participants = [...participants, { id: d.id, name: d.name, gridCode: d.gridCode, score: 0, marks: [], jokers: 0 }];
              if (ev === 'answer' && d.qIndex === idx) answersThisQ = { total: answersThisQ.total + 1, correct: answersThisQ.correct + (d.correct ? 1 : 0) };
              if (ev === 'bingo') onAutoBingo(d);
            }
          }
        } catch {}
        await new Promise(r => setTimeout(r, 3000));
      }
    })();
  }
  function onAutoBingo(d) {
    if (autoBingos.some(b => b.id === d.id)) return;
    autoBingos = [...autoBingos, d];
    winners = [...winners, { code: d.gridCode, atQuestion: d.atQuestion, name: d.name }];
    announce = { code: d.gridCode, name: d.name };
    if (effectsOn) blastConfetti();
    broadcast('bingo'); sfx('bingo'); save();
    setTimeout(() => { announce = null; broadcast(); }, 6000);
  }
  async function refreshDist() { try { dist = await api.get(`/api/sessions/${sessionId}/distribution/${idx}`); } catch {} }
  async function refreshBoard() { try { leaderboard = await api.get(`/api/sessions/${sessionId}/leaderboard`); participants = leaderboard; } catch {} }
  /* ---------- Question bonus (joker) ---------- */
  async function launchBonus() {
    // pioche une question hors session, mêmes filtres si possible
    try {
      const all = await api.get('/api/questions');
      const used = new Set(s.questions.map(x => x.id));
      const pool = all.filter(x => !used.has(x.id));
      if (!pool.length) return;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      paused = true;
      bonus = { q: pick, open: true, revealed: false };
      sfx('draw'); broadcast(); pushLive('bonus');
    } catch {}
  }
  function revealBonus() { if (!bonus) return; bonus = { ...bonus, open: false, revealed: true }; sfx('reveal'); broadcast(); pushLive(); }
  function closeBonus() { bonus = null; paused = false; broadcast(); pushLive(); }

  function listenRemote() {
    const tk = localStorage.getItem('docbingo_token');
    // EventSource ne permet pas d'en-tête : le token passe en query, vérifié côté serveur via le middleware ? → on utilise fetch streaming
    remoteSrc = { close: () => { remoteAbort?.abort(); } };
    let remoteAbort = new AbortController();
    (async () => {
      while (!remoteAbort.signal.aborted) {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/remote-events`, { headers: tk ? { 'X-DocBingo-Token': tk } : {}, signal: remoteAbort.signal });
          const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
          remoteOnline = true;
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
              const ev = /event: (\w+)/.exec(chunk)?.[1]; const data = /data: (.*)/.exec(chunk)?.[1];
              if (ev === 'cmd' && data) onRemoteCmd(JSON.parse(data));
            }
          }
        } catch {}
        remoteOnline = false;
        await new Promise(r => setTimeout(r, 3000));
      }
    })();
  }
  function onRemoteCmd({ cmd, arg }) {
    if (cmd === 'next') advance();
    else if (cmd === 'reveal') reveal();
    else if (cmd === 'prev') prev();
    else if (cmd === 'pause') paused = !paused;
    else if (cmd === 'plus15') secondsLeft += 15;
    else if (cmd === 'bingo') { verifyOpen = true; paused = true; if (arg) { verifyCode = String(arg); verify(); } }
    else if (cmd === 'closeslide') closeSlide();
  }
  async function newRemoteCode() { remoteCode = (await api.post(`/api/sessions/${sessionId}/remote-code`)).code; }

  /* ---------- Double écran ---------- */
  function onChannelMessage(msg) {
    if (msg.type === 'hello') { displayConnected = true; broadcast(); }
    if (msg.type === 'display-closed') displayConnected = false;
  }
  function broadcast(eventName) {
    channel?.send({
      type: 'state',
      st: { idx, phase, secondsLeft, paused, winners, announceCode: announce?.code || null, announceName: announce?.name || null, slide, dist: phase === 'revealed' ? dist : null, bonus, participants: participants.length, joinCode, leaderboard: phase === 'done' ? leaderboard.slice(0, 5) : null },
      event: eventName || null
    });
  }
  function openDisplay() {
    presenterMode = true;
    window.open(location.origin + location.pathname + '#/display/' + sessionId, 'docbingo-display-' + sessionId,
      'width=1280,height=800');
  }
  $: (idx, phase, secondsLeft, paused, winners, announce, slide, dist, bonus, participants, leaderboard, channel && broadcast());
  let _lastPaused = null;
  $: if (s && paused !== _lastPaused) { _lastPaused = paused; pushLive(); }

  /* ---------- Timer ---------- */
  function startTimer(seconds) {
    clearInterval(timerId);
    secondsLeft = seconds;
    paused = false;
    questionStartedAt = Date.now();
    answersThisQ = { total: 0, correct: 0 }; dist = null;
    timerId = setInterval(() => {
      if (paused) return;
      secondsLeft--;
      if (secondsLeft <= 5 && secondsLeft > 0) sfx('tick');
      if (secondsLeft % 10 === 0) save();
      if (secondsLeft <= 0) reveal();
    }, 1000);
  }

  /* ---------- Flow ---------- */
  function slidesAfter(i) { return pendingSlides.filter(sl => sl.afterIndex === i); }
  let slideQueue = [];
  function showSlides(list, then) {
    if (!list.length) return then();
    slideQueue = [...list]; slideNext = then; slide = slideQueue.shift(); paused = true; broadcast(); pushLive();
  }
  let slideNext = null;
  function closeSlide() {
    if (slideQueue.length) { slide = slideQueue.shift(); broadcast(); pushLive(); return; }
    slide = null; paused = false; const f = slideNext; slideNext = null; broadcast(); pushLive(); f && f();
  }
  function start() {
    showSlides(slidesAfter(-1), () => {
      idx = 0; phase = 'question'; startTimer(s.params.secondsPerQuestion); save('running'); sfx('draw'); refreshRace(); pushLive('newq');
    });
  }
  function reveal() {
    if (phase !== 'question') return;
    clearInterval(timerId);
    phase = 'revealed';
    sfx('reveal');
    broadcast('reveal');
    save();
    refreshRace();
    pushLive('reveal');
    if (hasParticipants) setTimeout(refreshDist, 400);
  }
  function advance() {
    if (slide) return closeSlide();
    if (phase === 'intro') return start();
    if (phase === 'question') return reveal();
    if (phase === 'revealed') {
      const goNext = () => {
        if (idx + 1 >= N) return finish();
        idx++; phase = 'question'; startTimer(s.params.secondsPerQuestion); save(); sfx('draw'); pushLive('newq');
      };
      showSlides(slidesAfter(idx), goNext);
    }
  }
  function sfx(ev) { if (soundsOn) playSound(ambiance, ev); }
  function prev() {
    if (idx <= 0 || phase === 'done') return;
    clearInterval(timerId);
    idx--; phase = 'revealed';
    save();
  }
  function finish() {
    clearInterval(timerId);
    phase = 'done';
    save('done');
    pushLive('done'); refreshBoard();
    if (effectsOn) blastConfetti();
    broadcast('finish');
    sfx('end');
  }
  function onKey(e) {
    if (verifyOpen) { if (e.key === 'Escape') verifyOpen = false; return; }
    if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); advance(); }
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'p') paused = !paused;
  }
  async function save(status) {
    try {
      await api.post(`/api/sessions/${sessionId}/state`, {
        currentIndex: idx,
        state: { revealed: phase === 'revealed' || phase === 'done', winners, secondsLeft },
        status: status || (phase === 'done' ? 'done' : 'running')
      });
      localStorage.setItem('docbingo_session_' + sessionId, JSON.stringify({ idx, phase, winners, at: new Date().toISOString() }));
    } catch {}
  }
  async function refreshRace() {
    if (idx < 0) return;
    try { raceStats = await api.get(`/api/sessions/${sessionId}/stats`); } catch {}
  }

  /* ---------- Bingo ---------- */
  async function verify() {
    verifyError = ''; verifyResult = null;
    try {
      const code = verifyCode.trim().toUpperCase().startsWith('G') ? verifyCode.trim().toUpperCase() : 'G-' + verifyCode.trim().padStart(3, '0');
      verifyResult = await api.get(`/api/sessions/${sessionId}/verify/${encodeURIComponent(code)}`);
    } catch { verifyError = $t('play.gridnotfound'); }
  }
  function validateBingo() {
    winners = [...winners, { code: verifyResult.code, atQuestion: idx + 1 }];
    verifyOpen = false; verifyResult = null; verifyCode = '';
    announce = winners[winners.length - 1];
    if (effectsOn) blastConfetti();
    broadcast('bingo');
    sfx('bingo');
    save();
    setTimeout(() => { announce = null; }, 6000);
  }

  /* ---------- Effects ---------- */
  function blastConfetti() {
    confetti = Array.from({ length: 90 }, (_, i) => ({
      id: Math.random(), x: Math.random() * 100, delay: Math.random() * .8,
      color: ['var(--proj-accent)', '#2a9d8f', '#e9b949', '#457b9d', '#e63946'][i % 5],
      size: 6 + Math.random() * 8, dur: 2.4 + Math.random() * 1.6
    }));
    setTimeout(() => (confetti = []), 4600);
  }
</script>

{#if !s}
  <div class="fullbg center"><div class="dim">…</div></div>

{:else if phase === 'intro'}
  <div class="fullbg center">
    <div class="intro-box">
      <div class="brand-big">DocBingo</div>
      <h1 class="session-title">{s.name}</h1>
      <div class="dim" style="margin:14px 0 30px">
        {N} {$t('play.questions')} · {$t('play.grid')} {s.params.gridSize}×{s.params.gridSize} ·
        {s.params.marking === 'correct' ? $t('mark.correct') : $t('mark.luck')} ·
        {s.params.secondsPerQuestion} s / {$t('play.question').toLowerCase()}
      </div>
      {#if joinCode}
        <div class="joinbox">
          <div class="dim" style="font-size:14px">📱 {$t('play.joinhint')}</div>
          <div class="joinurl">{location.origin}{location.pathname}#/join</div>
          <div class="joincode">{joinCode}</div>
          <div class="dim" style="font-size:14px">{participants.length} {$t('play.connected')}</div>
        </div>
      {/if}
      <div class="row" style="justify-content:center; gap:12px">
        <button class="bigbtn" on:click={start}>▶ {$t('play.start')}</button>
        <button class="bigbtn ghost" on:click={openDisplay}>🖥️ {$t('play.opendisplay')}</button>
      </div>
      <div class="dim" style="margin-top:22px; font-size:14px">{$t('play.shortcuts')}</div>
      <a class="dim" style="display:block; margin-top:8px; font-size:13px" href={'#/session/' + s.id}>← {$t('play.back')}</a>
    </div>
  </div>

{:else if phase === 'done'}
  <div class="fullbg center">
    <div class="intro-box">
      <div class="brand-big">🎉</div>
      <h1 class="session-title">{$t('play.done')}</h1>
      {#if winners.length}
        <div style="margin:20px 0; font-size:22px">
          {#each winners as w}
            <div style="margin:6px 0">🏆 {#if w.name}<b>{w.name}</b> · {/if}{$t('play.gridword')} <b style="color:var(--proj-accent)">{w.code}</b> — {$t('play.bingoat')} {w.atQuestion}</div>
          {/each}
        </div>
      {:else}
        <div class="dim" style="margin:20px 0; font-size:17px; line-height:1.6">{$t('play.nowinner')}</div>
      {/if}
      {#if leaderboard.length}
        <div class="podium">
          {#each leaderboard.slice(0, 3) as p, i}
            <div class="step s{i}"><div class="medal">{['🥇', '🥈', '🥉'][i]}</div><div class="pname">{p.name}</div><div class="pscore">{p.score} pts · {p.correct}/{p.answered}</div></div>
          {/each}
        </div>
        {#if leaderboard.length > 3}
          <div class="dim" style="font-size:14px; margin-top:8px">{leaderboard.slice(3, 10).map((p, i) => (i + 4) + '. ' + p.name + ' (' + p.score + ')').join(' · ')}</div>
        {/if}
      {/if}
      <div class="dim" style="margin-top:12px">{N} {$t('play.questionsasked')}</div>
      <div class="row" style="justify-content:center; gap:10px; margin-top:26px">
        <a class="bigbtn" style="text-decoration:none" href="#/sessions">{$t('play.backsessions')}</a>
        <a class="bigbtn ghost" style="text-decoration:none" href={'#/session/' + s.id}>📊 {$t('play.report')}</a>
      </div>
    </div>
  </div>

{:else if !presenterMode}
  <!-- ============ MODE SIMPLE ÉCRAN ============ -->
  <div class="solo">
    {#if slide}<Slide {slide} sessionName={s.name} />{:else}<Projection {s} {idx} {phase} {secondsLeft} {paused} {effectsOn} {dist} participants={participants.length} {joinCode} {bonus} />{/if}
    <div class="p-controls">
      <button on:click={() => (paused = !paused)} title="Pause (P)">{paused ? '▶' : '⏸'}</button>
      <button on:click={() => (secondsLeft += 15)} disabled={phase !== 'question'}>＋15 s</button>
      <button on:click={reveal} disabled={phase !== 'question'}>👁 {$t('play.answer')}</button>
      <button on:click={prev} disabled={idx <= 0}>⏮</button>
      <button class="primary" on:click={advance}>{phase === 'revealed' ? (idx + 1 >= N ? '🏁 ' + $t('play.finish') : '⏭ ' + $t('play.next')) : '⏭'}</button>
      <button on:click={openDisplay}>🖥️ {$t('play.presentermode')}</button>
      <button on:click={launchBonus} disabled={!!bonus || phase !== 'revealed'} title={$t('play.bonushint')}>⚡ Bonus</button>
      <button class="bingo" on:click={() => { verifyOpen = true; paused = true; }}>🎉 {$t('play.verifybingo')}</button>
      {#if winners.length}<span class="dim" style="font-size:13px">🏆 {winners.map(w => w.code).join(' · ')}</span>{/if}
    </div>
  </div>

{:else}
  <!-- ============ CONSOLE PRÉSENTATEUR ============ -->
  <div class="console">
    <div class="c-topbar">
      <span class="dim" style="font-size:13.5px">🩺 <b style="color:var(--ink)">{s.name}</b></span>
      <span class="dim" style="font-size:13.5px">{$t('play.question')} <b style="color:var(--ink)">{idx + 1} / {N}</b></span>
      <div class="progressbar"><div class="fill" style="width:{Math.round(((idx + 1) / N) * 100)}%"></div></div>
      <span class="dim" style="font-size:13px">{$t('pres.elapsed')} <b style="color:var(--ink)">{elapsedMin} min</b> · {$t('pres.remaining')} <b style="color:var(--ink)">~{remainingMin} min</b></span>
      <span class="mini-timer" class:pausedc={paused}>⏱ {phase === 'question' ? secondsLeft + ' s' : '—'}</span>
      <span class="disp-dot" class:on={displayConnected} title={displayConnected ? $t('pres.displayon') : $t('pres.displayoff')}>🖥️</span>
    </div>

    {#if slide}
      <div class="alert warn" style="margin-bottom:12px">🎬 {$t('pres.slideon')} <b>{slide.title || $t('slide.' + slide.type)}</b> — <button class="btn small" on:click={closeSlide}>⏭ {$t('pres.slidenext')}</button></div>
    {/if}
    <div class="c-grid">
      <div class="c-left">
        <div class="card">
          <div class="panel-title">📌 {$t('pres.current')} — n° {idx + 1} {#if phase === 'revealed'}<span class="tag" style="background:var(--ok);color:var(--ok-ink)">{$t('play.revealed')}</span>{/if}</div>
          <div style="font-weight:700; font-size:16.5px; line-height:1.4; margin-bottom:12px">{q.statement}</div>
          {#if q.image}<img src={'/images/' + q.image} alt="" style="max-height:120px; border-radius:8px; margin-bottom:10px" />{/if}
          <div style="display:flex; flex-direction:column; gap:7px">
            {#each q.options as opt, i}
              <div class="c-prop" class:iscorrect={q.correct.includes(i)}>
                <span class="letter">{'ABCDE'[i]}</span><span style="flex:1">{opt}</span>
                {#if q.correct.includes(i)}<span style="color:var(--ok); font-weight:800; font-size:12px">✓ {$t('pres.goodanswer')}</span>{/if}
              </div>
            {/each}
          </div>
          {#if q.explanation}
            <div class="c-explain">💡 {q.explanation}</div>
          {/if}
          {#if hasParticipants}
            <div class="answers-bar">
              📱 {answersThisQ.total} / {participants.length} {$t('pres.answered')}
              {#if phase === 'revealed'} · <b style="color:var(--ok)">{answersThisQ.correct}</b> {$t('pres.correctans')}{/if}
              {#if dist && dist.total}
                <div class="dist">
                  {#each q.options as opt, i}
                    <div class="dbar"><span class="dl" class:dgood={q.correct.includes(i)}>{'ABCDE'[i]}</span><div class="dtrack"><div class="dfill" class:dgood={q.correct.includes(i)} style="width:{Math.round(100 * (dist.counts['ABCDE'[i]] || 0) / dist.total)}%"></div></div><span class="dn">{dist.counts['ABCDE'[i]] || 0}</span></div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        {#if bonus}
          <div class="card" style="border:2px solid var(--warn)">
            <div class="panel-title">⚡ {$t('play.bonus')} — {bonus.open ? $t('play.bonusopen') : $t('play.bonusrevealed')}</div>
            <div style="font-weight:700; margin-bottom:8px">{bonus.q.statement}</div>
            <div class="muted" style="font-size:13px">{$t('play.answer')} : {bonus.q.correct.map(i => 'ABCDE'[i]).join(' + ')} — {$t('play.bonusrule')}</div>
            <div class="row" style="gap:8px; margin-top:10px">
              {#if bonus.open}<button class="btn small" on:click={revealBonus}>👁 {$t('play.answer')}</button>{/if}
              <button class="btn small secondary" on:click={closeBonus}>{$t('play.bonusclose')}</button>
            </div>
          </div>
        {/if}

        {#if nextQ}
          <div class="card">
            <div class="panel-title">⏭️ {$t('pres.nextq')}</div>
            <div style="font-size:14px; line-height:1.5">
              <span class="nq-num">{idx + 2}</span>
              <b>{nextQ.statement}</b><br>
              <span class="muted">{$t('play.answer')} : {nextQ.correct.map(i => 'ABCDE'[i]).join(' + ')}
                {#if nextQ.tags?.length}· {nextQ.tags.map(x => '#' + x).join(' ')}{/if}</span>
            </div>
          </div>
        {/if}

        {#if s.params.notes}
          <div class="card">
            <div class="panel-title">📝 {$t('pres.notes')}</div>
            <div class="muted" style="font-style:italic; line-height:1.5">{s.params.notes}</div>
          </div>
        {/if}
      </div>

      <div class="c-right">
        <div class="card">
          <div class="panel-title">🎛️ {$t('pres.controls')}</div>
          <div class="ctrl-grid">
            <button class="ctrl" on:click={() => (paused = !paused)}><span>{paused ? '▶' : '⏸'}</span>{paused ? $t('pres.resume') : 'Pause'}</button>
            <button class="ctrl" on:click={() => (secondsLeft += 15)} disabled={phase !== 'question'}><span>➕</span>+15 s</button>
            <button class="ctrl" on:click={reveal} disabled={phase !== 'question'}><span>👁️</span>{$t('play.answer')}</button>
            <button class="ctrl" on:click={prev} disabled={idx <= 0}><span>⏮️</span>{$t('pres.prev')}</button>
            <button class="ctrl primaryc" on:click={advance}><span>⏭️</span>{phase === 'revealed' ? (idx + 1 >= N ? $t('play.finish') : $t('play.next')) : $t('play.answer')}</button>
            <button class="ctrl" on:click={openDisplay}><span>🖥️</span>{$t('pres.reopen')}</button>
            <button class="ctrl" on:click={launchBonus} disabled={!!bonus || phase !== 'revealed'} title={$t('play.bonushint')}><span>⚡</span>{$t('play.bonus')}</button>
            <button class="ctrl wide dangerc" on:click={() => { verifyOpen = true; paused = true; }}><span>🎉</span>{$t('play.verifybingo')} — {$t('pres.entercode')}</button>
          </div>
        </div>

        <div class="card">
          <div class="panel-title">🕘 {$t('play.drawn')} — {idx + 1} / {N}</div>
          <div class="mini-chips">
            {#each Array(N) as _, i}
              <span class="chip" class:asked={i < idx} class:current={i === idx}>{i + 1}</span>
            {/each}
          </div>
        </div>

        {#if digitalOn}
        <div class="card">
          <div class="panel-title">👥 {$t('pres.participants')} <span class="tag" style="margin-left:auto">{participants.length}</span></div>
          <div class="muted" style="font-size:13px; line-height:1.6">
            {$t('pres.joinhelp')} <span class="url">{location.origin}{location.pathname}#/join</span> · {$t('pres.remotecode')} : <b style="font-size:20px; letter-spacing:.12em; color:var(--accent)">{joinCode || '…'}</b>
          </div>
          {#if participants.length}
            <div class="plist">
              {#each [...participants].sort((a, b) => b.score - a.score).slice(0, 12) as p, i}
                <span class="pchip" class:pbingo={p.bingoAt}>{i < 3 && phase !== 'intro' ? ['🥇', '🥈', '🥉'][i] : ''}{p.name} <b>{p.score}</b>{#if p.bingoAt} 🏆{/if}</span>
              {/each}
              {#if participants.length > 12}<span class="muted">+{participants.length - 12}</span>{/if}
            </div>
          {/if}
        </div>
        {/if}

        <div class="card">
          <div class="panel-title">📱 {$t('pres.remote')} <span class="tag" style="margin-left:auto; background:{remoteOnline ? 'var(--ok)' : 'var(--soft)'}; color:{remoteOnline ? 'var(--ok-ink)' : 'var(--soft-ink)'}">{remoteOnline ? $t('pres.remoteon') : $t('pres.remoteoff')}</span></div>
          <div class="muted" style="font-size:13px; line-height:1.6">
            {$t('pres.remotehelp')}<br>
            <span class="url">{location.origin}{location.pathname}#/remote/{sessionId}</span><br>
            {$t('pres.remotecode')} : <b style="font-size:22px; letter-spacing:.15em; color:var(--accent-2)">{remoteCode || '…'}</b>
            <button class="btn small secondary" on:click={newRemoteCode} title={$t('pres.remotenew')}>⟳</button>
          </div>
        </div>

        <div class="card">
          <div class="panel-title">ℹ️ {$t('pres.session')}
            <button class="tag" style="border:none; cursor:pointer; margin-left:auto" on:click={() => (showRace = !showRace)}>
              {showRace ? '👁 ' + $t('pres.hiderace') : '👁 ' + $t('pres.showrace')}
            </button>
          </div>
          <div class="muted" style="line-height:2; font-size:13.5px">
            {$t('pres.grids')} : <b style="color:var(--ink)">G-001 → G-{String(s.grids.length).padStart(3, '0')}</b> ({s.params.gridSize}×{s.params.gridSize})<br>
            {#if showRace && raceStats}
              {$t('pres.race')} : <b style="color:var(--accent)">{raceStats.oneAway}</b> {$t('pres.oneaway')} · <b style="color:var(--accent-2)">{raceStats.bingoNow}</b> {$t('pres.atbingo')}
              {#if s.params.marking === 'correct'}<span style="font-size:11.5px"> ({$t('pres.estimate')})</span>{/if}<br>
            {/if}
            {$t('pres.winners')} : <b style="color:var(--ink)">{winners.length ? winners.map(w => w.code).join(', ') : '—'}</b><br>
            {$t('pres.autosave')} : <b style="color:var(--ok)">✓ q. {idx + 1}</b>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Announce overlay (présentateur : avec boutons) -->
{#if announce}
  <div class="announce" class:animate={effectsOn}>
    <div>🎉 BINGO ! 🎉</div>
    <div class="a-code">{$t('play.gridword')} {announce.code}</div>
    <div>
      {#if s.params.afterBingoDefault === 'stop'}
        <button class="bigbtn" on:click={() => { announce = null; finish(); }}>🏁 {$t('play.endsession')}</button>
        <button class="bigbtn ghost" on:click={() => { announce = null; broadcast(); }}>{$t('play.continueanyway')}</button>
      {:else}
        <button class="bigbtn" on:click={() => { announce = null; broadcast(); }}>{$t('play.continue')}</button>
        <button class="bigbtn ghost" on:click={() => { announce = null; finish(); }}>{$t('play.endnow')}</button>
      {/if}
    </div>
  </div>
{/if}

{#if confetti.length}
  <div class="confetti-layer">
    {#each confetti as c (c.id)}
      <span class="confetto" style="left:{c.x}%; width:{c.size}px; height:{c.size}px; background:{c.color}; animation-duration:{c.dur}s; animation-delay:{c.delay}s"></span>
    {/each}
  </div>
{/if}

{#if verifyOpen}
  <div class="modal-bg" on:click={() => (verifyOpen = false)}>
    <div class="modal" on:click|stopPropagation>
      <h2 style="margin-bottom:12px">{$t('play.verifybingo')}</h2>
      <div class="row" style="gap:8px">
        <input placeholder={$t('play.codeplaceholder')} bind:value={verifyCode}
          on:keydown={(e) => e.key === 'Enter' && verify()} style="flex:1" />
        <button class="btn" on:click={verify}>{$t('play.verify')}</button>
      </div>
      {#if verifyError}<div class="alert error" style="margin-top:12px">✕ {verifyError}</div>{/if}
      {#if verifyResult}
        <div style="display:flex; gap:20px; margin-top:16px; flex-wrap:wrap">
          <div>
            <div class="muted" style="margin-bottom:8px">{$t('play.gridword')} {verifyResult.code} — {$t('play.highlighted')} :</div>
            <div class="v-grid" style="grid-template-columns:repeat({verifyResult.cells.length}, 44px)">
              {#each verifyResult.cells as row, r}
                {#each row as n, c}
                  <div class="v-cell" class:hit={verifyResult.asked[r][c]}>{n}</div>
                {/each}
              {/each}
            </div>
          </div>
          <div style="flex:1; min-width:230px">
            {#if verifyResult.lines.length}
              <div class="alert ok" style="margin-bottom:10px">✓ {verifyResult.lines.length} {$t('play.winninglines')}</div>
              {#if s.params.marking === 'correct'}
                <div class="muted" style="margin-bottom:8px">{$t('play.checkpaper')} :</div>
                {#each verifyResult.lines as l}
                  <div style="margin-bottom:10px">
                    <b style="font-size:13px">{l.type === 'row' ? $t('play.row') : l.type === 'col' ? $t('play.col') : $t('play.diag')} :</b>
                    {#each l.answers as a}
                      <div class="muted" style="font-size:13px">n° {a.num} → {$t('play.answer').toLowerCase()} <b style="color:var(--ok)">{a.correct}</b></div>
                    {/each}
                  </div>
                {/each}
              {:else}
                <div class="muted" style="margin-bottom:8px">{$t('play.luckauto')}</div>
              {/if}
              <button class="btn" style="width:100%; justify-content:center" on:click={validateBingo}>🎉 {$t('play.validate')}</button>
            {:else}
              <div class="alert warn">{$t('play.invalidbingo').replace('{n}', verifyResult.askedCount)}</div>
            {/if}
          </div>
        </div>
      {/if}
      <button class="btn secondary" style="margin-top:16px" on:click={() => { verifyOpen = false; paused = false; }}>{$t('play.closeresume')}</button>
    </div>
  </div>
{/if}

<style>
  .fullbg { min-height: 100vh; background: var(--proj-bg); color: var(--proj-ink); }
  .center { align-items: center; justify-content: center; display: flex; }
  .dim { color: var(--proj-dim); }
  .intro-box { text-align: center; padding: 30px; }
  .brand-big { font-size: 30px; font-weight: 800; color: var(--proj-accent); margin-bottom: 14px; letter-spacing: var(--title-spacing); }
  .session-title { font-size: 34px; text-transform: var(--title-transform); }
  .bigbtn { border: none; background: var(--proj-accent); color: #fff; font-size: 19px; font-weight: 800; padding: 16px 34px; border-radius: 12px; cursor: pointer; }
  .bigbtn.ghost { background: transparent; border: 2px solid var(--proj-dim); color: var(--proj-dim); font-size: 15px; padding: 12px 22px; margin-left: 10px; }

  .solo { min-height: 100vh; display: flex; flex-direction: column; background: var(--proj-bg); }
  .p-controls {
    display: flex; align-items: center; gap: 8px; padding: 12px 34px 16px; flex-wrap: wrap;
    background: var(--proj-bg); border-top: 1px solid color-mix(in srgb, var(--proj-dim) 22%, transparent);
  }
  .p-controls button {
    border: 1.5px solid color-mix(in srgb, var(--proj-dim) 40%, transparent); background: transparent; color: var(--proj-ink);
    border-radius: 10px; padding: 9px 14px; font-size: 14px; font-weight: 700; cursor: pointer;
  }
  .p-controls button:disabled { opacity: .3; cursor: not-allowed; }
  .p-controls button.primary { background: var(--proj-accent); border-color: var(--proj-accent); color: #fff; }
  .p-controls button.bingo { border-color: #e9b949; color: #e9b949; margin-left: auto; }

  /* Console présentateur */
  .console { min-height: 100vh; background: var(--bg); color: var(--ink); padding: 14px 18px 24px; }
  .c-topbar {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 10px 16px; margin-bottom: 14px; box-shadow: var(--shadow);
  }
  .progressbar { flex: 1; min-width: 120px; height: 8px; border-radius: 99px; background: var(--soft); overflow: hidden; }
  .progressbar .fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width .4s; }
  .mini-timer { font-size: 19px; font-weight: 800; color: var(--accent-2); font-variant-numeric: tabular-nums; }
  .mini-timer.pausedc { opacity: .5; }
  .disp-dot { opacity: .3; }
  .disp-dot.on { opacity: 1; filter: drop-shadow(0 0 4px var(--ok)); }
  .joinbox { margin: 0 auto 26px; background: color-mix(in srgb, var(--proj-panel) 70%, var(--proj-bg)); border: 1.5px dashed var(--proj-dim); border-radius: 16px; padding: 14px 26px; display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
  .joinurl { font-family: ui-monospace, monospace; font-size: 15px; color: var(--proj-ink); }
  .joincode { font-size: 46px; font-weight: 800; letter-spacing: .25em; color: var(--proj-accent); }
  .podium { display: flex; justify-content: center; align-items: flex-end; gap: 14px; margin: 22px 0 6px; }
  .step { background: color-mix(in srgb, var(--proj-panel) 80%, var(--proj-bg)); border-radius: 12px 12px 4px 4px; padding: 14px 18px 10px; min-width: 150px; }
  .step.s0 { order: 2; padding-top: 26px; border-top: 4px solid #e9b949; } .step.s1 { order: 1; border-top: 4px solid #b8c0cc; } .step.s2 { order: 3; border-top: 4px solid #c9803a; }
  .medal { font-size: 30px; } .pname { font-weight: 800; font-size: 19px; } .pscore { color: var(--proj-dim); font-size: 13px; }
  .answers-bar { margin-top: 12px; padding: 9px 12px; border-radius: 10px; background: var(--soft); font-size: 13.5px; }
  .dist { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
  .dbar { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
  .dl { width: 20px; font-weight: 800; color: var(--ink-dim); } .dl.dgood { color: var(--ok); }
  .dtrack { flex: 1; height: 10px; background: var(--panel); border-radius: 99px; overflow: hidden; }
  .dfill { height: 100%; background: var(--accent); border-radius: 99px; transition: width .4s; } .dfill.dgood { background: var(--ok); }
  .dn { width: 26px; text-align: right; color: var(--ink-dim); }
  .plist { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .pchip { background: var(--soft); border-radius: 999px; padding: 3px 10px; font-size: 12.5px; }
  .pchip.pbingo { background: color-mix(in srgb, var(--warn) 30%, var(--panel)); }
  .url { font-family: ui-monospace, monospace; font-size: 12px; background: var(--soft); padding: 2px 6px; border-radius: 5px; word-break: break-all; }
  .c-grid { display: grid; grid-template-columns: 1.25fr .95fr; gap: 14px; align-items: start; }
  .c-left, .c-right { display: flex; flex-direction: column; gap: 14px; }
  .panel-title {
    font-size: 11.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-dim);
    margin-bottom: 12px; font-weight: 800; display: flex; align-items: center; gap: 8px;
  }
  .c-prop {
    display: flex; align-items: center; gap: 10px; font-size: 14px;
    padding: 8px 11px; border-radius: 10px; background: var(--soft); border: 1.5px solid transparent;
  }
  .c-prop .letter {
    width: 27px; height: 27px; border-radius: 8px; flex-shrink: 0; font-size: 13px;
    display: flex; align-items: center; justify-content: center; background: var(--panel); font-weight: 800; color: var(--ink-dim);
  }
  .c-prop.iscorrect { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, var(--panel)); }
  .c-prop.iscorrect .letter { background: var(--ok); color: var(--ok-ink); }
  .c-explain {
    margin-top: 12px; font-size: 13px; line-height: 1.5; color: var(--ink);
    padding: 9px 13px; border-radius: 10px; background: var(--soft); border-left: 3px solid var(--accent);
  }
  .nq-num {
    display: inline-flex; align-items: center; justify-content: center; width: 27px; height: 27px;
    border-radius: 50%; background: color-mix(in srgb, var(--accent-2) 16%, var(--panel)); color: var(--accent-2);
    font-weight: 800; margin-right: 7px; font-size: 13px;
  }
  .ctrl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .ctrl {
    border: none; border-radius: 11px; padding: 11px 6px; font-size: 12.5px; font-weight: 700;
    background: var(--soft); color: var(--ink); cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .ctrl span { font-size: 17px; }
  .ctrl:hover:not(:disabled) { filter: brightness(.96); }
  .ctrl:disabled { opacity: .4; cursor: not-allowed; }
  .ctrl.primaryc { background: var(--accent); color: var(--accent-ink); }
  .ctrl.wide { grid-column: 1 / -1; flex-direction: row; font-size: 14px; padding: 12px; }
  .ctrl.dangerc { background: color-mix(in srgb, var(--accent-2) 14%, var(--panel)); color: var(--accent-2); }
  .mini-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .mini-chips .chip {
    width: 28px; height: 28px; border-radius: 7px; font-size: 12px; font-weight: 800;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--soft); color: color-mix(in srgb, var(--ink-dim) 50%, transparent);
  }
  .mini-chips .chip.asked { background: color-mix(in srgb, var(--accent) 15%, var(--panel)); color: var(--accent); }
  .mini-chips .chip.current { background: var(--accent-2); color: var(--accent-2-ink); }

  .announce {
    position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--proj-bg) 88%, transparent);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
    font-size: 52px; font-weight: 800; color: var(--proj-ink); text-align: center;
  }
  .announce.animate { animation: fadeUp .35s; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; } }
  .a-code { font-size: 30px; color: var(--proj-accent); margin-bottom: 12px; }
  .confetti-layer { position: fixed; inset: 0; pointer-events: none; z-index: 70; overflow: hidden; }
  .confetto { position: absolute; top: -20px; border-radius: 2px; animation: fall linear forwards; }
  @keyframes fall { to { transform: translateY(105vh) rotate(720deg); opacity: .7; } }
  .modal-bg { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 20px; }
  .modal { background: var(--panel); color: var(--ink); border-radius: 14px; padding: 22px 24px; max-width: 640px; width: 100%; max-height: 88vh; overflow: auto; }
  .v-grid { display: grid; gap: 4px; }
  .v-cell {
    width: 44px; height: 44px; border-radius: 8px; border: 1.5px solid var(--border);
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: var(--ink-dim);
  }
  .v-cell.hit { background: color-mix(in srgb, var(--ok) 22%, var(--panel)); border-color: var(--ok); color: var(--ink); }
  @media (max-width: 900px) { .c-grid { grid-template-columns: 1fr; } }
</style>
