<script>
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';

  let sessions = [];
  let loading = true;

  onMount(async () => {
    sessions = await api.get('/api/sessions');
    loading = false;
  });

  
  const statusColor = { ready: 'var(--accent)', running: 'var(--warn)', done: 'var(--ok)' };

  async function remove(s) {
    if (!confirm(`${$t('sessions.confirmdelete')} (${s.name})`)) return;
    await api.del('/api/sessions/' + s.id);
    sessions = sessions.filter(x => x.id !== s.id);
  }
  async function duplicate(s) {
    const created = await api.post(`/api/sessions/${s.id}/duplicate`);
    location.hash = '#/session/' + created.id;
  }
  function realDuration(s) {
    if (!s.startedAt || !s.finishedAt) return null;
    return Math.max(1, Math.round((new Date(s.finishedAt + 'Z') - new Date(s.startedAt + 'Z')) / 60000));
  }
</script>

<div class="row" style="margin-bottom:16px">
  <h1 class="grow">{$t('sessions.title')}</h1>
  <a class="btn" href="#/session-new">＋ {$t('sessions.new')}</a>
</div>

{#if loading}
  <div class="empty">{$t('common.loading')}</div>
{:else if !sessions.length}
  <div class="empty">{$t('sessions.empty')}</div>
{:else}
  <div style="display:flex; flex-direction:column; gap:10px">
    {#each sessions as s (s.id)}
      <div class="card row">
        <div class="grow">
          <div style="font-weight:700; font-size:16px; margin-bottom:6px">
            <a href={'#/session/' + s.id} style="text-decoration:none; color:var(--ink)">{s.name}</a>
          </div>
          <div class="row" style="gap:8px; font-size:12.5px">
            <span class="tag" style="background:color-mix(in srgb, {statusColor[s.status]} 16%, var(--panel)); color:var(--ink)">{$t('status.' + s.status)}</span>
            <span class="muted">{s.questionOrder.length} {$t('sessions.qword')} · {s.gridCount} {$t('sessions.gword')} ({s.params.gridSize}×{s.params.gridSize})</span>
            <span class="muted">{s.params.marking === 'correct' ? $t('mark.correct') : $t('mark.luck')}</span>
            {#if s.params.tags?.length}<span class="muted">{s.params.tags.map(x => '#' + x).join(' ')}</span>{/if}
            <span class="muted">{new Date(s.createdAt + 'Z').toLocaleDateString('fr-CH')}</span>
            {#if realDuration(s)}<span class="muted">{$t('sessions.realduration')} : {realDuration(s)} min</span>{/if}
            {#if s.state?.winners?.length}<span class="tag" style="background:var(--warn); color:#3a2703">🏆 {s.state.winners.map(w => w.code).join(', ')}</span>{/if}
          </div>
        </div>
        <div class="row" style="gap:6px; flex-shrink:0">
          <a class="btn small secondary" href={'#/session/' + s.id}>{$t('common.details')}</a>
          <button class="btn small secondary" on:click={() => duplicate(s)} title={$t('sessions.duptitle')}>⧉ {$t('common.duplicate')}</button>
          {#if s.status !== 'done'}
            <a class="btn small" href={'#/play/' + s.id}>{s.status === 'running' ? '▶ ' + $t('sessions.resume') : '▶ ' + $t('sessions.animate')}</a>
          {/if}
          <button class="btn small secondary" style="color:var(--danger)" on:click={() => remove(s)}>✕</button>
        </div>
      </div>
    {/each}
  </div>
{/if}
