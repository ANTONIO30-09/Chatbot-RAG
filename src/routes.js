const express = require('express');
const config = require('./config');
const rag = require('./rag');
const { construirPrompt } = require('./prompt');
const { responder } = require('./llm');
const { transcribir } = require('./stt');

const router = express.Router();

// Limitador simple por IP (en memoria). En un evento muchas personas pueden compartir IP: ajustar LIMITE_POR_MINUTO.
const ventanas = new Map();
function limitar(req, res, next) {
  const ahora = Date.now();
  let v = ventanas.get(req.ip);
  if (!v || ahora > v.reset) {
    v = { n: 0, reset: ahora + 60000 };
    ventanas.set(req.ip, v);
  }
  v.n++;
  if (v.n > config.LIMITE_POR_MINUTO) {
    return res.status(429).json({ error: 'Demasiadas preguntas seguidas. Espera un momento e intenta de nuevo.' });
  }
  next();
}
setInterval(() => {
  const t = Date.now();
  for (const [ip, v] of ventanas) if (t > v.reset) ventanas.delete(ip);
}, 60000).unref();

function limpiarHistorial(h) {
  if (!Array.isArray(h)) return [];
  return h
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-config.MAX_HISTORIAL)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
}

function respaldoSinIA(fuentes) {
  const c = fuentes[0];
  return 'Ahora mismo mi asistente de IA no está disponible, pero esto es lo más relevante que encontré:\n\n' +
    c.titulo + '\n' + c.texto +
    '\n\nPara más detalles escribe a info@unifranz.edu.bo o al WhatsApp +591 71502211.';
}

router.get('/health', (req, res) => {
  res.json({ ok: true, chunks: rag.total, ia: Boolean(config.GROQ_API_KEY), modelos: config.MODELOS, uptime_s: Math.round(process.uptime()) });
});

// Búsqueda directa, útil para depurar el RAG sin gastar IA.
router.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Falta el parámetro q' });
  const carrera = rag.detectarCarrera(q);
  const r = rag.buscar(q, { carrera }).map((x) => ({ id: x.id, carrera: x.carrera, titulo: x.titulo, score: Number(x.score.toFixed(2)) }));
  res.json({ carrera, resultados: r });
});

router.post('/api/chat', limitar, async (req, res) => {
  const cuerpo = req.body || {};
  const msg = typeof cuerpo.message === 'string' ? cuerpo.message.trim() : '';
  if (!msg) return res.status(400).json({ error: 'Escribe una pregunta.' });
  if (msg.length > config.MAX_MSG_CHARS) {
    return res.status(400).json({ error: 'La pregunta es muy larga (máximo ' + config.MAX_MSG_CHARS + ' caracteres).' });
  }

  const historial = limpiarHistorial(cuerpo.history);
  const previos = historial.filter((m) => m.role === 'user').map((m) => m.content);

  // La carrera sale de la pregunta actual o, si no la menciona, de las anteriores.
  const carrera = rag.detectarCarrera(msg) || [...previos].reverse().map(rag.detectarCarrera).find(Boolean) || null;
  // Preguntas cortas de seguimiento ("¿y las menciones?") se buscan junto a la pregunta previa.
  const consulta = msg.split(/\s+/).length < 6 && previos.length ? previos[previos.length - 1] + ' ' + msg : msg;

  const fuentes = rag.buscar(consulta, { carrera });
  const mensajes = [{ role: 'system', content: construirPrompt(fuentes) }, ...historial, { role: 'user', content: msg }];
  const ids = fuentes.map((f) => f.id);

  try {
    const r = await responder(mensajes);
    return res.json({ respuesta: r.texto, modelo: r.modelo, carrera, fuentes: ids });
  } catch (e) {
    console.error('[chat] respaldo sin IA:', e.message);
    return res.json({ respuesta: respaldoSinIA(fuentes), modelo: 'sin-ia', carrera, fuentes: ids });
  }
});

router.post('/api/transcribe', limitar, express.raw({ type: () => true, limit: config.MAX_AUDIO_BYTES }), async (req, res) => {
  if (!config.GROQ_API_KEY) return res.status(503).json({ error: 'La voz no está disponible ahora. Escribe tu pregunta.' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) {
    return res.status(400).json({ error: 'No se escuchó nada. Intenta grabar de nuevo.' });
  }
  try {
    const texto = await transcribir(req.body, req.headers['content-type']);
    if (!texto) return res.status(422).json({ error: 'No pude entender el audio. Intenta de nuevo.' });
    res.json({ texto });
  } catch (e) {
    console.error('[stt] fallo:', e.message);
    res.status(502).json({ error: 'No pude transcribir el audio. Escribe tu pregunta.' });
  }
});

module.exports = router;
