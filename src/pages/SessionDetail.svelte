<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../lib/i18n.js';
  import { get } from 'svelte/store';
  import { api } from '../lib/api.js';
  import { generateGridsPdf, generateSummaryPdf } from '../lib/pdf.js';

  export let id;
  let s = null;
  let pdfBusy = false;
  let editing = false;
  let stats = null;
  let board = [];
  let sumBusy = false;
  async function loadResults() {
    try { [stats, board] = await Promise.all([api.get(`/api/sessions/${id}/stats`), api.get(`/api/sessions/${id}/leaderboard`)]); } catch {}
  }
  async function downloadSummary() {
    sumBusy = true;
    try {
      const bytes = await generateSummaryPdf(s, stats, board, get(lang));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      a.download = `docbingo-synthese-${s.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`; a.click();
    } finally { sumBusy = false; }
  }
  $: perQ = stats ? Object.fromEntries(stats.perQuestion.map(x => [x.q, x])) : {};
  let slideDraft = null;   // {afterIndex, type, title, text}
  let err = '';

  onMount(async () => { s = await api.get('/api/sessions/' + id); loadResults(); });

  $: canEdit = s && s.status === 'ready';

  async function move(i, dir) {
    const order = s.questions.map(q => q.id);
    const j = i + dir; if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await api.put(`/api/sessions/${id}/order`, { order });
    s = await api.get('/api/sessions/' + id);
  }
  async function shuffleAll() {
    const order = s.questions.map(q => q.id);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    await api.put(`/api/sessions/${id}/order`, { order });
    s = await api.get('/api/sessions/' + id);
  }
  async function replace(q) {
    err = '';
    try { s = await api.post(`/api/sessions/${id}/replace`, { questionId: q.id }); }
    catch (e) { err = e.message; }
  }
  function newSlide(afterIndex, type = 'title') { slideDraft = { afterIndex, type, title: '', text: '' }; }
  async function saveSlide() {
    const slides = [...(s.slides || []), slideDraft];
    await api.put(`/api/sessions/${id}/slides`, { slides });
    slideDraft = null; s = await api.get('/api/sessions/' + id);
  }
  async function removeSlide(sl) {
    const slides = (s.slides || []).filter(x => x !== sl);
    await api.put(`/api/sessions/${id}/slides`, { slides });
    s = await api.get('/api/sessions/' + id);
  }
  function slidesAfter(i) { return (s.slides || []).filter(sl => sl.afterIndex === i); }
  const slideIcon = { pause: '☕', case: '🩺', title: '🎬' };

  async function downloadPdf() {
    pdfBusy = true;
    try {
      const bytes = await generateGridsPdf(s, s.grids, get(lang));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `docbingo-grilles-${s.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { pdfBusy = false; }
  }

</script>

{#if !s}
  <div class="empty">{$t('common.loading')}</div>
{:else}
  <div class="row" style="margin-bottom:16px">
    <a href="#/sessions" class="muted" style="text-decoration:none">← {$t('sessions.title')}</a>
  </div>
  <div class="row" style="margin-bottom:18px">
    <h1 class="grow">{s.name}</h1>
    {#if s.status !== 'done'}
      <a class="btn" href={'#/play/' + s.id}>▶ {s.status === 'running' ? $t('sdetail.resumeanim') : $t('sdetail.animate')}</a>
    {/if}
  </div>

  <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-bottom:16px">
    <div class="card">
      <h2 style="margin-bottom:10px">{$t('sdetail.params')}</h2>
      <div class="kv"><span>{$t('sdetail.status')}</span><b>{$t('status.' + s.status)}</b></div>
      <div class="kv"><span>{$t('nav.questions')}</span><b>{s.questionOrder.length}</b></div>
      <div class="kv"><span>{$t('sdetail.timeperq')}</span><b>{s.params.secondsPerQuestion} s</b></div>
      <div class="kv"><span>{$t('sdetail.grid')}</span><b>{s.params.gridSize}×{s.params.gridSize}</b></div>
      <div class="kv"><span>{$t('sdetail.marking')}</span><b>{s.params.marking === 'correct' ? $t('mark.correct') : $t('mark.luck')}</b></div>
      <div class="kv"><span>{$t('sdetail.selection')}</span><b>{s.params.tags?.length ? s.params.tags.map(x => '#' + x).join(' ') : $t('sessions.random')}</b></div>
      {#if s.state?.winners?.length}
        <div class="kv"><span>{$t('sdetail.winners')}</span><b>🏆 {s.state.winners.map(w => w.code).join(', ')}</b></div>
      {/if}
    </div>
    {#if s.status !== 'ready'}
      <div class="card">
        <h2 style="margin-bottom:10px">📊 {$t('sdetail.results')}</h2>
        {#if stats}
          <div class="kv"><span>{$t('pres.participants')}</span><b>{stats.participants}</b></div>
          <div class="kv"><span>{$t('sdetail.winners')}</span><b>{s.state?.winners?.length ? s.state.winners.map(w => (w.name ? w.name + ' · ' : '') + w.code).join(', ') : '—'}</b></div>
          {#if board.length}
            <div class="kv"><span>{$t('play.report.podium')}</span><b>{board.slice(0, 3).map((p, i) => ['🥇', '🥈', '🥉'][i] + ' ' + p.name + ' (' + p.score + ')').join('  ')}</b></div>
          {/if}
          <button class="btn" style="margin-top:12px" on:click={downloadSummary} disabled={sumBusy}>{sumBusy ? $t('sdetail.generating') : '⬇ ' + $t('sdetail.summary')}</button>
          <div class="muted" style="margin-top:6px">{$t('sdetail.summaryhint')}</div>
        {:else}<div class="muted">{$t('common.loading')}</div>{/if}
      </div>
    {/if}
    <div class="card">
      <h2 style="margin-bottom:10px">{$t('sdetail.gridstitle')} ({s.grids.length})</h2>
      <p class="muted" style="margin-bottom:12px; line-height:1.5">
        {$t('sdetail.gridsinfo', { n: s.grids.length, p: s.params.participants })}
      </p>
      <button class="btn" on:click={downloadPdf} disabled={pdfBusy}>
        {pdfBusy ? $t('sdetail.generating') : '⬇ ' + $t('sdetail.downloadpdf')}
      </button>
      <div class="muted" style="margin-top:10px">{Math.ceil(s.grids.length / 2)} {$t('sdetail.sheets')}</div>
    </div>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom:12px">
      <h2 class="grow">{$t('sdetail.qorder')}</h2>
      {#if canEdit}
        <button class="btn small" class:secondary={!editing} on:click={() => (editing = !editing)}>✎ {editing ? $t('sdetail.editdone') : $t('sdetail.edit')}</button>
        {#if editing}<button class="btn small secondary" on:click={shuffleAll}>🎲 {$t('sdetail.shuffle')}</button>{/if}
      {/if}
    </div>
    {#if err}<div class="alert error" style="margin-bottom:10px">⚠️ {err}</div>{/if}
    {#if editing}<div class="muted" style="margin-bottom:10px; line-height:1.5">{$t('sdetail.edithelp')}</div>{/if}
    <div style="display:flex; flex-direction:column; gap:6px">
      {#each slidesAfter(-1) as sl}
        <div class="slide"><span>{slideIcon[sl.type]}</span><b>{sl.title || $t('slide.' + sl.type)}</b><span class="muted grow" style="font-size:12.5px">{sl.text}</span>{#if editing}<button class="btn small secondary" on:click={() => removeSlide(sl)}>✕</button>{/if}</div>
      {/each}
      {#if editing}<button class="addslide" on:click={() => newSlide(-1)}>＋ {$t('sdetail.addslide')}</button>{/if}
      {#each s.questions as q, i}
        <div class="qrow" class:asked={i <= s.currentIndex}>
          <span class="qnum">{i + 1}</span>
          <span class="grow" style="line-height:1.35">{q.statement}
            {#if q.caseId}<span class="tag" style="font-size:11px">🩺</span>{/if}
            <span class="muted" style="font-size:11px">{'●'.repeat(q.difficulty || 2)}</span></span>
          {#if perQ[i]?.answered}<span class="muted" style="font-size:12px; flex-shrink:0" title={$t('stats.rate')}><b style="color:{perQ[i].correct / perQ[i].answered < .5 ? 'var(--danger)' : 'var(--ok)'}">{Math.round(100 * perQ[i].correct / perQ[i].answered)} %</b> ({perQ[i].answered})</span>{/if}
          <span class="tag" style="flex-shrink:0">✓ {q.correct.map(x => 'ABCDE'[x]).join('')}</span>
          {#if editing}
            <span class="row" style="gap:3px; flex-shrink:0">
              <button class="btn small secondary" on:click={() => move(i, -1)} disabled={i === 0} title="↑">↑</button>
              <button class="btn small secondary" on:click={() => move(i, 1)} disabled={i === s.questions.length - 1} title="↓">↓</button>
              <button class="btn small secondary" on:click={() => replace(q)} title={$t('sdetail.replace')}>⟳</button>
            </span>
          {/if}
        </div>
        {#each slidesAfter(i) as sl}
          <div class="slide"><span>{slideIcon[sl.type]}</span><b>{sl.title || $t('slide.' + sl.type)}</b><span class="muted grow" style="font-size:12.5px">{sl.text}</span>{#if editing}<button class="btn small secondary" on:click={() => removeSlide(sl)}>✕</button>{/if}</div>
        {/each}
        {#if editing}<button class="addslide" on:click={() => newSlide(i)}>＋ {$t('sdetail.addslide')}</button>{/if}
      {/each}
    </div>
  </div>

  {#if slideDraft}
    <div class="modal-bg" on:click={() => (slideDraft = null)}>
      <div class="modal" on:click|stopPropagation>
        <h2 style="margin-bottom:12px">{$t('sdetail.addslide')}</h2>
        <div class="row" style="gap:6px; margin-bottom:10px">
          {#each ['title', 'pause', 'case'] as ty}
            <button class="btn small" class:secondary={slideDraft.type !== ty} on:click={() => (slideDraft.type = ty)}>{slideIcon[ty]} {$t('slide.' + ty)}</button>
          {/each}
        </div>
        <label>{$t('slide.title')}</label>
        <input bind:value={slideDraft.title} placeholder={$t('slide.' + slideDraft.type + 'ph')} style="margin-bottom:10px" />
        <label>{$t('slide.text')}</label>
        <textarea rows="4" bind:value={slideDraft.text} placeholder={$t('slide.textph')}></textarea>
        <div class="row" style="justify-content:flex-end; gap:8px; margin-top:12px">
          <button class="btn secondary" on:click={() => (slideDraft = null)}>{$t('common.cancel')}</button>
          <button class="btn" on:click={saveSlide}>{$t('common.save')}</button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .slide { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; border: 1.5px dashed var(--accent); font-size: 13.5px; background: color-mix(in srgb, var(--accent) 5%, var(--panel)); }
  .addslide { border: 1px dashed var(--border); background: none; color: var(--ink-dim); border-radius: 8px; padding: 4px; font-size: 12px; cursor: pointer; }
  .addslide:hover { border-color: var(--accent); color: var(--accent); }
  .modal-bg { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; padding: 20px; }
  .modal { background: var(--panel); border-radius: 14px; padding: 22px 24px; max-width: 560px; width: 100%; }
  .kv { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; border-bottom: 1px dashed var(--border); }
  .kv:last-child { border-bottom: none; }
  .kv span { color: var(--ink-dim); }
  .qrow { display: flex; gap: 10px; align-items: flex-start; padding: 7px 8px; border-radius: 8px; font-size: 14px; }
  .qrow.asked { background: var(--soft); }
  .qnum {
    flex-shrink: 0; width: 28px; height: 28px; border-radius: 8px; background: var(--accent); color: var(--accent-ink);
    display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12.5px;
  }
</style>
