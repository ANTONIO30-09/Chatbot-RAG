const config = require('./config');

// Frases que Whisper inventa cuando el audio es silencio o ruido.
const ALUCINACIONES = new Set([
  'gracias', 'gracias por ver el video', 'gracias por ver', 'suscribete',
  'subtitulos por la comunidad de amara.org', 'amara.org'
]);

function normal(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9. ]/g, '').trim().replace(/\.+$/, '');
}

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
  fd.append('response_format', 'verbose_json');
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
    const segs = Array.isArray(data.segments) ? data.segments : [];
    if (segs.length && segs.every((s) => s.no_speech_prob > 0.6)) return '';
    const texto = String(data.text || '').trim();
    if (ALUCINACIONES.has(normal(texto))) return '';
    return texto;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { transcribir };
