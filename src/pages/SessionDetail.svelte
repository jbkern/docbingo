<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../lib/i18n.js';
  import { get } from 'svelte/store';
  import { api } from '../lib/api.js';
  import { generateGridsPdf } from '../lib/pdf.js';

  export let id;
  let s = null;
  let pdfBusy = false;

  onMount(async () => { s = await api.get('/api/sessions/' + id); });

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
    <h2 style="margin-bottom:12px">{$t('sdetail.qorder')}</h2>
    <div style="display:flex; flex-direction:column; gap:6px">
      {#each s.questions as q, i}
        <div class="qrow" class:asked={i <= s.currentIndex}>
          <span class="qnum">{i + 1}</span>
          <span class="grow" style="line-height:1.35">{q.statement}</span>
          <span class="tag" style="flex-shrink:0">✓ {q.correct.map(x => 'ABCDE'[x]).join('')}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
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
