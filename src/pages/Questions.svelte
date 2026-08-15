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
  onMount(load);

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
  async function remove(q) {
    if (!confirm(`${$t('questions.confirmdelete')} « ${q.statement.slice(0, 60)}… » ?`)) return;
    await api.del('/api/questions/' + q.id);
    load();
  }
  function letters(q) { return q.correct.map(i => 'ABCDE'[i]).join(', '); }
</script>

<div class="row" style="margin-bottom:16px">
  <h1 class="grow">{$t('questions.title')} <span class="muted">({questions.length})</span></h1>
  <a class="btn secondary" href="#/import">⬆ {$t('nav.import')}</a>
  <a class="btn" href="#/question/new">＋ {$t('questions.new')}</a>
</div>

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

{#if loading}
  <div class="empty">{$t('common.loading')}</div>
{:else if !questions.length}
  <div class="empty">{$t('questions.empty')}</div>
{:else}
  <div class="list">
    {#each questions as q (q.id)}
      <div class="card qcard">
        <div class="grow">
          <div class="statement">{q.statement}</div>
          <div class="meta">
            <span class="badge-ok">✓ {letters(q)}</span>
            {#if q.correct.length > 1}<span class="badge-multi">multi</span>{/if}
            <span class="badge-diff d{q.difficulty}" title={$t('diff.' + q.difficulty)}>{'●'.repeat(q.difficulty)}{'○'.repeat(3 - q.difficulty)}</span>
            {#if q.caseId}<span class="badge-case">🩺 {$t('q.casebadge')}</span>{/if}
            {#if q.status && q.status !== 'published'}<span class="badge-status s-{q.status}">{$t('status.' + q.status)}</span>{/if}
            {#if q.authorName}<span class="muted" style="font-size:11.5px">✍️ {q.authorName}</span>{/if}
            {#if q.image}<span>🖼️</span>{/if}
            {#each q.tags as tg}<span class="tag">#{tg}</span>{/each}
            {#if q.usedCount}<span class="muted">{q.usedCount}× {$t('questions.used')}</span>{/if}
          </div>
        </div>
        <div class="actions">
          <a class="btn small secondary" href={'#/question/' + q.id}>{$t('common.edit')}</a>
          <button class="btn small secondary" on:click={() => duplicate(q)}>{$t('common.duplicate')}</button>
          <button class="btn small secondary" style="color:var(--danger)" on:click={() => remove(q)}>✕</button>
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
  @media (max-width: 720px) { .qcard { flex-direction: column; } }
</style>
