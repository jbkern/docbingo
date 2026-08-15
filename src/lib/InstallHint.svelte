<script>
  /* Bandeau « Ajouter à l'écran d'accueil » (application web installable). Affiché sur smartphone/tablette,
     hors mode autonome, et masquable pour 30 jours. */
  import { onMount } from 'svelte';
  import { t } from './i18n.js';
  export let compact = false;
  let show = false; let deferred = null; let ios = false;
  const KEY = 'docbingo_install_hint';
  onMount(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const mobile = window.matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const dismissed = Number(localStorage.getItem(KEY) || 0) > Date.now();
    if (standalone || !mobile || dismissed) return;
    ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    const onPrompt = (e) => { e.preventDefault(); deferred = e; show = true; };
    window.addEventListener('beforeinstallprompt', onPrompt);
    if (ios) show = true;
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  });
  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null; show = false;
  }
  function dismiss() { localStorage.setItem(KEY, String(Date.now() + 30 * 86400000)); show = false; }
</script>

{#if show}
  <div class="install" class:compact>
    <img src="/icons/icon-192.png" alt="" width="34" height="34" />
    <div class="grow">
      <b>{$t('install.title')}</b>
      <div class="muted small">{ios ? $t('install.ios') : $t('install.help')}</div>
    </div>
    {#if !ios}<button class="btn small" on:click={install}>{$t('install.btn')}</button>{/if}
    <button class="x" on:click={dismiss} aria-label={$t('common.close')}>✕</button>
  </div>
{/if}

<style>
  .install { display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px; margin: 0 0 12px; box-shadow: var(--shadow, 0 2px 8px rgba(0,0,0,.06)); }
  .install img { border-radius: 8px; flex: none; }
  .small { font-size: 12px; line-height: 1.35; }
  .btn.small { padding: 6px 10px; font-size: 12.5px; white-space: nowrap; }
  .x { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; padding: 4px; }
  .compact { margin: 8px 0; }
</style>
