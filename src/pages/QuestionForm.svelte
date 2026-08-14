<script>
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api, resizeImage } from '../lib/api.js';

  export let id; // 'new' or question id

  let q = { statement: '', options: ['', '', '', ''], correct: [], image: null, explanation: '', tags: [] };
  let allTags = [];
  let tagInput = '';
  let error = '';
  let duplicates = [];
  let saving = false;
  let isNew = true;

  onMount(async () => {
    allTags = await api.get('/api/tags');
    if (id && id !== 'new') {
      isNew = false;
      q = await api.get('/api/questions/' + id);
    }
  });

  function toggleCorrect(i) {
    q.correct = q.correct.includes(i) ? q.correct.filter(x => x !== i) : [...q.correct, i].sort();
  }
  function addOption() { if (q.options.length < 5) q.options = [...q.options, '']; }
  function removeOption(i) {
    q.options = q.options.filter((_, x) => x !== i);
    q.correct = q.correct.filter(c => c !== i).map(c => (c > i ? c - 1 : c));
  }
  function addTag(name) {
    const clean = (name || tagInput).trim().replace(/^#/, '').toLowerCase();
    if (clean && !q.tags.includes(clean)) q.tags = [...q.tags, clean];
    tagInput = '';
  }
  function removeTag(tg) { q.tags = q.tags.filter(x => x !== tg); }

  $: suggestions = tagInput
    ? allTags.filter(tg => tg.name.startsWith(tagInput.toLowerCase().replace(/^#/, '')) && !q.tags.includes(tg.name)).slice(0, 6)
    : [];

  let dupTimer;
  function checkDuplicates() {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(async () => {
      if (q.statement.trim().length > 15) {
        duplicates = await api.post('/api/questions/check-duplicate', { statement: q.statement, excludeId: isNew ? null : Number(id) });
      } else duplicates = [];
    }, 400);
  }

  async function onImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await resizeImage(file);
    const { filename } = await api.upload(resized);
    q.image = filename;
  }

  async function save() {
    error = '';
    saving = true;
    try {
      const trimmed = { ...q, options: q.options.filter(o => o.trim()) };
      // remap correct indexes after removing empty options
      const kept = q.options.map((o, i) => o.trim() ? i : null).filter(i => i !== null);
      trimmed.correct = q.correct.filter(c => kept.includes(c)).map(c => kept.indexOf(c));
      if (isNew) await api.post('/api/questions', trimmed);
      else await api.put('/api/questions/' + id, trimmed);
      location.hash = '#/questions';
    } catch (e) { error = e.message; }
    saving = false;
  }
</script>

<div class="row" style="margin-bottom:16px">
  <a href="#/questions" class="muted" style="text-decoration:none">← {$t('questions.title')}</a>
</div>
<h1 style="margin-bottom:16px">{isNew ? $t('questions.new') : $t('common.edit')}</h1>

{#if error}<div class="alert error" style="margin-bottom:14px">⚠️ {error}</div>{/if}
{#if duplicates.length}
  <div class="alert warn" style="margin-bottom:14px">
    <span>⚠️</span>
    <span>{$t('q.dupwarn')}
      {#each duplicates as d}<br>· <a href={'#/question/' + d.id}>{d.statement.slice(0, 90)}</a> ({Math.round(d.score * 100)} %){/each}
    </span>
  </div>
{/if}

<div class="card" style="display:flex; flex-direction:column; gap:18px">
  <div>
    <label for="st">{$t('q.statement')} *</label>
    <textarea id="st" rows="3" bind:value={q.statement} on:input={checkDuplicates}
      placeholder={$t('q.statementph')}></textarea>
  </div>

  <div>
    <label>{$t('q.options')} *</label>
    <div style="display:flex; flex-direction:column; gap:8px">
      {#each q.options as opt, i}
        <div class="row" style="gap:8px; flex-wrap:nowrap">
          <button class="correct-toggle" class:on={q.correct.includes(i)} title="Bonne réponse"
            on:click={() => toggleCorrect(i)}>{'ABCDE'[i]}</button>
          <input class="grow" bind:value={q.options[i]} placeholder={$t('q.propph') + ' ' + 'ABCDE'[i]} />
          {#if q.options.length > 2}
            <button class="btn small secondary" on:click={() => removeOption(i)}>✕</button>
          {/if}
        </div>
      {/each}
    </div>
    <div class="row" style="margin-top:10px; justify-content:space-between">
      {#if q.options.length < 5}
        <button class="btn small secondary" on:click={addOption}>＋ {$t('q.addoption')}</button>
      {:else}<span></span>{/if}
      {#if q.correct.length > 1}
        <span class="tag" style="background:var(--accent-2); color:var(--accent-2-ink)">{$t('q.multi')} : {q.correct.map(i => 'ABCDE'[i]).join(' + ')}</span>
      {/if}
    </div>
  </div>

  <div class="row" style="align-items:flex-start">
    <div class="grow">
      <label for="img">{$t('q.image')}</label>
      {#if q.image}
        <div class="row" style="gap:10px">
          <img src={'/images/' + q.image} alt="" style="max-height:110px; border-radius:8px; border:1px solid var(--border)" />
          <button class="btn small secondary" on:click={() => (q.image = null)}>{$t('q.removeimage')}</button>
        </div>
      {:else}
        <input id="img" type="file" accept="image/*" on:change={onImage} />
        <div class="muted" style="margin-top:4px">{$t('q.imagehint')}</div>
      {/if}
    </div>
  </div>

  <div>
    <label for="ex">{$t('q.explanation')}</label>
    <textarea id="ex" rows="2" bind:value={q.explanation}
      placeholder={$t('q.explph')}></textarea>
  </div>

  <div>
    <label for="tg">{$t('q.tags')}</label>
    <div class="row" style="gap:6px; margin-bottom:8px">
      {#each q.tags as tg}
        <span class="tag">#{tg} <button style="border:none;background:none;cursor:pointer;color:inherit;font-weight:800" on:click={() => removeTag(tg)}>✕</button></span>
      {/each}
    </div>
    <input id="tg" bind:value={tagInput} placeholder={$t('q.tagph')}
      on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} style="max-width:300px" />
    {#if suggestions.length}
      <div class="row" style="gap:6px; margin-top:7px">
        {#each suggestions as s}
          <button class="tag" style="border:none;cursor:pointer" on:click={() => addTag(s.name)}>#{s.name}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="row" style="justify-content:flex-end; gap:10px">
    <a class="btn secondary" href="#/questions">{$t('common.cancel')}</a>
    <button class="btn" on:click={save} disabled={saving}>{$t('common.save')}</button>
  </div>
</div>

<style>
  .correct-toggle {
    width: 42px; height: 42px; flex-shrink: 0; border-radius: calc(var(--radius) - 3px);
    border: 2px solid var(--border); background: var(--panel); color: var(--ink-dim);
    font-weight: 800; font-size: 15px;
  }
  .correct-toggle.on { background: var(--ok); border-color: var(--ok); color: var(--ok-ink); }
</style>
