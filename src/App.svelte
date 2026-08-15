<script>
  import { onMount } from 'svelte';
  import { t, lang } from './lib/i18n.js';
  import { api, setToken } from './lib/api.js';
  import Home from './pages/Home.svelte';
  import Questions from './pages/Questions.svelte';
  import QuestionForm from './pages/QuestionForm.svelte';
  import Sessions from './pages/Sessions.svelte';
  import SessionNew from './pages/SessionNew.svelte';
  import SessionDetail from './pages/SessionDetail.svelte';
  import Play from './pages/Play.svelte';
  import Display from './pages/Display.svelte';
  import Remote from './pages/Remote.svelte';
  import Join from './pages/Join.svelte';
  import Stats from './pages/Stats.svelte';
  import Review from './pages/Review.svelte';
  import Import from './pages/Import.svelte';
  import Settings from './pages/Settings.svelte';
  import About from './pages/About.svelte';
  import Demo from './pages/Demo.svelte';
  import InstallHint from './lib/InstallHint.svelte';
  import Charter from './pages/Charter.svelte';
  import { charter as charterText } from './lib/charter.js';

  let route = { page: 'questions', param: null };
  let settings = { lang: 'fr', theme: 'suisse', sounds: true, animations: true };
  let runningSession = null;

  function parseHash() {
    const h = (location.hash || '#/home').slice(2);
    const [page, param] = h.split('/');
    route = { page: page || 'home', param: param || null };
    if (page === 'reset' && param) { resetToken = param; }
  }

  async function loadSettings() {
    try {
      settings = await api.get('/api/settings');
      applySettings();
    } catch {}
  }
  function applySettings() {
    document.documentElement.dataset.theme = settings.theme || 'suisse';
    lang.set(settings.lang || 'fr');
  }
  async function checkRunning() {
    try {
      const sessions = await api.get('/api/sessions');
      runningSession = sessions.find(s => s.status === 'running') || null;
    } catch {}
  }

  let needLogin = false;
  let email = localStorage.getItem('docbingo_email') || '';
  let password = '';
  let loginError = false;
  let user = null;
  let pending = 0;
  let forgotMode = false; let forgotMsg = ''; let mailEnabled = false;
  let resetToken = null; let resetPw = ''; let resetPw2 = ''; let resetMsg = '';
  async function forgot() {
    forgotMsg = '';
    try { await api.post('/api/auth/forgot', { email: email.trim() }); forgotMsg = $t('login.forgotsent'); }
    catch (e) { forgotMsg = e.message === 'mail_not_configured' ? $t('login.forgotnomail') : $t('login.forgotfail'); }
  }
  async function doReset() {
    resetMsg = '';
    if (resetPw.length < 8) { resetMsg = $t('acct.tooshort'); return; }
    if (resetPw !== resetPw2) { resetMsg = $t('login.pwmismatch'); return; }
    try {
      const r = await api.post('/api/auth/reset', { token: resetToken, password: resetPw });
      setToken(r.token); user = r.user; resetToken = null; needLogin = false; location.hash = '#/home'; loadSettings(); checkRunning(); loadMe();
    } catch (e) { resetMsg = e.message === 'invalid_or_expired' ? $t('login.resetexpired') : e.message; }
  }
  async function doLogin() {
    loginError = false;
    try {
      const r = await api.post('/api/login', { email: email.trim(), password });
      setToken(r.token);
      user = r.user; localStorage.setItem('docbingo_email', email.trim());
      needLogin = false; password = '';
      loadSettings(); checkRunning(); loadMe();
    } catch { loginError = true; }
  }
  async function loadMe() {
    try { user = await api.get('/api/me'); pending = (await api.get('/api/review/pending')).count; } catch {}
  }
  function logout() { setToken(null); localStorage.removeItem('docbingo_token'); user = null; needLogin = true; }

  onMount(() => {
    parseHash();
    fetch('/api/auth/mail-status').then(r => r.json()).then(d => (mailEnabled = !!d.enabled)).catch(() => {});
    loadSettings();
    checkRunning();
    loadMe();
    window.addEventListener('hashchange', () => { parseHash(); checkRunning(); loadMe(); });
    window.addEventListener('docbingo:settings', (e) => { settings = e.detail; applySettings(); });
    window.addEventListener('docbingo:auth', () => { needLogin = true; });
    // Keep-alive : évite l'endormissement de l'hébergement gratuit tant que l'application est ouverte
    const ka = setInterval(() => fetch('/api/ping').catch(() => {}), 4 * 60 * 1000);
    return () => clearInterval(ka);
  });

  $: isPlay = route.page === 'play';
  $: isDisplay = route.page === 'display';
  $: isRemote = route.page === 'remote';
  $: isJoin = route.page === 'join';
  $: isAbout = route.page === 'about';
  $: isCharter = route.page === 'charter';
  let menuOpen = false;
  $: route, (menuOpen = false);
  $: needCharter = !!(user?.id && !user.charterAccepted);
  let charterOk = false; let charterBusy = false;
  async function acceptCharter() { charterBusy = true; try { await api.post('/api/me/charter', {}); user = { ...user, charterAccepted: true }; } catch {} charterBusy = false; }
  $: ct = charterText[$lang] || charterText.fr;
</script>

{#if resetToken}
  <div class="login-bg">
    <div class="login-box">
      <h1 style="margin:10px 0 6px">DocBingo</h1>
      <div class="muted" style="margin-bottom:14px">{$t('login.resettitle')}</div>
      <input type="password" placeholder={$t('acct.new')} bind:value={resetPw} autocomplete="new-password" style="max-width:280px; text-align:center; margin-bottom:8px" />
      <input type="password" placeholder={$t('login.pwrepeat')} bind:value={resetPw2} autocomplete="new-password" on:keydown={(e) => e.key === 'Enter' && doReset()} style="max-width:280px; text-align:center" />
      {#if resetMsg}<div style="color:var(--danger); font-size:13px; margin-top:8px; font-weight:700">{resetMsg}</div>{/if}
      <button class="btn" style="margin-top:14px" on:click={doReset} disabled={!resetPw || !resetPw2}>{$t('login.resetbtn')}</button>
      <a class="muted" href="#/home" on:click={() => (resetToken = null)} style="margin-top:12px; font-size:12px">← {$t('login.enter')}</a>
    </div>
  </div>
{:else if isCharter}
  <div class="shell"><main style="padding-top:20px"><Charter /></main></div>
{:else if isAbout}
  <div class="shell"><main style="padding-top:20px"><About /><p style="margin-top:16px"><a href="#/home">← DocBingo</a></p></main></div>
{:else if isJoin}
  <Join codeParam={route.param} />
{:else if isRemote}
  <Remote sessionId={route.param} />
{:else if needLogin}
  <div class="login-bg">
    <div class="login-box">
      <svg width="46" height="46" viewBox="0 0 100 100">
        <rect x="5" y="5" width="90" height="90" rx="16" fill="var(--panel)" stroke="var(--accent)" stroke-width="6"/>
        <circle cx="50" cy="50" r="17" fill="var(--accent-2)"/>
        <rect x="46" y="39" width="8" height="22" rx="2" fill="var(--accent-2-ink)"/>
        <rect x="39" y="46" width="22" height="8" rx="2" fill="var(--accent-2-ink)"/>
      </svg>
      <h1 style="margin:10px 0 18px">DocBingo</h1>
      <input type="email" placeholder="Email" bind:value={email} autocomplete="username" style="max-width:280px; text-align:center; margin-bottom:8px" />
      {#if !forgotMode}
        <input type="password" placeholder={$t('login.password')} bind:value={password} autocomplete="current-password"
          on:keydown={(e) => e.key === 'Enter' && doLogin()} style="max-width:280px; text-align:center" />
        {#if loginError}<div style="color:var(--danger); font-size:13px; margin-top:8px; font-weight:700">{$t('login.error')}</div>{/if}
        <button class="btn" style="margin-top:14px" on:click={doLogin}>{$t('login.enter')}</button>
        <button class="linkbtn" on:click={() => { forgotMode = true; forgotMsg = ''; }}>{$t('login.forgot')}</button>
      {:else}
        <div class="muted" style="max-width:300px; line-height:1.5; margin:4px 0 10px">{mailEnabled ? $t('login.forgothelp') : $t('login.forgotnomail')}</div>
        {#if mailEnabled}<button class="btn" on:click={forgot} disabled={!email.includes('@')}>{$t('login.forgotsend')}</button>{/if}
        {#if forgotMsg}<div class="alert ok" style="margin-top:10px; max-width:300px">{forgotMsg}</div>{/if}
        <button class="linkbtn" on:click={() => (forgotMode = false)}>← {$t('login.enter')}</button>
      {/if}
      <div class="muted" style="margin-top:14px; font-size:12.5px; max-width:300px; line-height:1.5">{$t('login.hint')}</div>
      <a class="muted" href="#/about" style="margin-top:12px; font-size:12px">{$t('about.title')}</a>
    </div>
  </div>
{:else if isDisplay}
  <Display sessionId={route.param} {settings} />
{:else if isPlay}
  <Play sessionId={route.param} {settings} />
{:else}
  <div class="shell">
    <header>
      <a class="brand" href="#/home">
        <svg width="34" height="34" viewBox="0 0 100 100">
          <rect x="5" y="5" width="90" height="90" rx="16" fill="var(--panel)" stroke="var(--accent)" stroke-width="6"/>
          <circle cx="50" cy="50" r="17" fill="var(--accent-2)"/>
          <rect x="46" y="39" width="8" height="22" rx="2" fill="var(--accent-2-ink)"/>
          <rect x="39" y="46" width="22" height="8" rx="2" fill="var(--accent-2-ink)"/>
        </svg>
        <span><b>DocBingo</b><small>{$t('app.tagline')}</small></span>
      </a>
      <button class="burger" on:click={() => (menuOpen = !menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>{menuOpen ? '✕' : '☰'}</button>
      <nav class:open={menuOpen}>
        <a href="#/home" class:active={route.page === 'home'}>{$t('nav.home')}</a>
        <a href="#/questions" class:active={['questions', 'question', 'import'].includes(route.page)}>{$t('nav.questions')}</a>
        {#if user?.role === 'admin' && pending}<a href="#/review" class:active={route.page === 'review'}>{$t('nav.review')} <span class="badge">{pending}</span></a>{/if}
        <a href="#/sessions" class:active={['sessions','session','session-new'].includes(route.page)}>{$t('nav.sessions')}</a>
        <a href="#/stats" class:active={route.page === 'stats'}>{$t('nav.stats')}</a>
        <a href="#/settings" class:active={route.page === 'settings'}>{$t('nav.settings')}</a>
        {#if user?.id}<button class="userbtn" on:click={logout} title={(user.role === 'admin' ? $t('role.admin') : $t('role.author')) + ' — ' + $t('login.logout')}><span class="uname">{user.name}</span> ⏻ <span class="logout-label">{$t('login.logout')}</span></button>{/if}
      </nav>
    </header>
    {#if needCharter}
      <div class="modal-bg">
        <div class="modal">
          <h2 style="margin:0 0 4px">📜 {ct.title}</h2>
          <div class="muted" style="font-size:12.5px; margin-bottom:8px">{ct.subtitle}</div>
          <div class="modal-body"><Charter embedded /></div>
          <div class="row" style="gap:10px; margin-top:10px; align-items:center; flex-wrap:nowrap"><input id="charter-ok" type="checkbox" bind:checked={charterOk} style="width:18px; height:18px; flex:none" /> <span style="font-weight:600; line-height:1.4"><label for="charter-ok" style="all:unset; cursor:pointer">{ct.accept}</label></span></div>
          <div class="row" style="gap:8px; margin-top:10px; flex-wrap:wrap">
            <button class="btn" disabled={!charterOk || charterBusy} on:click={acceptCharter}>{ct.acceptBtn}</button>
            <button class="btn secondary" on:click={logout}>{$t('login.logout')}</button>
          </div>
        </div>
      </div>
    {/if}
    <InstallHint />
    {#if user?.mustChange}
      <div class="alert warn" style="margin-bottom:14px">🔑 {$t('login.mustchange')} <a href="#/settings">{$t('nav.settings')} →</a></div>
    {/if}

    {#if runningSession && route.page !== 'play' && route.page !== 'home'}
      <a class="resume" href={'#/play/' + runningSession.id}>
        ▶ {$t('app.resume')} : <b>{runningSession.name}</b> ({$t('app.question')} {runningSession.currentIndex + 1})
      </a>
    {/if}

    <main>
      {#if route.page === 'home'}<Home {user} />
      {:else if route.page === 'questions'}<Questions />
      {:else if route.page === 'question'}<QuestionForm id={route.param} />
      {:else if route.page === 'import'}<Import />
      {:else if route.page === 'sessions'}<Sessions />
      {:else if route.page === 'session-new'}<SessionNew />
      {:else if route.page === 'session'}<SessionDetail id={route.param} />
      {:else if route.page === 'stats'}<Stats />
      {:else if route.page === 'review'}<Review on:done={loadMe} />
      {:else if route.page === 'settings'}<Settings {settings} {user} />
      {:else if route.page === 'about'}<About />
      {:else if route.page === 'demo'}<Demo />
      {:else if route.page === 'charter'}<Charter />
      {:else}<Home {user} />{/if}
    </main>
    <footer class="foot"><span>DocBingo © {new Date().getFullYear()} Jean-Baptiste Kern & co-auteurs</span> · <a href="#/about">{$t('about.title')}</a> · <a href="#/charter">{ct.title}</a> · <a href="/guide.html" target="_blank">{$t('settings.openguide')}</a> · <span>AGPL-3.0 · CC BY-NC-SA 4.0</span></footer>
  </div>
{/if}

<style>
  .linkbtn { background: none; border: none; color: var(--ink-dim); text-decoration: underline; font-size: 12.5px; margin-top: 12px; cursor: pointer; }
  .foot { border-top: 1px solid var(--border); margin-top: 40px; padding: 14px 0; font-size: 12px; color: var(--ink-dim); text-align: center; line-height: 1.8; }
  .foot a { color: var(--ink-dim); }
  .shell { max-width: 1080px; margin: 0 auto; padding: 0 18px 60px; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 0; border-bottom: 2px solid var(--border); margin-bottom: 20px; gap: 14px; flex-wrap: wrap;
  }
  .brand { display: flex; align-items: center; gap: 11px; text-decoration: none; color: var(--ink); }
  .brand span { display: flex; flex-direction: column; line-height: 1.15; }
  .brand b { font-size: 19px; letter-spacing: var(--title-spacing); }
  .brand small { font-size: 11.5px; color: var(--ink-dim); }
  nav { display: flex; gap: 4px; }
  nav a {
    text-decoration: none; color: var(--ink-dim); font-weight: 700; font-size: 14.5px;
    padding: 8px 15px; border-radius: calc(var(--radius) - 2px);
  }
  nav a.active { background: var(--accent); color: var(--accent-ink); }
  nav a:hover:not(.active) { background: var(--soft); color: var(--soft-ink); }
  .badge { background: var(--accent-2); color: var(--accent-2-ink); border-radius: 999px; padding: 1px 7px; font-size: 11px; margin-left: 3px; }
  .userbtn { border: 1px solid var(--border); background: var(--panel); color: var(--ink-dim); border-radius: 999px; padding: 6px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; margin-left: 6px; }
  .uname { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
  .burger { display: none; }
  .logout-label { display: none; }
  @media (max-width: 760px) {
    .shell { padding: 0 12px 40px; }
    header { position: relative; flex-wrap: nowrap; align-items: center; gap: 8px; padding: 10px 0; margin-bottom: 14px; }
    .brand b { font-size: 17px; }
    .burger { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--ink); font-size: 20px; cursor: pointer; flex: none; }
    nav { display: none; position: absolute; top: calc(100% + 2px); left: 0; right: 0; z-index: 800; flex-direction: column; gap: 2px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 8px; box-shadow: 0 12px 30px rgba(0,0,0,.18); }
    nav.open { display: flex; }
    nav a { padding: 12px 14px; font-size: 15px; border-radius: 8px; }
    .userbtn { margin: 6px 0 0; padding: 11px 14px; border-radius: 8px; text-align: left; font-size: 14px; display: flex; gap: 8px; align-items: center; }
    .uname { max-width: 55%; }
    .logout-label { display: inline; margin-left: auto; opacity: .8; }
  }
  .modal-bg { position: fixed; inset: 0; background: rgba(10,20,35,.55); z-index: 900; display: flex; align-items: center; justify-content: center; padding: 14px; }
  .modal { background: var(--bg); border-radius: 14px; max-width: 760px; width: 100%; max-height: 92vh; display: flex; flex-direction: column; padding: 16px 18px; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
  .modal-body { overflow: auto; flex: 1; min-height: 0; border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; background: var(--panel); }
  .login-bg { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); }
  .login-box { text-align: center; display: flex; flex-direction: column; align-items: center; padding: 30px; }
  .resume {
    display: block; text-decoration: none; margin-bottom: 18px;
    background: color-mix(in srgb, var(--ok) 15%, var(--panel)); color: var(--ink);
    border: 2px solid var(--ok); border-radius: var(--radius); padding: 12px 16px; font-size: 14.5px;
  }
</style>
