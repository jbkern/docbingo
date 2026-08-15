<script>
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';

  let questions = [];
  let allTags = [];
  let search = '';
  let selectedTags = [];
  let logic = 'or';
  let difficulty = '';
  let qstatus = '';
  let loading = true;

  async function load() {
    loading = true;
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (selectedTags.length) { qs.set('tags', selectedTags.join(',')); qs.set('logic', logic); }
    if (difficulty) qs.set('difficulty', difficulty);
    if (qstatus) qs.set('status', qstatus);
    [questions, allTags] = await Promise.all([
      api.get('/api/questions?' + qs.toString()),
      api.get('/api/tags')
    ]);
    loading = false;
  }
  onMount(() => { load(); loadTrash(); });

  let searchTimer;
  function onSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(load, 250); }
  function toggleTag(name) {
    selectedTags = selectedTags.includes(name) ? selectedTags.filter(x => x !== name) : [...selectedTags, name];
    load();
  }
  async function duplicate(q) {
    const created = await api.post(`/api/questions/${q.id}/duplicate`);
    location.hash = '#/question/' + created.id;
  }
  // Suppression → corbeille, avec confirmation
  let toDelete = null;
  async function confirmDelete() { if (!toDelete) return; await api.del('/api/questions/' + toDelete.id); toDelete = null; load(); loadTrash(); }
  // Corbeille
  let trash = []; let showTrash = false; let trashBusy = false;
  async function loadTrash() { try { trash = await api.get('/api/questions/trash'); } catch { trash = []; } }
  async function restore(q) { await api.post(`/api/questions/${q.id}/restore`); await Promise.all([load(), loadTrash()]); }
  let emptyAsk = false;
  async function emptyTrash() { trashBusy = true; try { await api.del('/api/questions/trash'); } finally { trashBusy = false; emptyAsk = false; loadTrash(); } }
  // Sélection multiple + édition en lot des mots-clés
  let selected = new Set(); let bulkAdd = ''; let bulkRemove = ''; let bulkMsg = '';
  function toggleSel(id) { selected.has(id) ? selected.delete(id) : selected.add(id); selected = selected; }
  function selectAll() { selected = selected.size === questions.length ? new Set() : new Set(questions.map(q => q.id)); }
  const splitTags = (v) => v.split(/[,\s#]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  async function applyBulk() {
    const add = splitTags(bulkAdd), remove = splitTags(bulkRemove);
    if (!selected.size || (!add.length && !remove.length)) return;
    const r = await api.post('/api/questions/bulk-tags', { ids: [...selected], add, remove });
    bulkMsg = `✓ ${r.updated}`; bulkAdd = ''; bulkRemove = ''; setTimeout(() => (bulkMsg = ''), 2500);
    load();
  }
  function letters(q) { return q.correct.map(i => 'ABCDE'[i]).join(', '); }
</script>

<div class="row" style="margin-bottom:16px">
  <h1 class="grow">{$t('questions.title')} <span class="muted">({questions.length})</span></h1>
  <button class="btn secondary" on:click={() => (showTrash = !showTrash)} title={$t('trash.title')}>🗑 {$t('trash.title')} {#if trash.length}<span class="cnt">{trash.length}</span>{/if}</button>
  <a class="btn secondary" href="#/import">⬆ {$t('nav.import')}</a>
  <a class="btn" href="#/question/new">＋ {$t('questions.new')}</a>
</div>

{#if showTrash}
  <div class="card trashbox" style="margin-bottom:16px">
    <div class="row" style="margin-bottom:8px">
      <h2 class="grow">🗑 {$t('trash.title')} <span class="muted">({trash.length})</span></h2>
      {#if trash.length}
        {#if emptyAsk}
          <span class="muted" style="font-size:12.5px">{$t('trash.emptyconfirm')}</span>
          <button class="btn small" style="background:var(--danger)" disabled={trashBusy} on:click={emptyTrash}>{$t('trash.emptyyes')}</button>
          <button class="btn small secondary" on:click={() => (emptyAsk = false)}>{$t('common.cancel')}</button>
        {:else}
          <button class="btn small secondary" style="color:var(--danger)" on:click={() => (emptyAsk = true)}>{$t('trash.empty')}</button>
        {/if}
      {/if}
      <button class="btn small secondary" on:click={() => (showTrash = false)}>✕</button>
    </div>
    <p class="muted" style="font-size:12.5px; margin-bottom:10px">{$t('trash.help')}</p>
    {#if !trash.length}<div class="muted">{$t('trash.none')}</div>{/if}
    {#each trash as q (q.id)}
      <div class="trow">
        <div class="grow"><div style="font-weight:600">{q.statement}</div><div class="muted" style="font-size:11.5px">{q.authorName ? '✍️ ' + q.authorName + ' · ' : ''}{$t('trash.deletedon')} {q.deletedAt?.slice(0, 16).replace('T', ' ')}</div></div>
        <button class="btn small secondary" on:click={() => restore(q)}>↩ {$t('trash.restore')}</button>
      </div>
    {/each}
  </div>
{/if}

{#if toDelete}
  <div class="modal-bg" on:click|self={() => (toDelete = null)}>
    <div class="modal">
      <h2 style="margin:0 0 8px">🗑 {$t('questions.confirmdelete')}</h2>
      <p style="line-height:1.5">« {toDelete.statement.slice(0, 140)}{toDelete.statement.length > 140 ? '…' : ''} »</p>
      <p class="muted" style="font-size:12.5px">{$t('trash.deletehelp')}</p>
      <div class="row" style="gap:8px; margin-top:12px">
        <button class="btn" style="background:var(--danger)" on:click={confirmDelete}>{$t('trash.dodelete')}</button>
        <button class="btn secondary" on:click={() => (toDelete = null)}>{$t('common.cancel')}</button>
      </div>
    </div>
  </div>
{/if}

<div class="card" style="margin-bottom:16px">
  <div class="row">
    <input class="grow" placeholder={$t('common.search')} bind:value={search} on:input={onSearch} style="max-width:340px" />
    <select bind:value={qstatus} on:change={load} style="width:auto">
      <option value="">{$t('status.all')}</option>
      <option value="published">{$t('status.published')}</option><option value="proposed">{$t('status.proposed')}</option><option value="draft">{$t('status.draft')}</option>
    </select>
    <select bind:value={difficulty} on:change={load} style="width:auto">
      <option value="">{$t('diff.all')}</option>
      <option value="1">{$t('diff.1')}</option><option value="2">{$t('diff.2')}</option><option value="3">{$t('diff.3')}</option>
    </select>
    {#if selectedTags.length > 1}
      <select bind:value={logic} on:change={load} style="width:auto">
        <option value="or">{$t('logic.or')}</option>
        <option value="and">{$t('logic.and')}</option>
      </select>
    {/if}
  </div>
  {#if allTags.length}
    <div class="row" style="margin-top:12px; gap:7px">
      {#each allTags as tag}
        <button class="tag" style:outline={selectedTags.includes(tag.name) ? '2.5px solid var(--accent-2)' : 'none'}
          style="border:none" on:click={() => toggleTag(tag.name)}>
          #{tag.name} <span class="muted" style="font-size:11px">{tag.count}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if questions.length}
  <div class="bulk" class:active={selected.size}>
    <label class="chk"><input type="checkbox" checked={selected.size === questions.length && questions.length > 0} indeterminate={selected.size > 0 && selected.size < questions.length} on:change={selectAll} /> <span>{$t('bulk.selectall')}</span></label>
    <span class="muted" style="font-size:12.5px">{selected.size} {$t('bulk.selected')}</span>
    {#if selected.size}
      <input placeholder={$t('bulk.add')} bind:value={bulkAdd} style="max-width:220px" />
      <input placeholder={$t('bulk.remove')} bind:value={bulkRemove} style="max-width:220px" />
      <button class="btn small" on:click={applyBulk} disabled={!bulkAdd.trim() && !bulkRemove.trim()}>{$t('bulk.apply')}</button>
      <button class="btn small secondary" on:click={() => (selected = new Set())}>{$t('common.cancel')}</button>
      {#if bulkMsg}<span style="color:var(--ok); font-weight:800">{bulkMsg}</span>{/if}
    {/if}
  </div>
{/if}

{#if loading}
  <div class="empty">{$t('common.loading')}</div>
{:else if !questions.length}
  <div class="empty">{$t('questions.empty')}</div>
{:else}
  <div class="list">
    {#each questions as q (q.id)}
      <div class="card qcard" class:sel={selected.has(q.id)}>
        <input type="checkbox" class="selbox" checked={selected.has(q.id)} on:change={() => toggleSel(q.id)} aria-label="select" />
        <div class="grow">
          <div class="statement">{q.statement}</div>
          <div class="meta">
            <span class="badge-ok">✓ {letters(q)}</span>
            {#if q.correct.length > 1}<span class="badge-multi">multi</span>{/if}
            <span class="badge-diff d{q.difficulty}" title={$t('diff.' + q.difficulty)}>{'●'.repeat(q.difficulty)}{'○'.repeat(3 - q.difficulty)}</span>
            {#if q.caseId}<span class="badge-case">🩺 {$t('q.casebadge')}</span>{/if}
            {#if q.status && q.status !== 'published'}<span class="badge-status s-{q.status}">{$t('status.' + q.status)}</span>{/if}
            {#if q.authorName}<span class="muted" style="font-size:11.5px">✍️ {q.authorName}</span>{/if}
            {#if q.source === 'ai'}<span class="badge-ai" title={$t('q.aihint')}>🤖 IA</span>{/if}
            {#if q.image}<span>🖼️</span>{/if}
            {#each q.tags as tg}<span class="tag">#{tg}</span>{/each}
            {#if q.usedCount}<span class="muted">{q.usedCount}× {$t('questions.used')}</span>{/if}
          </div>
        </div>
        <div class="actions">
          <a class="btn small secondary" href={'#/question/' + q.id}>{$t('common.edit')}</a>
          <button class="btn small secondary" on:click={() => duplicate(q)}>{$t('common.duplicate')}</button>
          <button class="btn small secondary" style="color:var(--danger)" on:click={() => (toDelete = q)} title={$t('common.delete')}>🗑</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .list { display: flex; flex-direction: column; gap: 10px; }
  .qcard { display: flex; gap: 14px; align-items: flex-start; }
  .statement { font-weight: 600; line-height: 1.4; margin-bottom: 8px; }
  .meta { display: flex; gap: 7px; flex-wrap: wrap; align-items: center; font-size: 12.5px; }
  .badge-ok { background: color-mix(in srgb, var(--ok) 18%, var(--panel)); color: var(--ink); border-radius: 999px; padding: 3px 10px; font-weight: 800; }
  .badge-diff { font-size: 11px; letter-spacing: 1px; color: var(--ink-dim); }
  .badge-diff.d3 { color: var(--danger); } .badge-diff.d1 { color: var(--ok); }
  .badge-case { background: var(--soft); color: var(--soft-ink); border-radius: 999px; padding: 3px 9px; font-weight: 700; font-size: 11px; }
  .badge-status { border-radius: 999px; padding: 3px 9px; font-weight: 800; font-size: 11px; }
  .badge-status.s-draft { background: var(--soft); color: var(--ink-dim); }
  .badge-status.s-proposed { background: color-mix(in srgb, var(--warn) 35%, var(--panel)); color: #3a2703; }
  .badge-multi { background: var(--accent-2); color: var(--accent-2-ink); border-radius: 999px; padding: 3px 9px; font-weight: 800; font-size: 11px; }
  .actions { display: flex; gap: 6px; flex-shrink: 0; }
  .badge-ai { background: color-mix(in srgb, var(--accent-2) 30%, var(--panel)); color: var(--ink); border-radius: 999px; padding: 3px 9px; font-weight: 800; font-size: 11px; }
  .selbox { width: 18px; height: 18px; margin-top: 3px; flex: none; }
  .qcard.sel { outline: 2px solid var(--accent-2); }
  .bulk { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; padding: 8px 12px; border-radius: 10px; border: 1px dashed var(--border); }
  .bulk.active { background: var(--panel); border-style: solid; }
  .chk { display: flex; align-items: center; gap: 6px; text-transform: none; letter-spacing: 0; font-size: 13px; font-weight: 700; margin: 0; }
  .chk input { width: 18px; height: 18px; }
  .cnt { background: var(--danger); color: #fff; border-radius: 999px; padding: 1px 7px; font-size: 11px; margin-left: 4px; }
  .trashbox { border: 1.5px dashed var(--border); }
  .trow { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
  .modal-bg { position: fixed; inset: 0; background: rgba(10,20,35,.5); z-index: 900; display: flex; align-items: center; justify-content: center; padding: 14px; }
  .modal { background: var(--bg); border-radius: 14px; max-width: 520px; width: 100%; padding: 18px; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
  @media (max-width: 720px) { .qcard { flex-direction: column; } }
</style>
