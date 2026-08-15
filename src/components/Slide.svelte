<script>
  import { t } from '../lib/i18n.js';
  export let slide;
  export let sessionName = '';
  const icon = { pause: '☕', case: '🩺', title: '🎬' };
</script>

<div class="slide-full">
  <div class="dim" style="position:absolute; top:22px; left:34px">🩺 <b style="color:var(--proj-ink)">{sessionName}</b></div>
  <div class="ico">{icon[slide.type] || '🎬'}</div>
  <h1>{slide.title || $t('slide.' + slide.type)}</h1>
  {#if slide.text}<p>{slide.text}</p>{/if}
  {#if slide.type === 'pause'}<div class="dim" style="margin-top:20px">{$t('slide.pausehint')}</div>{/if}
</div>

<style>
  .slide-full { position: relative; flex: 1; min-height: 100vh; background: var(--proj-bg); color: var(--proj-ink); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; }
  .dim { color: var(--proj-dim); }
  .ico { font-size: 64px; margin-bottom: 14px; }
  h1 { font-size: clamp(30px, 5vw, 52px); text-transform: var(--title-transform); letter-spacing: var(--title-spacing); max-width: 900px; }
  p { font-size: clamp(18px, 2.4vw, 26px); line-height: 1.5; max-width: 860px; margin-top: 18px; white-space: pre-line; color: var(--proj-ink); }
</style>
