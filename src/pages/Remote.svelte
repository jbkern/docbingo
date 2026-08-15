<script>
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../lib/i18n.js';

  export let sessionId;
  let code = localStorage.getItem('docbingo_remote_' + sessionId) || '';
  let info = null;
  let error = '';
  let bingoCode = '';
  let flash = '';
  let poll = null;

  async function connect() {
    error = '';
    try {
      const r = await fetch(`/api/remote/${sessionId}/${encodeURIComponent(code)}/info`);
      if (!r.ok) throw new Error();
      info = await r.json();
      localStorage.setItem('docbingo_remote_' + sessionId, code);
      clearInterval(poll); poll = setInterval(refresh, 4000);
    } catch { error = $t('remote.badcode'); info = null; }
  }
  async function refresh() {
    try { const r = await fetch(`/api/remote/${sessionId}/${encodeURIComponent(code)}/info`); if (r.ok) info = await r.json(); } catch {}
  }
  async function send(cmd, arg = null) {
    if (navigator.vibrate) navigator.vibrate(15);
    try {
      const r = await fetch(`/api/remote/${sessionId}/${encodeURIComponent(code)}/cmd`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd, arg }) });
      const d = await r.json();
      flash = d.listeners ? '✓' : $t('remote.noconsole');
      setTimeout(() => (flash = ''), 1200);
      setTimeout(refresh, 600);
    } catch { flash = '✕'; }
  }
  onMount(() => { if (code) connect(); });
  onDestroy(() => clearInterval(poll));
</script>

<div class="rem">
  <div class="head"><b>DocBingo</b> · {$t('remote.title')}</div>
  {#if !info}
    <div class="box">
      <p class="muted" style="text-align:center; margin-bottom:12px">{$t('remote.entercode')}</p>
      <input inputmode="numeric" maxlength="4" bind:value={code} placeholder="0000" style="text-align:center; font-size:30px; letter-spacing:.3em; font-weight:800"
        on:keydown={(e) => e.key === 'Enter' && connect()} />
      {#if error}<div style="color:var(--danger); font-weight:700; text-align:center; margin-top:8px">{error}</div>{/if}
      <button class="big primary" on:click={connect} disabled={code.length < 4}>{$t('remote.connect')}</button>
    </div>
  {:else}
    <div class="box">
      <div class="muted" style="text-align:center; font-size:13px">{info.name}</div>
      <div class="status">{$t('play.question')} <b>{Math.max(0, info.currentIndex + 1)}</b> / {info.total} {#if flash}<span class="flash">{flash}</span>{/if}</div>
      <div class="grid">
        <button on:click={() => send('prev')}>⏮<span>{$t('pres.prev')}</span></button>
        <button on:click={() => send('pause')}>⏯<span>Pause</span></button>
        <button on:click={() => send('plus15')}>＋15<span>s</span></button>
        <button on:click={() => send('reveal')}>👁<span>{$t('play.answer')}</span></button>
        <button class="primary" on:click={() => send('next')}>⏭<span>{$t('play.next')}</span></button>
        <button class="danger" on:click={() => send('bingo', bingoCode || null)}>🎉<span>{$t('play.verifybingo')}</span></button>
      </div>
      <input bind:value={bingoCode} placeholder={$t('play.codeplaceholder')} style="margin-top:10px" />
      <div class="muted" style="text-align:center; font-size:12px; margin-top:12px">{$t('remote.hint')}</div>
      <button class="link" on:click={() => { info = null; localStorage.removeItem('docbingo_remote_' + sessionId); }}>{$t('remote.disconnect')}</button>
    </div>
  {/if}
</div>

<style>
  .rem { min-height: 100vh; background: var(--bg); color: var(--ink); padding: 18px 16px 40px; max-width: 460px; margin: 0 auto; }
  .head { text-align: center; color: var(--ink-dim); margin-bottom: 14px; font-size: 14px; }
  .box { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
  .status { text-align: center; font-size: 18px; margin: 8px 0 14px; }
  .flash { color: var(--ok); font-weight: 800; margin-left: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .grid button, .big {
    border: none; border-radius: 14px; background: var(--soft); color: var(--ink); font-size: 26px; font-weight: 800;
    padding: 18px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; touch-action: manipulation;
  }
  .grid button span { font-size: 12px; font-weight: 700; color: var(--ink-dim); }
  .grid button:active, .big:active { filter: brightness(.9); transform: scale(.98); }
  .primary { background: var(--accent) !important; color: var(--accent-ink) !important; }
  .primary span { color: var(--accent-ink) !important; opacity: .85; }
  .danger { background: color-mix(in srgb, var(--accent-2) 16%, var(--panel)) !important; color: var(--accent-2) !important; }
  .danger span { color: var(--accent-2) !important; }
  .big { width: 100%; margin-top: 12px; font-size: 17px; padding: 14px; }
  .link { background: none; border: none; color: var(--ink-dim); text-decoration: underline; margin: 14px auto 0; display: block; cursor: pointer; font-size: 13px; }
</style>
