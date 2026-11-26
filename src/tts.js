const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const config = {
  PIPER_PYTHON: process.env.PIPER_PYTHON || '',
  PIPER_MODEL: process.env.PIPER_MODEL || '',
  PIPER_LENGTH_SCALE: 1.1,
  TTS_MAX_CHARS: 500,
  TTS_TIMEOUT_MS: Number(process.env.TTS_TIMEOUT_MS) || 20000,
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

// Un solo proceso de Piper, cargado en memoria. Los pedidos hacen fila.
const ARRANQUE_MS = 90000;
let obrero = null;

function arrancar() {
  if (obrero) return obrero;
  const p = spawn(
    config.PIPER_PYTHON,
    [path.join(__dirname, 'piper_worker.py'), config.PIPER_MODEL, String(config.PIPER_LENGTH_SCALE)],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const o = { p, pendiente: null, err: '' };
  o.listo = new Promise((resolve, reject) => {
    const timer = setTimeout(() => caer(new Error('Piper no arrancó a tiempo')), ARRANQUE_MS);
    function caer(e) {
      clearTimeout(timer);
      if (obrero === o) obrero = null;
      p.kill('SIGKILL');
      reject(e);
      if (o.pendiente) o.pendiente.reject(e);
    }
    o.caer = caer;
    readline.createInterface({ input: p.stdout }).on('line', (linea) => {
      let r;
      try { r = JSON.parse(linea); } catch (e) { return; }
      if (r.listo) { clearTimeout(timer); console.log('[speak] voz cargada'); return resolve(); }
      if (!o.pendiente) return;
      if (r.ok) o.pendiente.resolve();
      else o.pendiente.reject(new Error(r.error));
    });
    p.stderr.on('data', (d) => { o.err = (o.err + d).slice(-2000); });
    p.stdin.on('error', () => {});
    p.on('error', caer);
    p.on('close', (code) => caer(new Error('Piper se cerró con código ' + code + ': ' + o.err.slice(-300))));
  });
  o.listo.catch((e) => console.error('[speak]', e.message));
  obrero = o;
  return o;
}

let fila = Promise.resolve();
let enEspera = 0;

async function generar(texto, archivo) {
  const o = arrancar();
  await o.listo;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      o.pendiente = { resolve, reject };
      timer = setTimeout(() => o.caer(new Error('Piper tardó demasiado')), config.TTS_TIMEOUT_MS);
      o.p.stdin.write(JSON.stringify({ texto, archivo }) + '\n');
    });
  } finally {
    clearTimeout(timer);
    o.pendiente = null;
  }
}

async function sintetizar(texto) {
  if (enEspera > config.TTS_COLA_MAX) {
    const e = new Error('cola llena');
    e.ocupado = true;
    throw e;
  }
  const archivo = path.join(os.tmpdir(), 'lexio-' + crypto.randomUUID() + '.wav');
  enEspera++;
  const trabajo = fila.then(() => generar(texto, archivo));
  fila = trabajo.catch(() => {});
  try {
    await trabajo;
    return await fs.promises.readFile(archivo);
  } finally {
    enEspera--;
    fs.promises.unlink(archivo).catch(() => {});
  }
}

// Carga la voz al iniciar el servidor para que la primera respuesta no espere.
if (disponible()) arrancar();

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
