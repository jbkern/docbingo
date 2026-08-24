<script>
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../lib/i18n.js';
  import InstallHint from '../lib/InstallHint.svelte';

  export let codeParam = null;
  // #/join/CODE ou #/join/CODE?g=G-014 (QR imprimé sur une grille papier)
  const _raw = String(codeParam || '');
  let code = _raw.split('?')[0].toUpperCase();
  const _g = /[?&]g=([^&]+)/.exec(_raw)?.[1];
  let name = localStorage.getItem('docbingo_pname') || '';
  let paper = _g ? decodeURIComponent(_g).toUpperCase() : '';
  let usePaper = !!_g;
  let error = '';
  let busy = false;

  // état participant
  let token = localStorage.getItem('docbingo_ptoken_' + code) || null;
  let st = null;          // /state
  let live = null;        // état diffusé
  let dist = null;        // répartition après réponse
  let myAnswer = '';      // lettres choisies pour la question courante
  let sent = null;        // {correct, addScore, joker}
  let secondsLeft = 0;
  let timerId = null;
  let board = [];
  let showBoard = false;
  let jokerMode = false;
  let abort = null;

  onMount(() => { if (token) load(); });
  onDestroy(() => { clearInterval(timerId); abort?.abort(); });

  async function join() {
    busy = true; error = '';
    try {
      const r = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, paper: usePaper ? paper : '' }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      token = d.token; localStorage.setItem('docbingo_ptoken_' + code, token); localStorage.setItem('docbingo_pname', name);
      await load();
    } catch (e) { error = $t('join.err.' + e.message) || e.message; }
    busy = false;
  }
  async function load() {
    const r = await fetch(`/api/p/${token}/state`);
    if (!r.ok) { token = null; localStorage.removeItem('docbingo_ptoken_' + code); return; }
    st = await r.json();
    applyLive(st.live);
    listen();
  }
  function applyLive(l) {
    const prevIdx = live?.idx, prevPhase = live?.phase;
    live = l || {};
    if (live.idx !== prevIdx || (live.phase === 'question' && prevPhase !== 'question')) { myAnswer = ''; sent = null; dist = null; }
    // réponse déjà donnée ?
    const mine = st?.myAnswers?.find(a => a.q === live.idx);
    if (mine && !sent) { sent = { correct: mine.correct, addScore: null }; myAnswer = mine.answer; }
    clearInterval(timerId);
    if (live.phase === 'question' && live.deadline) {
      const tick = () => { secondsLeft = Math.max(0, Math.round((live.deadline - Date.now()) / 1000)); };
      tick(); timerId = setInterval(tick, 500);
    }
  }
  function listen() {
    abort?.abort(); abort = new AbortController();
    (async () => {
      while (!abort.signal.aborted) {
        try {
          const res = await fetch(`/api/p/${token}/events`, { signal: abort.signal });
          const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
              const ev = /event: (\w+)/.exec(chunk)?.[1]; const data = /data: (.*)/.exec(chunk)?.[1];
              if (!data) continue;
              if (ev === 'state') { applyLive(JSON.parse(data)); if (live.phase === 'done') loadBoard(); }
              if (ev === 'dist') dist = JSON.parse(data);
            }
          }
        } catch {}
        await new Promise(r => setTimeout(r, 2500));
        if (!abort.signal.aborted) { try { const r = await fetch(`/api/p/${token}/state`); if (r.ok) { st = await r.json(); applyLive(st.live); } } catch {} }
      }
    })();
  }
  $: q = live?.bonus?.open ? live.bonus.q : live?.question;
  $: isBonus = !!(live?.bonus?.open);
  $: canAnswer = q && !sent && (isBonus || live?.phase === 'question');
  function pick(i) {
    if (!canAnswer) return;
    const l = 'ABCDE'[i];
    if (q.multi) myAnswer = myAnswer.includes(l) ? myAnswer.replace(l, '') : (myAnswer + l).split('').sort().join('');
    else { myAnswer = l; submit(); }
  }
  async function submit() {
    if (!myAnswer) return;
    const r = await fetch(`/api/p/${token}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qIndex: isBonus ? -1 : live.idx, answer: myAnswer }) });
    const d = await r.json();
    if (!r.ok) { if (d.error === 'closed') error = $t('join.closed'); return; }
    sent = d; st.marks = d.marks; st.jokers = d.jokers; st.bingoAt = d.bingoAt; st.score += d.addScore || 0;
    if (navigator.vibrate) navigator.vibrate(d.correct ? [30, 40, 30] : 60);
  }
  async function useJoker(num) {
    if (!jokerMode || st.jokers < 1 || st.marks.includes(num)) return;
    const r = await fetch(`/api/p/${token}/joker`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ num }) });
    const d = await r.json();
    if (r.ok) { st.marks = d.marks; st.jokers = d.jokers; st.bingoAt = d.bingoAt; jokerMode = false; }
  }
  async function loadBoard() { const r = await fetch(`/api/p/${token}/leaderboard`); if (r.ok) board = await r.json(); }
  function leave() { abort?.abort(); token = null; st = null; live = null; localStorage.removeItem('docbingo_ptoken_' + code); }
  $: drawn = live?.idx >= 0 ? live.idx + 1 : 0;
</script>

<div class="p">
  {#if !token || !st}
    <div class="box">
      <div style="text-align:center; margin-bottom:14px">
        <div style="font-size:26px; font-weight:800; color:var(--accent)">DocBingo</div>
        <div class="muted">{$t('join.subtitle')}</div>
        <div class="muted" style="font-size:11.5px; margin-top:6px; line-height:1.4">{$t('charter.joinnote')}</div>
      </div>
      <InstallHint compact />
      <label>{$t('join.code')}</label>
      <input bind:value={code} on:input={() => (code = code.toUpperCase())} maxlength="6" placeholder="ABC123" style="text-align:center; font-size:26px; letter-spacing:.25em; font-weight:800; text-transform:uppercase" />
      <label style="margin-top:12px">{$t('join.name')}</label>
      <input bind:value={name} maxlength="40" placeholder={$t('join.nameph')} on:keydown={(e) => e.key === 'Enter' && join()} />
      <label class="row" style="gap:8px; text-transform:none; margin-top:12px; font-size:14px"><input type="checkbox" bind:checked={usePaper} style="width:auto" /> {$t('join.havepaper')}</label>
      {#if usePaper}<input bind:value={paper} placeholder="G-014" style="margin-top:6px; max-width:160px" />{/if}
      {#if error}<div class="alert error" style="margin-top:10px">✕ {error}</div>{/if}
      <button class="btn" style="width:100%; justify-content:center; margin-top:16px; padding:14px; font-size:16px" on:click={join} disabled={busy || code.length < 6 || !name.trim()}>{$t('join.go')}</button>
    </div>
  {:else}
    <div class="top">
      <div><b>{st.name}</b> <span class="muted">· {st.sessionName}</span></div>
      <div class="row" style="gap:8px">
        <span class="pill">🏅 {st.score}</span>
        {#if st.jokers}<button class="pill joker" class:on={jokerMode} on:click={() => (jokerMode = !jokerMode)}>🃏 {st.jokers}</button>{/if}
      </div>
    </div>

    {#if live?.phase === 'done'}
      <div class="box" style="text-align:center">
        <div style="font-size:40px">🎉</div>
        <h2>{$t('play.done')}</h2>
        {#if st.bingoAt}<div class="alert ok" style="margin:10px 0">🏆 {$t('join.yourbingo')} {st.bingoAt}</div>{/if}
        <div style="font-size:22px; margin:8px 0">🏅 {st.score} {$t('join.points')}</div>
        {#if board.length}
          <h3 style="margin-top:14px">{$t('join.board')}</h3>
          <ol class="board">{#each board as b, i}<li class:me={b.me}><span>{i + 1}.</span><span class="grow">{b.name}</span><b>{b.score}</b></li>{/each}</ol>
        {/if}
      </div>
    {:else if live?.slide}
      <div class="box" style="text-align:center; padding:30px 18px">
        <div style="font-size:40px">{ {pause:'☕', case:'🩺', title:'🎬'}[live.slide.type] || '🎬' }</div>
        <h2>{live.slide.title || $t('slide.' + live.slide.type)}</h2>
        {#if live.slide.text}<p class="muted" style="margin-top:8px; white-space:pre-line">{live.slide.text}</p>{/if}
      </div>
    {:else if q}
      <div class="box">
        <div class="row" style="justify-content:space-between; margin-bottom:8px">
          <span class="num" class:bonus={isBonus}>{isBonus ? '⚡ ' + $t('join.bonus') : '#' + (live.idx + 1)}</span>
          {#if live.phase === 'question' && !isBonus}<span class="timer" class:warn={secondsLeft <= 10}>⏱ {secondsLeft}</span>{/if}
        </div>
        <div class="stmt">{q.statement}</div>
        {#if q.image}<img src={'/images/' + q.image} alt="" style="width:100%; border-radius:10px; margin:8px 0" />{/if}
        <div class="opts">
          {#each q.options as opt, i}
            <button class="opt" class:sel={myAnswer.includes('ABCDE'[i])}
              class:good={q.correct && q.correct.includes(i)} class:bad={q.correct && !q.correct.includes(i) && myAnswer.includes('ABCDE'[i])}
              disabled={!canAnswer} on:click={() => pick(i)}>
              <span class="l">{'ABCDE'[i]}</span><span>{opt}</span>
              {#if dist && dist.total}<span class="pct">{Math.round(100 * (dist.counts['ABCDE'[i]] || 0) / dist.total)} %</span>{/if}
            </button>
          {/each}
        </div>
        {#if q.multi && canAnswer}<button class="btn" style="width:100%; justify-content:center; margin-top:10px" on:click={submit} disabled={!myAnswer}>{$t('join.validate')} {myAnswer}</button>{/if}
        {#if sent}
          <div class="alert {sent.correct ? 'ok' : 'error'}" style="margin-top:10px">
            {sent.correct ? '✓ ' + $t('join.correct') : '✕ ' + $t('join.wrong')}
            {#if sent.addScore}<b>+{sent.addScore}</b>{/if}
            {#if sent.joker}🃏 {$t('join.jokerwon')}{/if}
            {#if sent.bingoAt && !st.bingoShown}<div style="margin-top:4px">🎉 <b>BINGO !</b> {$t('join.bingoauto')}</div>{/if}
          </div>
        {:else if live.phase === 'revealed' && !isBonus}
          <div class="alert warn" style="margin-top:10px">{$t('join.noanswer')}</div>
        {/if}
        {#if q.explanation}<div class="muted" style="margin-top:8px; font-size:13.5px">💡 {q.explanation}</div>{/if}
      </div>
    {:else}
      <div class="box" style="text-align:center; padding:26px"><div class="muted">{$t('join.waiting')}</div></div>
    {/if}

    {#if st.grid}
      <div class="box">
        <div class="row" style="justify-content:space-between; margin-bottom:8px">
          <b>{$t('join.mygrid')} {st.grid.code}</b>
          {#if jokerMode}<span class="muted" style="font-size:12px">{$t('join.jokerpick')}</span>{/if}
        </div>
        <div class="grid" style="grid-template-columns:repeat({st.grid.cells.length}, 1fr)">
          {#each st.grid.cells as row}{#each row as n}
            <button class="cell" class:marked={st.marks.includes(n)} class:drawn={n <= drawn && !st.marks.includes(n)} class:pick={jokerMode && !st.marks.includes(n)} on:click={() => useJoker(n)}>{n}</button>
          {/each}{/each}
        </div>
        {#if st.bingoAt}<div class="alert ok" style="margin-top:8px">🏆 BINGO {$t('join.atq')} {st.bingoAt}</div>{/if}
        <div class="muted" style="font-size:12px; margin-top:6px">{st.marking === 'correct' ? $t('join.rulecorrect') : $t('join.ruleluck')}</div>
      </div>
    {/if}
    <button class="link" on:click={leave}>{$t('join.leave')}</button>
  {/if}
  <div class="muted" style="text-align:center; font-size:11px; margin-top:16px">DocBingo · <a href="#/about" style="color:inherit">{$t('about.title')}</a></div>
</div>

<style>
  .p { min-height: 100vh; background: var(--bg); color: var(--ink); padding: 14px 12px 40px; max-width: 520px; margin: 0 auto; }
  .box { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 16px; margin-bottom: 12px; }
  .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 14px; }
  .pill { background: var(--soft); color: var(--soft-ink); border-radius: 999px; padding: 4px 10px; font-weight: 800; border: none; font-size: 14px; }
  .pill.joker { cursor: pointer; } .pill.joker.on { background: var(--warn); color: #3a2703; }
  .num { font-weight: 800; color: var(--accent); font-size: 15px; } .num.bonus { color: var(--warn); }
  .timer { font-weight: 800; color: var(--ok); } .timer.warn { color: var(--danger); }
  .stmt { font-size: 17px; font-weight: 700; line-height: 1.4; margin-bottom: 10px; }
  .opts { display: flex; flex-direction: column; gap: 8px; }
  .opt { display: flex; align-items: center; gap: 10px; text-align: left; border: 2px solid var(--border); background: var(--panel); color: var(--ink); border-radius: 12px; padding: 12px; font-size: 15px; cursor: pointer; }
  .opt .l { width: 30px; height: 30px; border-radius: 8px; background: var(--soft); color: var(--soft-ink); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; }
  .opt.sel { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--panel)); }
  .opt.good { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, var(--panel)); } .opt.good .l { background: var(--ok); color: var(--ok-ink); }
  .opt.bad { border-color: var(--danger); }
  .opt:disabled { cursor: default; opacity: .9; }
  .pct { margin-left: auto; font-size: 12px; color: var(--ink-dim); font-weight: 700; }
  .grid { display: grid; gap: 5px; }
  .cell { aspect-ratio: 1; border-radius: 9px; border: 1.5px solid var(--border); background: var(--panel); font-weight: 800; font-size: 15px; color: var(--ink-dim); }
  .cell.drawn { border-color: var(--accent); color: var(--accent); }
  .cell.marked { background: var(--ok); border-color: var(--ok); color: var(--ok-ink); }
  .cell.pick { border-style: dashed; border-color: var(--warn); }
  .board { list-style: none; padding: 0; margin: 6px 0 0; }
  .board li { display: flex; gap: 8px; padding: 6px 8px; border-radius: 8px; }
  .board li.me { background: var(--soft); font-weight: 800; }
  .link { background: none; border: none; color: var(--ink-dim); text-decoration: underline; margin: 8px auto 0; display: block; cursor: pointer; font-size: 13px; }
</style>
