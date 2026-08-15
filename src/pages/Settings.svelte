<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  import { AMBIANCES, play } from '../lib/sound.js';

  export let settings;
  let local = { ambiance: 'classic', ...settings };
  let saved = false;
  let aiEnabled = false;
  let aiKey = '';
  let aiSaved = false;
  onMount(async () => { aiEnabled = (await api.get('/api/ai/status')).enabled; });
  async function saveKey() {
    const r = await api.put('/api/ai/key', { key: aiKey });
    aiEnabled = r.enabled; aiKey = ''; aiSaved = true; setTimeout(() => (aiSaved = false), 1800);
  }
  async function removeKey() { const r = await api.put('/api/ai/key', { key: '' }); aiEnabled = r.enabled; }

  const themes = [
    { id: 'suisse', colors: ['#f7f7f5', '#16324f', '#e63946'] },
    { id: 'neon', colors: ['#0b1c2c', '#14b8a6', '#fbbf24'] },
    { id: 'pop', colors: ['#fff7f2', '#7c3aed', '#ff6b5e'] }
  ];
  const langs = [
    { id: 'fr', name: 'Français' },
    { id: 'en', name: 'English' },
    { id: 'de', name: 'Deutsch' }
  ];

  async function save() {
    await api.put('/api/settings', local);
    window.dispatchEvent(new CustomEvent('docbingo:settings', { detail: local }));
    saved = true;
    setTimeout(() => (saved = false), 1800);
  }
</script>

<h1 style="margin-bottom:18px">{$t('settings.title')}</h1>

<div class="card" style="display:flex; flex-direction:column; gap:22px; max-width:640px">
  <div>
    <label>{$t('settings.theme')}</label>
    <div style="display:flex; flex-direction:column; gap:8px">
      {#each themes as th}
        <button class="theme-opt" class:selected={local.theme === th.id} on:click={() => { local.theme = th.id; save(); }}>
          <span class="dots">
            {#each th.colors as c}<span class="dot" style="background:{c}"></span>{/each}
          </span>
          <span style="text-align:left"><b>{$t('theme.' + th.id)}</b><br><small class="muted">{$t('theme.' + th.id + '.desc')}</small></span>
          {#if local.theme === th.id}<span style="margin-left:auto; font-weight:800; color:var(--ok)">✓</span>{/if}
        </button>
      {/each}
    </div>
  </div>

  <div>
    <label for="lg">{$t('settings.lang')}</label>
    <select id="lg" bind:value={local.lang} on:change={save} style="max-width:280px">
      {#each langs as l}<option value={l.id}>{l.name}</option>{/each}
    </select>
  </div>

  <div class="row" style="gap:26px">
    <label class="row" style="gap:8px; text-transform:none; font-size:14.5px; width:auto; margin:0">
      <input type="checkbox" bind:checked={local.sounds} on:change={save} style="width:auto" /> {$t('settings.sounds')}
    </label>
    <label class="row" style="gap:8px; text-transform:none; font-size:14.5px; width:auto; margin:0">
      <input type="checkbox" bind:checked={local.animations} on:change={save} style="width:auto" /> {$t('settings.animations')}
    </label>
  </div>

  <div>
    <label>{$t('settings.ambiance')}</label>
    <div class="row" style="gap:8px">
      {#each Object.entries(AMBIANCES) as [id, a]}
        <button class="btn small" class:secondary={local.ambiance !== id} on:click={() => { local.ambiance = id; save(); play(id, 'reveal'); }}>{a.name[$lang] || a.name.fr}</button>
      {/each}
      <button class="btn small secondary" on:click={() => play(local.ambiance, 'bingo')}>▶ {$t('settings.preview')}</button>
    </div>
    <div class="muted" style="margin-top:5px">{$t('settings.ambiancehint')}</div>
  </div>

  <div>
    <label>{$t('settings.ai')}</label>
    {#if aiEnabled}
      <div class="alert ok" style="margin-bottom:8px">✓ {$t('settings.aion')} <button class="btn small secondary" style="margin-left:auto" on:click={removeKey}>{$t('settings.airemove')}</button></div>
    {:else}
      <div class="muted" style="margin-bottom:8px; line-height:1.5">{$t('settings.aihelp')}</div>
    {/if}
    <div class="row" style="gap:8px">
      <input type="password" bind:value={aiKey} placeholder="sk-ant-…" style="max-width:340px" autocomplete="off" />
      <button class="btn small" on:click={saveKey} disabled={!aiKey.trim()}>{aiEnabled ? $t('settings.aireplace') : $t('settings.aisave')}</button>
      {#if aiSaved}<span class="muted">✓</span>{/if}
    </div>
  </div>

  <div>
    <label>{$t('settings.help')}</label>
    <a class="btn secondary" href="/guide.html" target="_blank">📖 {$t('settings.openguide')}</a>
  </div>

  <div>
    <label>{$t('settings.backup')}</label>
    <a class="btn secondary" href="/api/export" download>⬇ {$t('settings.export')}</a>
    <div class="muted" style="margin-top:6px">{$t('settings.exporthint')}</div>
  </div>

  {#if saved}<div class="alert ok">✓ {$t('settings.saved')}</div>{/if}
</div>

<style>
  .theme-opt {
    display: flex; align-items: center; gap: 14px; padding: 12px 14px;
    border: 2px solid var(--border); border-radius: var(--radius); background: var(--panel);
    cursor: pointer; font-size: 14px; color: var(--ink); width: 100%;
  }
  .theme-opt.selected { border-color: var(--accent); }
  .dots { display: flex; gap: 4px; }
  .dot { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
</style>
