<script>
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';

  let data = null;
  let sessions = [];
  onMount(async () => {
    [data, sessions] = await Promise.all([api.get('/api/stats/questions'), api.get('/api/sessions')]);
  });
  const pct = (r) => r == null ? '—' : Math.round(r * 100) + ' %';
  const color = (r) => r == null ? 'var(--ink-dim)' : r < .5 ? 'var(--danger)' : r < .75 ? 'var(--warn)' : 'var(--ok)';
  $: hardest = data ? data.questions.filter(q => q.answered >= 3).slice(0, 10) : [];
  $: totalAnswers = data ? data.questions.reduce((a, q) => a + q.answered, 0) : 0;
  $: doneSessions = sessions.filter(s => s.status === 'done');
  // palmarès inter-sessions : cumul par nom de gagnant (bingos numériques)
  $: palmares = (() => {
    const m = {};
    for (const s of doneSessions) for (const w of (s.state?.winners || [])) if (w.name) { m[w.name] = m[w.name] || { name: w.name, bingos: 0 }; m[w.name].bingos++; }
    return Object.values(m).sort((a, b) => b.bingos - a.bingos).slice(0, 10);
  })();
</script>

<h1 style="margin-bottom:16px">{$t('stats.title')}</h1>

{#if !data}
  <div class="empty">{$t('common.loading')}</div>
{:else if !data.questions.length}
  <div class="empty">{$t('stats.empty')}</div>
{:else}
  <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:16px">
    <div class="card kpi"><div class="v">{data.questions.length}</div><div class="l">{$t('stats.qwithdata')}</div></div>
    <div class="card kpi"><div class="v">{totalAnswers}</div><div class="l">{$t('stats.answers')}</div></div>
    <div class="card kpi"><div class="v" style="color:{color(totalAnswers ? data.questions.reduce((a, q) => a + q.correct, 0) / totalAnswers : null)}">{pct(totalAnswers ? data.questions.reduce((a, q) => a + q.correct, 0) / totalAnswers : null)}</div><div class="l">{$t('stats.globalrate')}</div></div>
    <div class="card kpi"><div class="v">{doneSessions.length}</div><div class="l">{$t('stats.sessionsdone')}</div></div>
  </div>

  <div style="display:grid; grid-template-columns:1.3fr 1fr; gap:14px; align-items:start">
    <div class="card">
      <h2 style="margin-bottom:10px">{$t('stats.hardest')}</h2>
      <div class="muted" style="margin-bottom:10px">{$t('stats.hardesthint')}</div>
      {#each hardest as q}
        <div class="qline">
          <div class="rate" style="background:{color(q.rate)}">{pct(q.rate)}</div>
          <div class="grow"><a href={'#/question/' + q.id} style="text-decoration:none; color:var(--ink)">{q.statement}</a>
            <div class="muted" style="font-size:12px">{q.correct}/{q.answered} · {'●'.repeat(q.difficulty || 2)} · {q.tags.map(x => '#' + x).join(' ')}</div></div>
        </div>
      {:else}<div class="muted">{$t('stats.needmore')}</div>{/each}
    </div>
    <div style="display:flex; flex-direction:column; gap:14px">
      <div class="card">
        <h2 style="margin-bottom:10px">{$t('stats.bytag')}</h2>
        {#each data.byTag as tg}
          <div class="tagline"><span class="tag">#{tg.tag}</span><div class="track"><div class="fill" style="width:{Math.round((tg.rate || 0) * 100)}%; background:{color(tg.rate)}"></div></div><b style="width:48px; text-align:right">{pct(tg.rate)}</b><span class="muted" style="width:60px; text-align:right; font-size:12px">{tg.answered}</span></div>
        {/each}
      </div>
      <div class="card">
        <h2 style="margin-bottom:10px">🏆 {$t('stats.palmares')}</h2>
        {#if palmares.length}
          <ol style="padding-left:20px">{#each palmares as p}<li><b>{p.name}</b> — {p.bingos} bingo{p.bingos > 1 ? 's' : ''}</li>{/each}</ol>
        {:else}<div class="muted">{$t('stats.nopalmares')}</div>{/if}
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:14px">
    <h2 style="margin-bottom:10px">{$t('stats.allq')}</h2>
    <table class="tbl">
      <thead><tr><th>{$t('stats.rate')}</th><th>{$t('q.statement')}</th><th>{$t('stats.asked')}</th><th>{$t('stats.answered')}</th><th>{$t('q.difficulty')}</th></tr></thead>
      <tbody>
        {#each data.questions as q}
          <tr><td><b style="color:{color(q.rate)}">{pct(q.rate)}</b></td><td><a href={'#/question/' + q.id}>{q.statement}</a></td><td>{q.asked}</td><td>{q.answered}</td><td>{'●'.repeat(q.difficulty || 2)}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .kpi { text-align: center; } .kpi .v { font-size: 30px; font-weight: 800; } .kpi .l { color: var(--ink-dim); font-size: 12.5px; text-transform: uppercase; letter-spacing: .05em; }
  .qline { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px dashed var(--border); font-size: 14px; }
  .rate { color: #fff; font-weight: 800; border-radius: 8px; padding: 4px 8px; font-size: 12.5px; flex-shrink: 0; min-width: 52px; text-align: center; }
  .tagline { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
  .track { flex: 1; height: 9px; background: var(--soft); border-radius: 99px; overflow: hidden; } .fill { height: 100%; border-radius: 99px; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 13.5px; } .tbl th, .tbl td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); } .tbl th { color: var(--ink-dim); font-size: 11.5px; text-transform: uppercase; }
  @media (max-width: 860px) { div[style*="grid-template-columns:1.3fr"] { display: flex !important; flex-direction: column; } }
</style>
