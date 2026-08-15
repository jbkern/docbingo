<script>
  import { onMount } from 'svelte';
  import { t, lang } from '../lib/i18n.js';
  let token = localStorage.getItem('docbingo_token') || '';
  let chapters = [];
  let video;
  async function loadChapters(l) { try { chapters = await (await fetch('/api/demo/chapters?lang=' + l, { headers: token ? { 'X-DocBingo-Token': token } : {} })).json(); } catch {} }
  onMount(() => loadChapters($lang));
  $: loadChapters($lang);
  const LANGS = [['fr', 'Français'], ['en', 'English'], ['de', 'Deutsch']];
  const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function seek(at) { if (video) { video.currentTime = at; video.play(); } }
</script>

<div class="row" style="margin-bottom:12px">
  <h1 class="grow">🎬 {$t('demo.title')}</h1>
</div>
<p class="muted" style="margin-bottom:14px; line-height:1.5">{$t('demo.help')}</p>

<div class="demo-grid">
  <div class="card" style="padding:10px">
    <!-- svelte-ignore a11y-media-has-caption -->
    <video bind:this={video} controls preload="metadata" playsinline style="width:100%; border-radius:8px; background:#000; aspect-ratio:16/9"
      src={'/api/demo/video?t=' + encodeURIComponent(token)} poster="/api/demo/poster">
      {#each LANGS as [code, label]}
        <track kind="subtitles" srclang={code} {label} src={'/api/demo/subtitles?lang=' + code + '&t=' + encodeURIComponent(token)} default={code === $lang} />
      {/each}
    </video>
    <div class="muted" style="margin-top:8px; font-size:12.5px">{$t('demo.note')}</div>
  </div>
  <div class="card">
    <h2 style="margin-bottom:8px">{$t('demo.chapters')}</h2>
    {#if chapters.length}
      <ol class="chap">
        {#each chapters as c}
          <li><button on:click={() => seek(c.at)}><span class="ts">{fmt(c.at)}</span> {c.text}</button></li>
        {/each}
      </ol>
    {:else}<div class="muted">{$t('common.loading')}</div>{/if}
  </div>
</div>

<style>
  .demo-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 14px; align-items: start; }
  .chap { list-style: none; padding: 0; margin: 0; max-height: 520px; overflow: auto; }
  .chap li button { width: 100%; text-align: left; background: none; border: none; border-bottom: 1px dashed var(--border); padding: 7px 4px; font-size: 13px; color: var(--ink); cursor: pointer; line-height: 1.4; }
  .chap li button:hover { background: var(--soft); }
  .ts { display: inline-block; min-width: 40px; color: var(--accent); font-weight: 800; font-variant-numeric: tabular-nums; }
  @media (max-width: 860px) { .demo-grid { grid-template-columns: 1fr; } }
</style>
