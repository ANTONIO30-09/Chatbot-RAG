const express = require('express');
const tts = require('./tts');
const router = express.Router();

router.post('/api/speak', async (req, res) => {
  if (!tts.disponible()) return res.status(503).json({ error: 'voz no disponible' });
  const texto = tts.limpiar(req.body && req.body.texto);
  if (!texto) return res.status(400).json({ error: 'texto vacío' });
  try {
    const wav = await tts.hablar(texto);
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'no-store');
    res.send(wav);
  } catch (e) {
    console.error('[speak]', e.message);
    res.status(e.ocupado ? 429 : 500).json({ error: e.ocupado ? 'ocupado' : 'fallo de voz' });
  }
});

module.exports = router;
