<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../lib/i18n.js';
  import { api } from '../lib/api.js';

  let mode = 'file';           // file | text | ai
  let file = null;
  let text = '';
  let parsed = [];             // aperçu éditable
  let busy = false;
  let error = '';
  let result = null;
  let aiEnabled = false;
  let aiSource = '';
  let aiCount = 5;
  let aiTags = '';
  let aiDifficulty = 2;
  let aiMulti = false;
  let extraTags = '';          // tags ajoutés à toutes les questions importées

  onMount(async () => { aiEnabled = (await api.get('/api/ai/status')).enabled; });

  async function parse() {
    error = ''; result = null; busy = true;
    try {
      const fd = new FormData();
      if (mode === 'file') { if (!file) { busy = false; return; } fd.append('file', file); }
      else fd.append('text', text);
      const res = await fetch('/api/import/parse', { method: 'POST', body: fd, headers: tokenHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      parsed = data.questions.map(q => ({ ...q, _keep: true }));
      if (!parsed.length) error = $t('import.nothing');
    } catch (e) { error = e.message; }
    busy = false;
  }
  function tokenHeader() { const tk = localStorage.getItem('docbingo_token'); return tk ? { 'X-DocBingo-Token': tk } : {}; }

  async function generate() {
    error = ''; result = null; busy = true;
    try {
      const data = await api.post('/api/ai/generate', {
        source: aiSource, count: aiCount, tags: aiTags.split(/[,\s#]+/).map(x => x.trim().toLowerCase()).filter(Boolean),
        difficulty: aiDifficulty, lang: $lang, multi: aiMulti
      });
      parsed = data.questions.map(q => ({ ...q, _keep: true }));
      if (!parsed.length) error = $t('import.nothing');
    } catch (e) { error = e.message; }
    busy = false;
  }

  function toggleCorrect(q, i) { q.correct = q.correct.includes(i) ? q.correct.filter(x => x !== i) : [...q.correct, i].sort(); parsed = parsed; }
  $: keepCount = parsed.filter(q => q._keep && q.correct?.length && q.statement?.trim()).length;

  async function commit() {
    busy = true; error = '';
    const extra = extraTags.split(/[,\s#]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    const list = parsed.filter(q => q._keep).map(({ _keep, ...q }) => ({ ...q, options: q.options.filter(o => o?.trim()), tags: [...new Set([...(q.tags || []), ...extra])] }));
    try { result = await api.post('/api/import/commit', { questions: list }); parsed = []; }
    catch (e) { error = e.message; }
    busy = false;
  }

  function downloadTemplate() {
    const csv = '﻿' + [
      'Énoncé;A;B;C;D;E;Bonne réponse;Explication;Mots-clés;Difficulté',
      'Quel est le germe le plus fréquent des pneumonies communautaires ?;Haemophilus influenzae;Mycoplasma pneumoniae;Streptococcus pneumoniae;Legionella pneumophila;;C;Le pneumocoque reste le premier agent des PAC.;pneumologie infectiologie;2',
      'Signes ECG de gravité d\'une hyperkaliémie ? (plusieurs réponses);Ondes T amples et pointues;Élargissement des QRS;Disparition des ondes P;Sous-décalage de PR;;ABC;Urgence thérapeutique.;cardiologie nephrologie;3'
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'docbingo-modele-import.csv'; a.click();
  }
</script>

<div class="row" style="margin-bottom:16px">
  <a href="#/questions" class="muted" style="text-decoration:none">← {$t('questions.title')}</a>
</div>
<h1 style="margin-bottom:10px">{$t('import.title')}</h1>
<div class="alert info" style="margin-bottom:14px; font-size:12.5px; line-height:1.45">📜 {$t('charter.reminder')} {$t('charter.ai')} <a href="#/charter">{$t('charter.link')}</a></div>

<div class="row" style="gap:8px; margin-bottom:14px">
  <button class="btn small" class:secondary={mode !== 'file'} on:click={() => { mode = 'file'; parsed = []; }}>📄 {$t('import.file')}</button>
  <button class="btn small" class:secondary={mode !== 'text'} on:click={() => { mode = 'text'; parsed = []; }}>📝 {$t('import.text')}</button>
  <button class="btn small" class:secondary={mode !== 'ai'} on:click={() => { mode = 'ai'; parsed = []; }}>✨ {$t('import.ai')}</button>
</div>

{#if error}<div class="alert error" style="margin-bottom:12px">⚠️ {error}</div>{/if}
{#if result}<div class="alert ok" style="margin-bottom:12px">✓ {$t('import.done', { c: result.created, s: result.skipped })} <a href="#/questions">{$t('questions.title')} →</a></div>{/if}

{#if !parsed.length}
  <div class="card" style="display:flex; flex-direction:column; gap:14px">
    {#if mode === 'file'}
      <p class="muted" style="line-height:1.5">{$t('import.filehelp')}</p>
      <div class="row">
        <input type="file" accept=".csv,.xlsx,.xls,.docx,.txt" on:change={(e) => (file = e.target.files?.[0] || null)} style="max-width:420px" />
        <button class="btn small secondary" on:click={downloadTemplate}>⬇ {$t('import.template')}</button>
      </div>
      <div><button class="btn" on:click={parse} disabled={!file || busy}>{busy ? '…' : $t('import.analyze')}</button></div>
    {:else if mode === 'text'}
      <p class="muted" style="line-height:1.5; white-space:pre-line">{$t('import.texthelp')}</p>
      <textarea rows="12" bind:value={text} placeholder={$t('import.textph')}></textarea>
      <div><button class="btn" on:click={parse} disabled={!text.trim() || busy}>{busy ? '…' : $t('import.analyze')}</button></div>
    {:else}
      {#if !aiEnabled}
        <div class="alert warn">✨ {$t('import.aidisabled')} <a href="#/settings">{$t('nav.settings')} →</a></div>
      {/if}
      <p class="muted" style="line-height:1.5">{$t('import.aihelp')}</p>
      <textarea rows="10" bind:value={aiSource} placeholder={$t('import.aiph')} disabled={!aiEnabled}></textarea>
      <div class="row" style="gap:16px">
        <div><label style="text-transform:none">{$t('import.aicount')}</label><input type="number" min="1" max="20" bind:value={aiCount} style="width:80px" /></div>
        <div><label style="text-transform:none">{$t('q.difficulty')}</label>
          <div class="row" style="gap:6px">{#each [1, 2, 3] as d}<button class="btn small" class:secondary={aiDifficulty !== d} on:click={() => (aiDifficulty = d)}>{$t('diff.' + d)}</button>{/each}</div></div>
        <div class="grow"><label style="text-transform:none">{$t('import.aitags')}</label><input bind:value={aiTags} placeholder="cardiologie, urgences" /></div>
        <label class="row" style="gap:6px; text-transform:none; width:auto; margin:0; align-self:flex-end"><input type="checkbox" bind:checked={aiMulti} style="width:auto" /> {$t('import.aimulti')}</label>
      </div>
      <div><button class="btn" on:click={generate} disabled={!aiEnabled || !aiSource.trim() || busy}>{busy ? $t('import.generating') : '✨ ' + $t('import.generate')}</button></div>
    {/if}
  </div>
{:else}
  <div class="alert ok" style="margin-bottom:12px">
    <span>👀</span><span>{$t('import.preview', { n: parsed.length })}</span>
  </div>
  <div style="display:flex; flex-direction:column; gap:10px">
    {#each parsed as q, qi}
      <div class="card" class:dimmed={!q._keep} style="display:flex; gap:12px">
        <input type="checkbox" bind:checked={q._keep} style="width:auto; align-self:flex-start; margin-top:8px" title={$t('import.keep')} />
        <div class="grow" style="display:flex; flex-direction:column; gap:8px">
          <textarea rows="2" bind:value={q.statement}></textarea>
          {#each q.options as opt, i}
            <div class="row" style="gap:8px; flex-wrap:nowrap">
              <button class="ct" class:on={q.correct.includes(i)} on:click={() => toggleCorrect(q, i)}>{'ABCDE'[i]}</button>
              <input class="grow" bind:value={q.options[i]} />
            </div>
          {/each}
          {#if !q.correct.length}<div class="muted" style="color:var(--danger)">⚠️ {$t('import.nocorrect')}</div>{/if}
          <input bind:value={q.explanation} placeholder={$t('q.explanation')} />
          <div class="row" style="gap:10px">
            <input value={(q.tags || []).join(', ')} on:input={(e) => (q.tags = e.target.value.split(/[,\s#]+/).map(x => x.trim().toLowerCase()).filter(Boolean))} placeholder={$t('q.tags')} style="max-width:300px" />
            <div class="row" style="gap:4px">{#each [1, 2, 3] as d}<button class="btn small" class:secondary={q.difficulty !== d} on:click={() => (q.difficulty = d)}>{$t('diff.' + d)}</button>{/each}</div>
          </div>
        </div>
      </div>
    {/each}
  </div>
  <div class="card" style="margin-top:14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; position:sticky; bottom:10px">
    <div class="grow"><label style="text-transform:none">{$t('import.extratags')}</label><input bind:value={extraTags} placeholder="ex. seminaire-2026" style="max-width:300px" /></div>
    <button class="btn secondary" on:click={() => (parsed = [])}>{$t('common.cancel')}</button>
    <button class="btn" on:click={commit} disabled={!keepCount || busy}>✓ {$t('import.commit', { n: keepCount })}</button>
  </div>
{/if}

<style>
  .dimmed { opacity: .45; }
  .ct { width: 34px; height: 34px; flex-shrink: 0; border-radius: 8px; border: 2px solid var(--border); background: var(--panel); color: var(--ink-dim); font-weight: 800; }
  .ct.on { background: var(--ok); border-color: var(--ok); color: var(--ok-ink); }
</style>
