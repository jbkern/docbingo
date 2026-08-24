<script>
  /* Charte d'utilisation — page consultable par tout le monde (#/charter) et contenu du modal d'acceptation. */
  import { lang } from '../lib/i18n.js';
  import { charter, CHARTER_DATE } from '../lib/charter.js';
  import { withAuthor } from '../lib/author.js';
  export let embedded = false; // dans le modal d'acceptation : sans titre H1
  $: c = charter[$lang] || charter.fr;
</script>

<div class="charter" class:embedded data-nosnippet>
  {#if !embedded}
    <h1>📜 {c.title}</h1>
    <div class="muted" style="margin-bottom:14px">{c.subtitle}</div>
  {/if}
  <p class="intro">{withAuthor(c.intro)}</p>
  {#each c.sections as s}
    <section>
      <h2>{s.h}</h2>
      {#each s.p as p}<p>{withAuthor(p)}</p>{/each}
    </section>
  {/each}
  {#if !embedded}
    <p class="muted" style="margin-top:14px; font-size:12.5px">v{1} · {CHARTER_DATE} · <a href="#/about">← DocBingo</a></p>
  {/if}
</div>

<style>
  .charter { max-width: 780px; }
  .charter p { line-height: 1.6; margin: 6px 0; }
  .intro { font-weight: 600; }
  section { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin: 10px 0; }
  section h2 { margin: 0 0 6px; font-size: 15px; }
  .embedded section { padding: 8px 10px; }
</style>
