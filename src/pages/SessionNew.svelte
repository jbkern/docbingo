<script>
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { api } from '../lib/api.js';

  let allTags = [];
  let name = '';
  let mode = 'random';            // 'random' | 'theme'
  let tags = [];
  let tagLogic = 'or';
  let sizing = 'count';           // 'count' | 'duration'
  let questionCount = 30;
  let durationMin = 45;
  let secondsPerQuestion = 60;
  let participants = 20;
  let marking = 'correct';
  let afterBingoDefault = 'continue';
  let excludeRecent = false;
  let gridSize = 0;               // 0 = auto (recommended)
  let notes = '';
  let difficultyMode = 'any';
  let sounds = true;
  let animations = true;
  let plan = null;
  let planning = false;
  let creating = false;
  let error = '';

  onMount(async () => { allTags = await api.get('/api/tags'); refreshPlan(); });

  function toggleTag(n) {
    tags = tags.includes(n) ? tags.filter(x => x !== n) : [...tags, n];
    refreshPlan();
  }

  let planTimer;
  function refreshPlan() {
    clearTimeout(planTimer);
    planTimer = setTimeout(async () => {
      planning = true;
      try {
        plan = await api.post('/api/sessions/plan', {
          tags: mode === 'theme' ? tags : [],
          logic: tagLogic,
          count: sizing === 'count' ? questionCount : null,
          durationMin: sizing === 'duration' ? durationMin : null,
          secondsPerQuestion, marking, excludeRecent, participants, difficultyMode
        });
      } catch (e) { plan = null; }
      planning = false;
    }, 350);
  }

  $: effectiveGrid = gridSize || plan?.recommended || 4;
  $: alertsBlocking = plan?.alerts?.some(a => a.type === 'not_enough_questions');

  async function create() {
    error = '';
    creating = true;
    try {
      const s = await api.post('/api/sessions', {
        name,
        params: {
          mode, tags: mode === 'theme' ? tags : [], tagLogic,
          questionCount: plan.questionCount, secondsPerQuestion,
          participants, gridSize: effectiveGrid, marking, afterBingoDefault,
          excludeRecent, reservePct: 10, notes: notes.trim() || null, sounds, animations, difficultyMode
        }
      });
      location.hash = '#/session/' + s.id;
    } catch (e) { error = e.message; }
    creating = false;
  }

  function alertText(a) {
    if (a.type === 'not_enough_questions') return $t('snew.alert.notenough', { a: a.available, n: a.needed });
    if (a.type === 'incomplete_questions') return $t('snew.alert.incomplete', { n: a.ids.length });
    if (a.type === 'few_questions_for_grid') return $t('snew.alert.fewq', { k: a.gridSize });
    return JSON.stringify(a);
  }
</script>

<div class="row" style="margin-bottom:16px">
  <a href="#/sessions" class="muted" style="text-decoration:none">← {$t('sessions.title')}</a>
</div>
<h1 style="margin-bottom:16px">{$t('sessions.new')}</h1>

{#if error}<div class="alert error" style="margin-bottom:14px">⚠️ {error}</div>{/if}

<div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:16px; align-items:start">
  <div class="card" style="display:flex; flex-direction:column; gap:18px">
    <div>
      <label for="nm">{$t('snew.name')} *</label>
      <input id="nm" bind:value={name} placeholder={$t('snew.nameph')} />
    </div>

    <div>
      <label>{$t('snew.selection')}</label>
      <div class="row" style="gap:8px">
        <button class="btn small" class:secondary={mode !== 'random'} on:click={() => { mode = 'random'; refreshPlan(); }}>🎲 {$t('snew.random')}</button>
        <button class="btn small" class:secondary={mode !== 'theme'} on:click={() => { mode = 'theme'; refreshPlan(); }}># {$t('snew.bytheme')}</button>
        <label class="row" style="gap:6px; margin:0; text-transform:none; font-size:13px; width:auto">
          <input type="checkbox" bind:checked={excludeRecent} on:change={refreshPlan} style="width:auto" /> {$t('snew.excluderecent')}
        </label>
      </div>
      {#if mode === 'theme'}
        <div class="row" style="gap:6px; margin-top:10px">
          {#each allTags as tag}
            <button class="tag" style="border:none;cursor:pointer" style:outline={tags.includes(tag.name) ? '2.5px solid var(--accent-2)' : 'none'}
              on:click={() => toggleTag(tag.name)}>#{tag.name} <span style="font-size:11px">{tag.count}</span></button>
          {/each}
          {#if !allTags.length}<span class="muted">{$t('snew.notags')}</span>{/if}
        </div>
        {#if tags.length > 1}
          <select bind:value={tagLogic} on:change={refreshPlan} style="width:auto; margin-top:8px">
            <option value="or">{$t('logic.or')}</option>
            <option value="and">{$t('logic.and')}</option>
          </select>
        {/if}
      {/if}
    </div>

    <div>
      <label>{$t('snew.sizing')}</label>
      <div class="row" style="gap:8px; margin-bottom:10px">
        <button class="btn small" class:secondary={sizing !== 'count'} on:click={() => { sizing = 'count'; refreshPlan(); }}>{$t('snew.bycount')}</button>
        <button class="btn small" class:secondary={sizing !== 'duration'} on:click={() => { sizing = 'duration'; refreshPlan(); }}>{$t('snew.byduration')}</button>
      </div>
      <div class="row">
        {#if sizing === 'count'}
          <div><label for="qc" style="text-transform:none">{$t('snew.qcount')}</label>
            <input id="qc" type="number" min="5" max="200" bind:value={questionCount} on:input={refreshPlan} style="width:100px" /></div>
        {:else}
          <div><label for="dm" style="text-transform:none">{$t('snew.duration')}</label>
            <input id="dm" type="number" min="10" max="240" bind:value={durationMin} on:input={refreshPlan} style="width:100px" /></div>
        {/if}
        <div><label for="spq" style="text-transform:none">{$t('snew.timeperq')}</label>
          <input id="spq" type="number" min="10" max="600" step="5" bind:value={secondsPerQuestion} on:input={refreshPlan} style="width:100px" /></div>
        <div><label for="pp" style="text-transform:none">{$t('snew.participants')}</label>
          <input id="pp" type="number" min="1" max="500" bind:value={participants} style="width:100px" /></div>
      </div>
    </div>

    <div>
      <label>{$t('snew.difficulty')}</label>
      <div class="row" style="gap:6px">
        {#each ['any', 'balanced', 'progressive', '1', '2', '3'] as m}
          <button class="btn small" class:secondary={difficultyMode !== m} on:click={() => { difficultyMode = m; refreshPlan(); }}>{$t('diffmode.' + m)}</button>
        {/each}
      </div>
      {#if plan?.byDifficulty}
        <div class="muted" style="margin-top:6px">{$t('diff.1')} : {plan.byDifficulty[1]} · {$t('diff.2')} : {plan.byDifficulty[2]} · {$t('diff.3')} : {plan.byDifficulty[3]} — {$t('snew.caseshint')}</div>
      {/if}
    </div>

    <div>
      <label>{$t('snew.marking')}</label>
      <div class="row" style="gap:8px">
        <button class="btn small" class:secondary={marking !== 'correct'} on:click={() => { marking = 'correct'; refreshPlan(); }}>🎓 {$t('mark.correct')}</button>
        <button class="btn small" class:secondary={marking !== 'luck'} on:click={() => { marking = 'luck'; refreshPlan(); }}>🍀 {$t('mark.luck')}</button>
      </div>
      <div class="muted" style="margin-top:6px">
        {marking === 'correct' ? $t('snew.markcorrectdesc') : $t('snew.markluckdesc')}
      </div>
    </div>

    <div>
      <label>{$t('snew.afterbingo')}</label>
      <div class="row" style="gap:8px">
        <button class="btn small" class:secondary={afterBingoDefault !== 'continue'} on:click={() => (afterBingoDefault = 'continue')}>{$t('snew.continue')}</button>
        <button class="btn small" class:secondary={afterBingoDefault !== 'stop'} on:click={() => (afterBingoDefault = 'stop')}>{$t('snew.stop')}</button>
      </div>
    </div>

    <div>
      <label>{$t('snew.gridsize')}</label>
      <div class="row" style="gap:8px">
        <button class="btn small" class:secondary={gridSize !== 0} on:click={() => (gridSize = 0)}>{$t('snew.auto')}{plan?.recommended ? ` (${plan.recommended}×${plan.recommended})` : ''}</button>
        {#each [3, 4, 5] as k}
          <button class="btn small" class:secondary={gridSize !== k} on:click={() => (gridSize = k)}>{k}×{k}</button>
        {/each}
      </div>
    </div>

    <div class="row" style="gap:26px">
      <label class="row" style="gap:8px; text-transform:none; font-size:14px; width:auto; margin:0">
        <input type="checkbox" bind:checked={sounds} style="width:auto" /> {$t('snew.sounds')}
      </label>
      <label class="row" style="gap:8px; text-transform:none; font-size:14px; width:auto; margin:0">
        <input type="checkbox" bind:checked={animations} style="width:auto" /> {$t('snew.animations')}
      </label>
    </div>

    <div>
      <label for="nt">{$t('snew.notes')}</label>
      <textarea id="nt" rows="2" bind:value={notes} placeholder={$t('snew.notesph')}></textarea>
    </div>
  </div>

  <div style="display:flex; flex-direction:column; gap:12px">
    <div class="card">
      <h2 style="margin-bottom:12px">{$t('snew.preview')}</h2>
      {#if planning || !plan}
        <div class="muted">{$t('snew.calc')}</div>
      {:else}
        <div class="preview-lines">
          <div><b>{plan.questionCount}</b> {$t('sessions.qword')} · <b>{plan.available}</b> {$t('snew.available')}</div>
          <div>{$t('snew.estduration')} : <b>≈ {plan.estimatedMinutes} min</b></div>
          <div>{$t('snew.grid')} : <b>{effectiveGrid}×{effectiveGrid}</b> {#if !gridSize}<span class="muted">{$t('snew.recommended')}</span>{/if}</div>
          <div>{$t('snew.gridsgen')} : <b>{participants + Math.max(2, Math.ceil(participants * 0.1))}</b> <span class="muted">{$t('snew.reserve')}</span></div>
          {#if plan.simulations?.[effectiveGrid]?.median}
            <div>{$t('snew.firstbingo')} <b>{plan.simulations[effectiveGrid].median}</b> / {plan.questionCount}</div>
          {/if}
        </div>
      {/if}
    </div>

    {#if plan?.alerts?.length}
      {#each plan.alerts as a}
        <div class="alert {a.type === 'not_enough_questions' ? 'error' : 'warn'}">⚠️ {alertText(a)}</div>
      {/each}
    {:else if plan}
      <div class="alert ok">✓ {$t('snew.allgreen')}</div>
    {/if}

    <button class="btn" style="width:100%; justify-content:center; padding:14px"
      disabled={!name.trim() || alertsBlocking || creating || !plan} on:click={create}>
      {creating ? $t('snew.creating') : $t('snew.create')}
    </button>
  </div>
</div>

<style>
  .preview-lines { display: flex; flex-direction: column; gap: 8px; font-size: 14.5px; }
  @media (max-width: 860px) { div[style*="grid-template-columns"] { display: flex !important; flex-direction: column; } }
</style>
