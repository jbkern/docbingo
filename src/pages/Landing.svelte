<script>
  /* Page vitrine publique (visiteurs non connectés) : présentation, fonctionnement, confiance, connexion. */
  import { t, lang } from '../lib/i18n.js';
  const features = [
    { icon: '🎱', k: 'bank' }, { icon: '🖨️', k: 'grids' }, { icon: '📱', k: 'phones' },
    { icon: '🖥️', k: 'present' }, { icon: '✨', k: 'ai' }, { icon: '📊', k: 'stats' }
  ];
</script>

<div class="land">
  <header class="lhead">
    <div class="brand">
      <svg width="34" height="34" viewBox="0 0 100 100"><rect x="5" y="5" width="90" height="90" rx="16" fill="var(--panel)" stroke="var(--accent)" stroke-width="6"/><circle cx="50" cy="50" r="17" fill="var(--accent-2)"/><rect x="46" y="39" width="8" height="22" rx="2" fill="var(--accent-2-ink)"/><rect x="39" y="46" width="22" height="8" rx="2" fill="var(--accent-2-ink)"/></svg>
      <span><b>DocBingo</b><small>{$t('app.tagline')}</small></span>
    </div>
    <div class="row" style="gap:6px">
      <select class="langsel" value={$lang} on:change={(e) => lang.set(e.target.value)} aria-label="Language">
        <option value="fr">FR</option><option value="en">EN</option><option value="de">DE</option>
      </select>
      <a class="btn secondary small" href="#/join">🎟 {$t('landing.joincta')}</a>
    </div>
  </header>

  <section class="hero">
    <div class="hero-txt">
      <h1>{$t('landing.h1')}</h1>
      <p class="lead">{$t('landing.lead')}</p>
      <ul class="ticks">
        <li>{$t('landing.tick1')}</li>
        <li>{$t('landing.tick2')}</li>
        <li>{$t('landing.tick3')}</li>
      </ul>
      <div class="muted" style="font-size:12.5px; margin-top:10px">{$t('landing.freenote')}</div>
    </div>
    <div class="login-card">
      <slot />
    </div>
  </section>

  <section>
    <h2>{$t('landing.features')}</h2>
    <div class="feat-grid">
      {#each features as f}
        <div class="feat"><span class="fi">{f.icon}</span><b>{$t('landing.f.' + f.k)}</b><p>{$t('landing.f.' + f.k + '.d')}</p></div>
      {/each}
    </div>
  </section>

  <section>
    <h2>{$t('landing.how')}</h2>
    <ol class="steps">
      <li><b>1</b><span>{$t('landing.how1')}</span></li>
      <li><b>2</b><span>{$t('landing.how2')}</span></li>
      <li><b>3</b><span>{$t('landing.how3')}</span></li>
      <li><b>4</b><span>{$t('landing.how4')}</span></li>
    </ol>
  </section>

  <section class="trust">
    <div class="tcard">📜 <b>{$t('charter.title')}</b><p>{$t('landing.t.charter')}</p><a href="#/charter">{$t('charter.link')} →</a></div>
    <div class="tcard">⚖️ <b>{$t('landing.t.lictitle')}</b><p>{$t('landing.t.lic')}</p><a href="#/about">{$t('about.title')} →</a></div>
    <div class="tcard">🔒 <b>{$t('landing.t.datatitle')}</b><p>{$t('landing.t.data')}</p><a href="#/about">{$t('about.title')} →</a></div>
  </section>

  <footer class="lfoot">
    DocBingo © {new Date().getFullYear()} Jean-Baptiste Kern & co-auteurs · <a href="#/about">{$t('about.title')}</a> · <a href="#/charter">{$t('charter.title')}</a> · AGPL-3.0 · CC BY-NC-SA 4.0
  </footer>
</div>

<style>
  .land { max-width: 1020px; margin: 0 auto; padding: 18px 18px 40px; }
  .lhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand span { display: flex; flex-direction: column; line-height: 1.15; }
  .brand b { font-size: 19px; } .brand small { font-size: 11.5px; color: var(--ink-dim); }
  .langsel { width: auto; padding: 7px 8px; font-weight: 700; }
  .hero { display: grid; grid-template-columns: 1.25fr 1fr; gap: 26px; align-items: center; padding: 26px 0 34px; }
  .hero h1 { font-size: 34px; line-height: 1.15; margin-bottom: 12px; }
  .lead { font-size: 16.5px; line-height: 1.6; color: var(--ink-dim); }
  .ticks { list-style: none; padding: 0; margin: 16px 0 0; display: flex; flex-direction: column; gap: 8px; }
  .ticks li { padding-left: 26px; position: relative; line-height: 1.45; }
  .ticks li::before { content: '✓'; position: absolute; left: 0; color: var(--ok); font-weight: 900; }
  .login-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); }
  section { margin: 26px 0; }
  section h2 { margin-bottom: 14px; }
  .feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .feat { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
  .fi { font-size: 24px; display: block; margin-bottom: 6px; }
  .feat p { color: var(--ink-dim); font-size: 13px; line-height: 1.5; margin-top: 4px; }
  .steps { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .steps li { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: flex; gap: 10px; align-items: flex-start; line-height: 1.45; font-size: 13.5px; }
  .steps b { background: var(--accent); color: var(--accent-ink); width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none; }
  .trust { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .tcard { background: var(--soft); border-radius: 12px; padding: 14px; font-size: 13.5px; line-height: 1.5; }
  .tcard p { color: var(--ink-dim); margin: 6px 0; }
  .tcard a { font-weight: 700; }
  .lfoot { border-top: 1px solid var(--border); margin-top: 34px; padding-top: 14px; font-size: 12px; color: var(--ink-dim); text-align: center; line-height: 1.8; }
  @media (max-width: 860px) {
    .hero { grid-template-columns: 1fr; }
    .feat-grid, .trust { grid-template-columns: 1fr 1fr; }
    .steps { grid-template-columns: 1fr 1fr; }
    .hero h1 { font-size: 27px; }
  }
  @media (max-width: 520px) { .feat-grid, .trust, .steps { grid-template-columns: 1fr; } }
</style>
