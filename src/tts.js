const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const config = {
  PIPER_PYTHON: process.env.PIPER_PYTHON || '',
  PIPER_MODEL: process.env.PIPER_MODEL || '',
  PIPER_LENGTH_SCALE: 1.1,
  TTS_MAX_CHARS: 500,
  TTS_TIMEOUT_MS: Number(process.env.TTS_TIMEOUT_MS) || 20000,
  TTS_CONCURRENCIA: 2,
  TTS_COLA_MAX: 6,
  TTS_CACHE_MAX: 100
};

// Cómo se debe pronunciar lo que el sintetizador en español suele leer mal.
const PRONUNCIACION = [
  [/UNIFRANZ/gi, 'Unifrans'],
  [/legal\s?tech/gi, 'Legal Tek'],
  [/blockchain/gi, 'blokchéin'],
  [/\bIA\b/g, 'inteligencia artificial']
];

function disponible() {
  return Boolean(config.PIPER_PYTHON && config.PIPER_MODEL && fs.existsSync(config.PIPER_MODEL));
}

// Quita símbolos y enlaces, aplica pronunciación y recorta en un final de frase.
function limpiar(texto) {
  let t = String(texto || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#`~>|\[\]{}<]/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, sust] of PRONUNCIACION) t = t.replace(re, sust);
  if (t.length > config.TTS_MAX_CHARS) {
    const corte = t.slice(0, config.TTS_MAX_CHARS);
    const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '));
    t = fin > 100 ? corte.slice(0, fin + 1) : corte;
  }
  return t;
}

// Máximo de Piper en paralelo; el resto espera en cola.
let activos = 0;
const cola = [];
function turno() {
  return new Promise((resolve, reject) => {
    const entrar = () => { activos++; resolve(); };
    if (activos < config.TTS_CONCURRENCIA) return entrar();
    if (cola.length >= config.TTS_COLA_MAX) {
      const e = new Error('cola llena');
      e.ocupado = true;
      return reject(e);
    }
    cola.push(entrar);
  });
}
function liberar() {
  activos--;
  const siguiente = cola.shift();
  if (siguiente) siguiente();
}

async function sintetizar(texto) {
  const archivo = path.join(os.tmpdir(), 'lexio-' + crypto.randomUUID() + '.wav');
  await turno();
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(
        config.PIPER_PYTHON,
        ['-m', 'piper', '-m', config.PIPER_MODEL, '--length-scale', String(config.PIPER_LENGTH_SCALE), '-f', archivo, '--', texto],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      );
      let err = '';
      p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
      const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Piper tardó demasiado')); }, config.TTS_TIMEOUT_MS);
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error('Piper terminó con código ' + code + ': ' + err.slice(-300)));
      });
    });
    return await fs.promises.readFile(archivo);
  } finally {
    liberar();
    fs.promises.unlink(archivo).catch(() => {});
  }
}

// Caché: las frases repetidas (por ejemplo las de los botones) no vuelven a sintetizarse.
const cache = new Map();
async function hablar(texto) {
  const clave = crypto.createHash('sha1').update(texto).digest('hex');
  if (cache.has(clave)) return cache.get(clave);
  const wav = await sintetizar(texto);
  cache.set(clave, wav);
  if (cache.size > config.TTS_CACHE_MAX) cache.delete(cache.keys().next().value);
  return wav;
}

module.exports = { disponible, limpiar, hablar };
