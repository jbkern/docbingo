<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../lib/i18n.js';
  import { api } from '../lib/api.js';

  export let user = null;
  let questions = [];
  let sessions = [];
  let tags = [];
  let pending = 0;
  let loading = true;

  onMount(async () => {
    try {
      [questions, sessions, tags] = await Promise.all([api.get('/api/questions'), api.get('/api/sessions'), api.get('/api/tags')]);
      if (user?.role === 'admin') pending = (await api.get('/api/review/pending')).count;
    } catch {}
    loading = false;
  });

  $: published = questions.filter(q => q.status === 'published').length;
  $: mine = user?.id ? questions.filter(q => q.authorId === user.id).length : 0;
  $: running = sessions.find(s => s.status === 'running');
  $: ready = sessions.filter(s => s.status === 'ready');
  $: done = sessions.filter(s => s.status === 'done');
  $: last = sessions.slice(0, 4);
  $: unusedCount = questions.filter(q => q.status === 'published' && !q.usedCount).length;
  const statusLabel = (s) => $t('status.' + s);
  const fmt = (d) => new Date(d + 'Z').toLocaleDateString($lang === 'en' ? 'en-GB' : $lang === 'de' ? 'de-CH' : 'fr-CH');
  const hour = new Date().getHours();
</script>

<div class="hero">
  <div>
    <h1 style="text-transform:none; letter-spacing:0; font-size:26px">{hour < 18 ? $t('home.hello') : $t('home.evening')}{user?.name ? ', ' + user.name.split(' ')[0] : ''} 👋</h1>
    <p class="muted" style="margin-top:4px">{$t('home.tagline')}</p>
  </div>
  <div class="quick">
    <a class="btn" href="#/session-new">＋ {$t('sessions.new')}</a>
    <a class="btn secondary" href="#/question/new">＋ {$t('questions.new')}</a>
    <a class="btn secondary" href="#/import">⬆ {$t('nav.import')}</a>
    <a class="btn secondary" href="#/import/ai">✨ {$t('import.ai')}</a>
  </div>
</div>

{#if loading}
  <div class="empty">{$t('common.loading')}</div>
{:else}
  {#if running}
    <a class="card running" href={'#/play/' + running.id}>
      <div class="pulse"></div>
      <div class="grow">
        <div class="muted" style="font-size:12px; text-transform:uppercase; letter-spacing:.08em">{$t('home.running')}</div>
        <div style="font-size:18px; font-weight:800">{running.name}</div>
        <div class="muted">{$t('play.question')} {running.currentIndex + 1} / {running.questionOrder.length} · {running.gridCount} {$t('sessions.gword')}</div>
      </div>
      <span class="btn">▶ {$t('sessions.resume')}</span>
    </a>
  {/if}

  {#if pending}
    <a class="card pendingcard" href="#/review">📨 <b>{pending}</b> {$t('home.pending')} <span class="btn small" style="margin-left:auto">{$t('nav.review')} →</span></a>
  {/if}

  <div class="kpis">
    <a class="card kpi" href="#/questions"><div class="v">{published}</div><div class="l">{$t('home.published')}</div>{#if unusedCount}<div class="sub">{unusedCount} {$t('home.unused')}</div>{/if}</a>
    <a class="card kpi" href="#/questions"><div class="v">{tags.length}</div><div class="l">{$t('home.tags')}</div><div class="sub">{tags.slice(0, 4).map(x => '#' + x.name).join(' ')}{tags.length > 4 ? ' …' : ''}</div></a>
    <a class="card kpi" href="#/sessions"><div class="v">{ready.length}</div><div class="l">{$t('home.ready')}</div><div class="sub">{done.length} {$t('home.done')}</div></a>
    {#if user?.role === 'author'}
      <a class="card kpi" href="#/questions?mine=1"><div class="v">{mine}</div><div class="l">{$t('home.mine')}</div></a>
    {:else}
      <a class="card kpi" href="#/stats"><div class="v">📊</div><div class="l">{$t('nav.stats')}</div></a>
    {/if}
  </div>

  <div class="two">
    <div class="card">
      <div class="row" style="margin-bottom:10px"><h2 class="grow">{$t('home.recent')}</h2><a href="#/sessions" class="muted" style="font-size:13px">{$t('home.all')} →</a></div>
      {#if !last.length}
        <div class="muted" style="line-height:1.6">{$t('home.nosession')}</div>
      {:else}
        {#each last as s}
          <a class="srow" href={'#/session/' + s.id}>
            <span class="dot s-{s.status}"></span>
            <span class="grow"><b>{s.name}</b><br><span class="muted" style="font-size:12.5px">{statusLabel(s.status)} · {s.questionOrder.length} {$t('sessions.qword')} · {fmt(s.createdAt)}{#if s.state?.winners?.length} · 🏆 {s.state.winners.length}{/if}</span></span>
            {#if s.status !== 'done'}<span class="btn small">{s.status === 'running' ? '▶ ' + $t('sessions.resume') : '▶ ' + $t('sessions.animate')}</span>{/if}
          </a>
        {/each}
      {/if}
    </div>
    <div class="card">
      <h2 style="margin-bottom:10px">{$t('home.steps')}</h2>
      <ol class="steps">
        <li><a href="#/questions">{$t('home.step1')}</a></li>
        <li><a href="#/session-new">{$t('home.step2')}</a></li>
        <li>{$t('home.step3')}</li>
        <li>{$t('home.step4')}</li>
      </ol>
      <div class="row" style="margin-top:12px; gap:8px; flex-wrap:wrap">
        <a class="btn secondary" href={$lang === 'fr' ? '/guide.html' : '/guide-' + $lang + '.html'} target="_blank">📖 {$t('settings.openguide')}</a>
        <a class="btn secondary" href="#/demo">🎬 {$t('demo.title')}</a>
      </div>
    </div>
  </div>
{/if}

<style>
  .hero { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
  .quick { display: flex; gap: 8px; flex-wrap: wrap; }
  .running { display: flex; align-items: center; gap: 16px; text-decoration: none; color: var(--ink); border: 2px solid var(--ok); background: color-mix(in srgb, var(--ok) 10%, var(--panel)); margin-bottom: 14px; }
  .pulse { width: 14px; height: 14px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 0 var(--ok); animation: pl 1.6s infinite; flex-shrink: 0; }
  @keyframes pl { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 60%, transparent); } 100% { box-shadow: 0 0 0 14px transparent; } }
  .pendingcard { display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--ink); border-color: var(--warn); background: color-mix(in srgb, var(--warn) 14%, var(--panel)); margin-bottom: 14px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .kpi { text-decoration: none; color: var(--ink); text-align: center; }
  .kpi .v { font-size: 30px; font-weight: 800; color: var(--accent); }
  .kpi .l { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-dim); }
  .kpi .sub { font-size: 12px; color: var(--ink-dim); margin-top: 4px; }
  .two { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; }
  .srow { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-bottom: 1px dashed var(--border); text-decoration: none; color: var(--ink); font-size: 14px; }
  .srow:last-of-type { border-bottom: none; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .dot.s-ready { background: var(--accent); } .dot.s-running { background: var(--warn); } .dot.s-done { background: var(--ok); }
  .steps { padding-left: 20px; line-height: 1.9; font-size: 14px; }
  @media (max-width: 800px) { .two { grid-template-columns: 1fr; } }
</style>
