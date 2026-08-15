<script>
  import { t } from '../lib/i18n.js';
  export let s;             // session (with questions)
  export let idx = 0;       // current question index
  export let phase = 'question'; // question | revealed
  export let secondsLeft = 0;
  export let paused = false;
  export let effectsOn = true;
  export let dist = null;        // répartition des réponses (boîtier)
  export let participants = 0;
  export let joinCode = null;
  export let bonus = null;

  $: q = s?.questions?.[idx];
  $: N = s?.questions?.length || 0;
  $: timerPct = s ? Math.max(0, secondsLeft / s.params.secondsPerQuestion) : 0;
  $: correctLetters = q ? q.correct.map(i => 'ABCDE'[i]).join(' + ') : '';
</script>

{#if s && q}
  <div class="proj">
    <div class="p-head">
      <span class="dim">🩺 <b style="color:var(--proj-ink)">{s.name}</b>{#if joinCode} · 📱 <b style="color:var(--proj-accent); letter-spacing:.12em">{joinCode}</b>{#if participants} · {participants} 👥{/if}{/if}</span>
      <span class="dim">{$t('play.question')} <b style="color:var(--proj-ink); font-size:19px">{idx + 1}</b> / {N}</span>
    </div>

    {#if bonus}
      <div class="bonus-banner">⚡ {$t('play.bonus')} — {bonus.open ? $t('play.bonusopenpublic') : $t('play.answer') + ' : ' + bonus.q.correct.map(i => 'ABCDE'[i]).join(' + ')}<div class="bq">{bonus.q.statement}</div>
        <div class="bopts">{#each bonus.q.options as o, i}<span class:bgood={!bonus.open && bonus.q.correct.includes(i)}><b>{'ABCDE'[i]}</b> {o}</span>{/each}</div></div>
    {/if}

    <div class="p-main">
      <div class="ball-col">
        {#key idx}
          <div class="ball" class:animate={effectsOn}>{idx + 1}</div>
        {/key}
        <div class="dim" style="text-align:center; font-size:15px">{$t('play.lookfor')} <b style="color:var(--proj-accent)">{idx + 1}</b><br>{$t('play.onyourgrid')}</div>
      </div>

      <div class="q-col">
        <div class="q-text">{q.statement}</div>
        {#if q.image}<img class="q-img" src={'/images/' + q.image} alt="" />{/if}
        <div class="props" class:many={q.options.length > 4}>
          {#each q.options as opt, i}
            <div class="prop" class:good={phase === 'revealed' && q.correct.includes(i)} class:bad={phase === 'revealed' && !q.correct.includes(i)}>
              <span class="letter">{'ABCDE'[i]}</span><span style="flex:1">{opt}</span>
              {#if phase === 'revealed' && dist && dist.total}
                <span class="dpct"><span class="dbarp" style="width:{Math.round(100 * (dist.counts['ABCDE'[i]] || 0) / dist.total)}%"></span><span>{Math.round(100 * (dist.counts['ABCDE'[i]] || 0) / dist.total)} %</span></span>
              {/if}
            </div>
          {/each}
        </div>
        {#if phase === 'revealed'}
          <div class="explain">
            <b>{$t('play.answer')} : {correctLetters}.</b>
            {#if q.explanation}&nbsp;{q.explanation}{/if}
          </div>
        {/if}
      </div>

      <div class="timer-col">
        {#if phase === 'question'}
          <div class="timer" class:warning={secondsLeft <= 10} class:paused>
            <svg width="130" height="130" viewBox="0 0 130 130">
              <circle cx="65" cy="65" r="57" fill="none" stroke="var(--proj-chip)" stroke-width="9" />
              <circle cx="65" cy="65" r="57" fill="none" class="arc" stroke-width="9" stroke-linecap="round"
                stroke-dasharray="358" stroke-dashoffset={358 * (1 - timerPct)} transform="rotate(-90 65 65)" />
            </svg>
            <div class="t-val">{paused ? '⏸' : secondsLeft}</div>
          </div>
          <div class="dim" style="font-size:13px; text-align:center">{$t('play.autoreveal')}</div>
        {:else}
          <div class="revealed-mark">✓</div>
          <div class="dim" style="font-size:13px; text-align:center">{$t('play.revealed')}</div>
        {/if}
      </div>
    </div>

    <div class="p-history">
      <span class="dim" style="font-size:11px; letter-spacing:.08em; text-transform:uppercase">{$t('play.drawn')} · {idx + 1} / {N}</span>
      <div class="chips">
        {#each Array(N) as _, i}
          <span class="chip" class:asked={i < idx} class:current={i === idx}>{i + 1}</span>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .proj { flex: 1; min-height: 0; background: var(--proj-bg); color: var(--proj-ink); display: flex; flex-direction: column; }
  .dim { color: var(--proj-dim); }
  .p-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 34px 6px; font-size: 15px; }
  .p-main { flex: 1; display: grid; grid-template-columns: 170px 1fr 160px; gap: 26px; padding: 10px 34px; align-items: start; }
  .ball-col { display: flex; flex-direction: column; align-items: center; gap: 12px; padding-top: 10px; }
  .ball {
    width: 130px; height: 130px; border-radius: var(--proj-ball-radius);
    background: var(--proj-accent); color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 800;
    box-shadow: 0 10px 34px color-mix(in srgb, var(--proj-accent) 45%, transparent);
  }
  .ball.animate { animation: pop .55s cubic-bezier(.2, 1.6, .4, 1); }
  @keyframes pop { 0% { transform: scale(.2) rotate(-30deg); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  .q-col { padding-top: 4px; }
  .q-text { font-size: clamp(20px, 3.2vw, 30px); font-weight: 700; line-height: 1.35; margin-bottom: 18px; }
  .q-img { max-height: 200px; max-width: 45%; float: right; margin: 0 0 12px 16px; border-radius: 10px; }
  .props { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .props.many { grid-template-columns: 1fr; }
  .prop {
    display: flex; align-items: center; gap: 13px; font-size: clamp(15px, 1.9vw, 19px);
    background: var(--proj-panel); border: 1.5px solid var(--proj-chip);
    border-radius: 13px; padding: 13px 16px; transition: all .35s;
  }
  .prop .letter {
    flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px;
    background: var(--proj-chip); color: var(--proj-chip-ink);
    display: flex; align-items: center; justify-content: center; font-weight: 800;
  }
  .prop.good { border-color: #2a9d8f; background: color-mix(in srgb, #2a9d8f 14%, var(--proj-panel)); box-shadow: 0 0 22px rgba(42,157,143,.3); }
  .prop.good .letter { background: #2a9d8f; color: #fff; }
  .prop.bad { opacity: .35; }
  .dpct { position: relative; width: 84px; height: 22px; border-radius: 6px; background: var(--proj-chip); overflow: hidden; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; flex-shrink: 0; }
  .dbarp { position: absolute; left: 0; top: 0; bottom: 0; background: color-mix(in srgb, var(--proj-accent) 55%, transparent); transition: width .5s; }
  .dpct span:last-child { position: relative; }
  .bonus-banner { margin: 6px 34px 0; padding: 12px 18px; border-radius: 12px; background: color-mix(in srgb, #e9b949 18%, var(--proj-panel)); border: 2px solid #e9b949; font-weight: 800; font-size: 16px; }
  .bq { font-size: 20px; margin-top: 6px; }
  .bopts { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; font-weight: 500; font-size: 15px; }
  .bopts .bgood { color: #2a9d8f; font-weight: 800; }
  .explain {
    margin-top: 16px; padding: 13px 17px; border-radius: 12px; font-size: 16px; line-height: 1.5;
    background: color-mix(in srgb, var(--proj-accent) 9%, var(--proj-panel)); border-left: 4px solid var(--proj-accent);
    animation: fadeUp .4s;
  }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; } }
  .timer-col { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 10px; }
  .timer { position: relative; }
  .timer .arc { stroke: #2a9d8f; transition: stroke-dashoffset 1s linear; }
  .timer.warning .arc { stroke: var(--proj-accent); }
  .timer.paused { opacity: .55; }
  .t-val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 38px; font-weight: 800; }
  .revealed-mark {
    width: 110px; height: 110px; border-radius: 50%; background: #2a9d8f; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 800;
  }
  .p-history { padding: 10px 34px 16px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
  .chip {
    width: 34px; height: 34px; border-radius: 9px; font-size: 13.5px; font-weight: 800;
    display: inline-flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--proj-panel) 60%, var(--proj-bg)); color: color-mix(in srgb, var(--proj-dim) 45%, transparent);
  }
  .chip.asked { background: var(--proj-chip); color: var(--proj-chip-ink); }
  .chip.current { background: var(--proj-accent); color: #fff; animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
  @media (max-width: 900px) {
    .p-main { grid-template-columns: 1fr; }
    .ball-col { flex-direction: row; justify-content: center; }
    .timer-col { padding-top: 0; }
    .q-img { float: none; max-width: 100%; }
  }
</style>
