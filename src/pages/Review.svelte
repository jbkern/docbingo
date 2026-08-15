<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';
  const dispatch = createEventDispatcher();
  let list = [];
  let loading = true;
  let notes = {};
  async function load() { loading = true; list = await api.get('/api/questions?status=proposed'); loading = false; }
  onMount(load);
  async function act(q, action) {
    await api.post(`/api/questions/${q.id}/review`, { action, note: notes[q.id] || '' });
    list = list.filter(x => x.id !== q.id); dispatch('done');
  }
</script>

<h1 style="margin-bottom:6px">{$t('review.title')}</h1>
<p class="muted" style="margin-bottom:16px">{$t('review.help')}</p>
{#if loading}<div class="empty">{$t('common.loading')}</div>
{:else if !list.length}<div class="empty">✓ {$t('review.empty')}</div>
{:else}
  <div style="display:flex; flex-direction:column; gap:12px">
    {#each list as q (q.id)}
      <div class="card">
        <div class="row" style="justify-content:space-between; margin-bottom:8px">
          <span class="muted" style="font-size:12.5px">✍️ {q.authorName || '—'} · {new Date(q.updatedAt + 'Z').toLocaleDateString()} · {'●'.repeat(q.difficulty || 2)} {#each q.tags as tg}<span class="tag">#{tg}</span> {/each}</span>
          <a class="btn small secondary" href={'#/question/' + q.id}>{$t('common.edit')}</a>
        </div>
        <div style="font-weight:700; margin-bottom:8px; line-height:1.4">{q.statement}</div>
        {#if q.image}<img src={'/images/' + q.image} alt="" style="max-height:120px; border-radius:8px; margin-bottom:8px" />{/if}
        <div style="display:flex; flex-direction:column; gap:4px; font-size:14px">
          {#each q.options as o, i}<div style="color:{q.correct.includes(i) ? 'var(--ok)' : 'var(--ink)'}; font-weight:{q.correct.includes(i) ? 800 : 400}">{'ABCDE'[i]}) {o}{q.correct.includes(i) ? ' ✓' : ''}</div>{/each}
        </div>
        {#if q.explanation}<div class="muted" style="margin-top:8px; font-size:13.5px">💡 {q.explanation}</div>{/if}
        <div class="row" style="margin-top:12px; gap:8px">
          <input placeholder={$t('review.noteph')} bind:value={notes[q.id]} class="grow" />
          <button class="btn small secondary" on:click={() => act(q, 'return')}>↩ {$t('review.return')}</button>
          <button class="btn small" on:click={() => act(q, 'publish')}>✓ {$t('review.publish')}</button>
        </div>
      </div>
    {/each}
  </div>
{/if}
