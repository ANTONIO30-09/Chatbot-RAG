const config = require('./config');

function extension(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'mp4';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'webm';
}

async function transcribir(buffer, mime) {
  const tipo = String(mime || 'audio/webm').split(';')[0];
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: tipo }), 'audio.' + extension(mime));
  fd.append('model', config.STT_MODEL);
  fd.append('language', 'es');
  fd.append('temperature', '0');
  fd.append('response_format', 'json');
  fd.append('prompt', 'UNIFRANZ, microcredenciales, menciones, Ingeniería de Sistemas e Innovación Digital, Derecho, blockchain, Legal Tech, ciberseguridad');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.STT_TIMEOUT_MS);
  try {
    const r = await fetch(config.GROQ_BASE + '/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.GROQ_API_KEY },
      body: fd,
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const data = await r.json();
    return String(data.text || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { transcribir };
