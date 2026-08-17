<script>
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  import { createChannel } from '../lib/sync.js';
  import Projection from '../components/Projection.svelte';
  import Slide from '../components/Slide.svelte';
  import { play as playSound } from '../lib/sound.js';

  export let sessionId;
  export let settings = { sounds: true, animations: true };

  let s = null;
  let st = null;             // {idx, phase, secondsLeft, paused, winners, announceCode}
  let connected = false;
  let confetti = [];
  let channel = null;

  $: effectsOn = (s?.params?.animations ?? settings.animations);
  $: soundsOn = (s?.params?.sounds ?? settings.sounds);

  onMount(async () => {
    s = await api.get('/api/sessions/' + sessionId);
    channel = createChannel(sessionId, onMessage);
    channel.send({ type: 'hello' });
    window.addEventListener('beforeunload', () => channel?.send({ type: 'display-closed' }));
  });
  onDestroy(() => { channel?.send({ type: 'display-closed' }); channel?.close(); });

  function onMessage(msg) {
    if (msg.type !== 'state') return;
    connected = true;
    st = msg.st;
    const amb = s?.params?.ambiance || settings.ambiance || 'classic';
    if (msg.event === 'reveal' && soundsOn) playSound(amb, 'reveal');
    if (msg.event === 'bingo' || msg.event === 'finish') {
      if (effectsOn) blastConfetti();
      if (soundsOn) playSound(amb, msg.event === 'bingo' ? 'bingo' : 'end');
    }
  }

  function blastConfetti() {
    confetti = Array.from({ length: 110 }, (_, i) => ({
      id: Math.random(), x: Math.random() * 100, delay: Math.random() * .8,
      color: ['var(--proj-accent)', '#2a9d8f', '#e9b949', '#457b9d', '#e63946'][i % 5],
      size: 6 + Math.random() * 8, dur: 2.4 + Math.random() * 1.6
    }));
    setTimeout(() => (confetti = []), 4600);
  }
</script>

{#if effectsOn && settings?.theme === 'noel'}
  <div class="snow" aria-hidden="true">{#each Array(28) as _, i}<i style="left:{(i * 37) % 100}%; animation-duration:{9 + (i % 7) * 1.7}s; animation-delay:{-(i * 1.3) % 12}s; font-size:{10 + (i % 4) * 4}px">❄</i>{/each}</div>
{/if}
{#if !s || !st || !connected}
  <div class="waitbg">
    <div style="text-align:center">
      <div style="font-size:30px; font-weight:800; color:var(--proj-accent); margin-bottom:14px">DocBingo</div>
      <div style="color:var(--proj-dim)">{$t('display.waiting')}</div>
    </div>
  </div>
{:else if st.phase === 'done'}
  <div class="waitbg">
    <div style="text-align:center">
      <div style="font-size:46px; margin-bottom:12px">🎉</div>
      <div style="font-size:34px; font-weight:800; text-transform:var(--title-transform)">{$t('play.done')}</div>
      {#if st.winners?.length}
        <div style="margin-top:18px; font-size:21px">
          {#each st.winners as w}
            <div style="margin:5px 0">🏆 {#if w.name}<b>{w.name}</b> · {/if}{$t('play.gridword')} <b style="color:var(--proj-accent)">{w.code}</b> — {$t('play.bingoat')} {w.atQuestion}</div>
          {/each}
        </div>
      {:else}
        <div style="color:var(--proj-dim); margin-top:16px; font-size:16px">{$t('play.nowinner')}</div>
      {/if}
      {#if st.leaderboard?.length}
        <div class="podium">
          {#each st.leaderboard.slice(0, 3) as p, i}
            <div class="step s{i}"><div style="font-size:34px">{['🥇', '🥈', '🥉'][i]}</div><div style="font-weight:800; font-size:22px">{p.name}</div><div style="color:var(--proj-dim)">{p.score} pts</div></div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{:else if st.slide}
  <Slide slide={st.slide} sessionName={s.name} />
{:else}
  <div class="dispwrap">
    <Projection {s} idx={st.idx} phase={st.phase} secondsLeft={st.secondsLeft} paused={st.paused} {effectsOn} dist={st.dist} participants={st.participants} joinCode={st.joinCode} bonus={st.bonus} />
  </div>
{/if}

{#if st?.announceCode}
  <div class="announce" class:animate={effectsOn}>
    <div>🎉 BINGO ! 🎉</div>
    <div class="a-code">{#if st.announceName}{st.announceName} · {/if}{$t('play.gridword')} {st.announceCode}</div>
  </div>
{/if}

{#if confetti.length}
  <div class="confetti-layer">
    {#each confetti as c (c.id)}
      <span class="confetto" style="left:{c.x}%; width:{c.size}px; height:{c.size}px; background:{c.color}; animation-duration:{c.dur}s; animation-delay:{c.delay}s"></span>
    {/each}
  </div>
{/if}

<style>
  .podium { display: flex; justify-content: center; align-items: flex-end; gap: 16px; margin-top: 26px; }
  .step { background: color-mix(in srgb, var(--proj-panel) 80%, var(--proj-bg)); border-radius: 12px 12px 4px 4px; padding: 16px 22px 12px; min-width: 170px; }
  .step.s0 { order: 2; padding-top: 30px; border-top: 4px solid #e9b949; } .step.s1 { order: 1; border-top: 4px solid #b8c0cc; } .step.s2 { order: 3; border-top: 4px solid #c9803a; }
  .waitbg { min-height: 100vh; background: var(--proj-bg); color: var(--proj-ink); display: flex; align-items: center; justify-content: center; }
  .dispwrap { min-height: 100vh; display: flex; flex-direction: column; background: var(--proj-bg); }
  .announce {
    position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--proj-bg) 88%, transparent);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
    font-size: 56px; font-weight: 800; color: var(--proj-ink); text-align: center;
  }
  .announce.animate { animation: fadeUp .35s; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; } }
  .a-code { font-size: 32px; color: var(--proj-accent); }
  .confetti-layer { position: fixed; inset: 0; pointer-events: none; z-index: 70; overflow: hidden; }
  .confetto { position: absolute; top: -20px; border-radius: 2px; animation: fall linear forwards; }
  @keyframes fall { to { transform: translateY(105vh) rotate(720deg); opacity: .7; } }
</style>
