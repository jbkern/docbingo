<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  import { AMBIANCES, play } from '../lib/sound.js';

  export let settings;
  export let user = null;
  let local = { ambiance: 'classic', ...settings };
  let users = [];
  let newU = { email: '', name: '', role: 'author' };
  let lastTemp = null;
  let pw = { current: '', next: '' }; let pwMsg = '';
  let collTags = ''; let collFile = null; let collResult = null; let collBusy = false;
  let allTags = [];
  $: isAdmin = user?.role === 'admin';
  async function loadUsers() { if (isAdmin) try { users = await api.get('/api/users'); } catch {} }
  async function createUser() {
    try { const r = await api.post('/api/users', newU); lastTemp = { email: r.email, password: r.tempPassword }; newU = { email: '', name: '', role: 'author' }; loadUsers(); } catch (e) { alert(e.message); }
  }
  async function updateUser(u, patch) { const r = await api.put('/api/users/' + u.id, patch); if (r.tempPassword) lastTemp = { email: u.email, password: r.tempPassword }; loadUsers(); }
  async function changePw() {
    pwMsg = '';
    try { await api.post('/api/me/password', pw); pwMsg = '✓'; pw = { current: '', next: '' }; if (user) user.mustChange = false; } catch (e) { pwMsg = e.message === 'bad_current' ? $t('acct.badcurrent') : e.message === 'too_short' ? $t('acct.tooshort') : e.message; }
  }
  async function importColl() {
    if (!collFile) return; collBusy = true; collResult = null;
    const fd = new FormData(); fd.append('file', collFile);
    const tk = localStorage.getItem('docbingo_token');
    const r = await fetch('/api/collections/import', { method: 'POST', body: fd, headers: tk ? { 'X-DocBingo-Token': tk } : {} });
    collResult = await r.json(); collBusy = false;
  }
  function exportUrl() { const tk = localStorage.getItem('docbingo_token'); return '/api/collections/export?tags=' + encodeURIComponent(collTags.split(/[,\s#]+/).filter(Boolean).join(',')); }
  async function downloadColl() {
    const tk = localStorage.getItem('docbingo_token');
    const r = await fetch(exportUrl(), { headers: tk ? { 'X-DocBingo-Token': tk } : {} });
    const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'docbingo-collection-' + (collTags.trim().replace(/[^a-z0-9]+/gi, '-') || 'complete') + '.json'; a.click();
  }
  let saved = false;
  let aiEnabled = false;
  let aiKey = '';
  let aiSaved = false;
  onMount(async () => { aiEnabled = (await api.get('/api/ai/status')).enabled; loadUsers(); try { allTags = await api.get('/api/tags'); } catch {} });
  $: if (user) loadUsers();
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

{#if user?.id}
<div class="card" style="display:flex; flex-direction:column; gap:14px; max-width:640px; margin-bottom:14px">
  <h2>{$t('acct.title')} — {user.name} <span class="tag">{user.role === 'admin' ? $t('role.admin') : $t('role.author')}</span></h2>
  <div class="muted">{user.email}</div>
  <div>
    <label>{$t('acct.changepw')}</label>
    <div class="row" style="gap:8px">
      <input type="password" placeholder={$t('acct.current')} bind:value={pw.current} style="max-width:200px" autocomplete="current-password" />
      <input type="password" placeholder={$t('acct.new')} bind:value={pw.next} style="max-width:200px" autocomplete="new-password" />
      <button class="btn small" on:click={changePw} disabled={!pw.current || pw.next.length < 8}>{$t('common.save')}</button>
      {#if pwMsg}<span class="muted">{pwMsg}</span>{/if}
    </div>
  </div>
</div>
{/if}

{#if isAdmin}
<div class="card" style="display:flex; flex-direction:column; gap:14px; max-width:640px; margin-bottom:14px">
  <h2>👥 {$t('acct.users')}</h2>
  <div class="muted" style="line-height:1.5">{$t('acct.usershelp')}</div>
  <table class="utbl">
    <thead><tr><th>{$t('acct.name')}</th><th>Email</th><th>{$t('acct.role')}</th><th>{$t('acct.qcount')}</th><th></th></tr></thead>
    <tbody>
      {#each users as u}
        <tr class:inactive={!u.active}>
          <td>{u.name}</td><td class="muted">{u.email}</td>
          <td><select value={u.role} on:change={(e) => updateUser(u, { role: e.target.value })} disabled={u.id === user.id} style="width:auto; padding:4px 8px"><option value="author">{$t('role.author')}</option><option value="admin">{$t('role.admin')}</option></select></td>
          <td>{u.questions}</td>
          <td class="row" style="gap:4px; justify-content:flex-end">
            <button class="btn small secondary" title={$t('acct.resetpw')} on:click={() => updateUser(u, { resetPassword: true })}>🔑</button>
            {#if u.id !== user.id}<button class="btn small secondary" title={u.active ? $t('acct.deactivate') : $t('acct.activate')} on:click={() => updateUser(u, { active: !u.active })}>{u.active ? '⏸' : '▶'}</button>{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="row" style="gap:8px">
    <input placeholder={$t('acct.name')} bind:value={newU.name} style="max-width:160px" />
    <input placeholder="email" bind:value={newU.email} style="max-width:220px" />
    <select bind:value={newU.role} style="width:auto"><option value="author">{$t('role.author')}</option><option value="admin">{$t('role.admin')}</option></select>
    <button class="btn small" on:click={createUser} disabled={!newU.name.trim() || !newU.email.includes('@')}>＋ {$t('acct.create')}</button>
  </div>
  {#if lastTemp}
    <div class="alert ok">🔑 {$t('acct.temp', { e: lastTemp.email })} <b style="font-family:ui-monospace,monospace; font-size:16px">{lastTemp.password}</b> — {$t('acct.temphint')}</div>
  {/if}
</div>

<div class="card" style="display:flex; flex-direction:column; gap:14px; max-width:640px; margin-bottom:14px">
  <h2>📦 {$t('coll.title')}</h2>
  <div class="muted" style="line-height:1.5">{$t('coll.help')}</div>
  <div>
    <label>{$t('coll.export')}</label>
    <div class="row" style="gap:8px">
      <input placeholder={$t('coll.tagsph')} bind:value={collTags} style="max-width:320px" list="alltags" />
      <datalist id="alltags">{#each allTags as tg}<option value={tg.name}></option>{/each}</datalist>
      <button class="btn small" on:click={downloadColl}>⬇ {$t('coll.download')}</button>
    </div>
  </div>
  <div>
    <label>{$t('coll.import')}</label>
    <div class="row" style="gap:8px">
      <input type="file" accept=".json" on:change={(e) => (collFile = e.target.files?.[0] || null)} style="max-width:320px" />
      <button class="btn small" on:click={importColl} disabled={!collFile || collBusy}>⬆ {$t('coll.importbtn')}</button>
    </div>
    {#if collResult}<div class="alert {collResult.error ? 'error' : 'ok'}" style="margin-top:8px">{collResult.error ? collResult.error : $t('coll.done', { c: collResult.created, s: collResult.skipped })}</div>{/if}
  </div>
</div>
{/if}

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
  .utbl { width: 100%; border-collapse: collapse; font-size: 13.5px; } .utbl th, .utbl td { text-align: left; padding: 6px 6px; border-bottom: 1px solid var(--border); } .utbl th { color: var(--ink-dim); font-size: 11.5px; text-transform: uppercase; }
  .utbl tr.inactive td { opacity: .45; }
  .theme-opt {
    display: flex; align-items: center; gap: 14px; padding: 12px 14px;
    border: 2px solid var(--border); border-radius: var(--radius); background: var(--panel);
    cursor: pointer; font-size: 14px; color: var(--ink); width: 100%;
  }
  .theme-opt.selected { border-color: var(--accent); }
  .dots { display: flex; gap: 4px; }
  .dot { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); }
</style>
