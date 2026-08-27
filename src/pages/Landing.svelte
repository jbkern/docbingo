<script>
  /* Page vitrine publique (visiteurs non connectés) — version épurée : héros + 4 atouts + bandeau confiance. */
  import { t, lang } from '../lib/i18n.js';
  const features = [
    { icon: '🎱', k: 'bank' }, { icon: '🖨️', k: 'grids' }, { icon: '🖥️', k: 'present' }, { icon: '📊', k: 'stats' }
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
    </div>
    <div class="login-card">
      <slot />
    </div>
  </section>

  <section class="feat-grid">
    {#each features as f}
      <div class="feat"><span class="fi">{f.icon}</span><b>{$t('landing.f.' + f.k)}</b><p>{$t('landing.f.' + f.k + '.d')}</p></div>
    {/each}
  </section>

  <section class="trustline">
    <span>📜 <a href="#/charter">{$t('charter.title')}</a></span>
    <span>⚖️ {$t('landing.t.short.lic')}</span>
    <span>🔒 {$t('landing.t.short.data')}</span>
    <span>💛 {$t('landing.freenote')}</span>
  </section>

  <footer class="lfoot">
    DocBingo © {new Date().getFullYear()} · <a href="#/about">{$t('about.title')}</a> · <a href="#/charter">{$t('charter.title')}</a> · AGPL-3.0 · CC BY-NC-SA 4.0
  </footer>
</div>

<style>
  .land { max-width: 1020px; margin: 0 auto; padding: 18px 18px 30px; }
  .lhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand span { display: flex; flex-direction: column; line-height: 1.15; }
  .brand b { font-size: 19px; } .brand small { font-size: 11.5px; color: var(--ink-dim); }
  .langsel { width: auto; padding: 7px 8px; font-weight: 700; }
  .hero { display: grid; grid-template-columns: 1.25fr 1fr; gap: 30px; align-items: center; padding: 30px 0 34px; }
  .hero h1 { font-size: 34px; line-height: 1.15; margin-bottom: 12px; }
  .lead { font-size: 16.5px; line-height: 1.6; color: var(--ink-dim); }
  .ticks { list-style: none; padding: 0; margin: 18px 0 0; display: flex; flex-direction: column; gap: 9px; }
  .ticks li { padding-left: 26px; position: relative; line-height: 1.45; }
  .ticks li::before { content: '✓'; position: absolute; left: 0; color: var(--ok); font-weight: 900; }
  .login-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); }
  .feat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 8px 0 26px; }
  .feat { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
  .fi { font-size: 24px; display: block; margin-bottom: 6px; }
  .feat p { color: var(--ink-dim); font-size: 13px; line-height: 1.5; margin-top: 4px; }
  .trustline { display: flex; flex-wrap: wrap; gap: 8px 26px; justify-content: center; background: var(--soft); border-radius: 12px; padding: 12px 16px; font-size: 13px; color: var(--soft-ink); }
  .trustline a { font-weight: 700; }
  .lfoot { border-top: 1px solid var(--border); margin-top: 26px; padding-top: 14px; font-size: 12px; color: var(--ink-dim); text-align: center; line-height: 1.8; }
  @media (max-width: 860px) {
    .hero { grid-template-columns: 1fr; padding-top: 16px; }
    .feat-grid { grid-template-columns: 1fr 1fr; }
    .hero h1 { font-size: 27px; }
  }
  @media (max-width: 520px) { .feat-grid { grid-template-columns: 1fr; } }
</style>
