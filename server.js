const express = require('express');
const path = require('path');
const config = require('./src/config');
const rag = require('./src/rag');
const routes = require('./src/routes');

if (!config.GROQ_API_KEY) {
  console.warn('[aviso] Falta GROQ_API_KEY en .env: el bot responderá en modo sin IA.');
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '50kb' }));
app.use(routes);
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => res.status(404).json({ error: 'No encontrado' }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const msg = status === 413 ? 'El audio o el mensaje es demasiado grande.' : status < 500 ? 'Solicitud inválida.' : 'Error interno.';
  res.status(status).json({ error: msg });
});

app.listen(config.PORT, () => {
  console.log('Bot de carreras en http://localhost:' + config.PORT + '  |  chunks: ' + rag.total + '  |  IA: ' + (config.GROQ_API_KEY ? 'activa' : 'sin llave'));
});
