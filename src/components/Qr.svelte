<script>
  /* QR code SVG (bibliothèque qrcode, rendu vectoriel, aucune requête réseau). */
  import QRCode from 'qrcode';
  export let text = '';
  export let size = 120;
  export let light = false; // sur fond sombre : modules clairs
  let svg = '';
  $: QRCode.toString(text || ' ', { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: light ? { dark: '#ffffffff', light: '#00000000' } : { dark: '#000000ff', light: '#ffffffff' } })
    .then(s => (svg = s)).catch(() => (svg = ''));
</script>

<div class="qr" style="width:{size}px; height:{size}px" aria-label={text}>{@html svg}</div>

<style>
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .qr { border-radius: 8px; overflow: hidden; }
</style>
