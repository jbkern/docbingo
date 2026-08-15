<script>
  import { t } from '../lib/i18n.js';
  const year = new Date().getFullYear();
</script>

<div class="about">
  <div class="row" style="gap:14px; margin-bottom:18px">
    <svg width="54" height="54" viewBox="0 0 100 100"><rect x="5" y="5" width="90" height="90" rx="16" fill="var(--panel)" stroke="var(--accent)" stroke-width="6"/><circle cx="50" cy="50" r="17" fill="var(--accent-2)"/><rect x="46" y="39" width="8" height="22" rx="2" fill="var(--accent-2-ink)"/><rect x="39" y="46" width="22" height="8" rx="2" fill="var(--accent-2-ink)"/></svg>
    <div><h1>{$t('about.title')}</h1><div class="muted">{$t('app.tagline')} · v0.7</div></div>
  </div>

  <div class="card sec">
    <h2>{$t('about.ip')}</h2>
    <p><b>© {year} Jean-Baptiste Kern & {$t('about.coauthors')}.</b> {$t('about.ipdesc')}</p>
  </div>

  <div class="card sec">
    <h2>{$t('about.software')}</h2>
    <p><span class="lic">AGPL-3.0</span> {$t('about.softwaredesc')}</p>
    <p class="muted">{$t('about.source')} : <a href="https://github.com/jbkern/docbingo" target="_blank" rel="noopener">github.com/jbkern/docbingo</a> · <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">{$t('about.licensetext')}</a></p>
  </div>

  <div class="card sec">
    <h2>{$t('about.content')}</h2>
    <p><span class="lic cc">CC BY-NC-SA 4.0</span> {$t('about.contentdesc')}</p>
    <p class="muted"><a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr" target="_blank" rel="noopener">creativecommons.org/licenses/by-nc-sa/4.0</a></p>
  </div>

  <div class="card sec">
    <h2>📜 {$t('charter.title')}</h2>
    <p>{$t('charter.aboutdesc')}</p>
    <p><a class="btn secondary" href="#/charter">{$t('charter.link')}</a></p>
  </div>

  <div class="card sec">
    <h2>{$t('about.brand')}</h2>
    <p>{$t('about.branddesc')}</p>
  </div>

  <div class="card sec">
    <h2>{$t('about.data')}</h2>
    <p>{$t('about.datadesc')}</p>
  </div>

  <div class="card sec">
    <h2>{$t('about.credits')}</h2>
    <p>{$t('about.creditsdesc')}</p>
    <p class="muted">Svelte · Vite · Express · libSQL/Turso · pdf-lib · Render — {$t('about.thirdparty')}</p>
  </div>
  <p class="muted" style="margin-top:14px">{$t('about.disclaimer')}</p>
</div>

<style>
  .about { max-width: 760px; }
  .sec { margin-bottom: 12px; }
  .sec h2 { margin-bottom: 8px; }
  .sec p { line-height: 1.6; margin: 4px 0; }
  .lic { display: inline-block; background: var(--accent); color: var(--accent-ink); border-radius: 6px; padding: 2px 8px; font-weight: 800; font-size: 12.5px; margin-right: 6px; }
  .lic.cc { background: var(--ok); color: var(--ok-ink); }
</style>
