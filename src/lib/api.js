let token = localStorage.getItem('docbingo_token') || null;
export function setToken(t) { token = t; if (t) localStorage.setItem('docbingo_token', t); }

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-DocBingo-Token': token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { window.dispatchEvent(new CustomEvent('docbingo:auth')); throw new Error('auth'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  get: (url) => call('GET', url),
  post: (url, body) => call('POST', url, body),
  put: (url, body) => call('PUT', url, body),
  del: (url) => call('DELETE', url),
  async upload(file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: token ? { 'X-DocBingo-Token': token } : {}, body: fd });
    return res.json();
  }
};

/** Resize an image client-side before upload (max 1200px, JPEG q0.85). */
export function resizeImage(file, maxDim = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => resolve(new File([b], (file.name.replace(/\.[^.]+$/, '') || 'image') + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}
