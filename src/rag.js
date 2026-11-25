const fs = require('fs');
const path = require('path');
const MiniSearch = require('minisearch');
const { TOP_K } = require('./config');

const quitarTildes = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const STOP = new Set(
  'el la los las un una unos unas de del al y o u e en a por para con sin que se su sus es son ser como cual cuales cuando donde mi me te lo le les ya hay mas muy si no pero este esta estos estas ese esa eso tiene tienen puedo puede pueden quiero quisiera hola dime sobre'.split(' ')
);

// Singular aproximado: menciones -> mencion, carreras -> carrera
function raiz(t) {
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

const chunks = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'knowledge', 'chunks.json'), 'utf8')
);
const porId = new Map(chunks.map((c) => [c.id, c]));

const index = new MiniSearch({
  fields: ['titulo', 'tema', 'texto'],
  storeFields: ['carrera'],
  processTerm: (t) => {
    const n = quitarTildes(t.toLowerCase());
    return n.length < 2 || STOP.has(n) ? null : raiz(n);
  },
  searchOptions: { boost: { titulo: 3, tema: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'OR' }
});
index.addAll(chunks);

const RE_SIS = /sistemas|ingenier|software|programacion|datos|ciberseg|redes|\bia\b|inteligencia artificial|mondrag|cloud|informatic/;
const RE_DER = /derecho|abogad|juridic|legal|penal|\bleyes?\b|justicia|jurisprud|notari|litig/;

function detectarCarrera(texto) {
  const t = quitarTildes(String(texto).toLowerCase());
  const s = RE_SIS.test(t);
  const d = RE_DER.test(t);
  if (s && !d) return 'sistemas';
  if (d && !s) return 'derecho';
  return null;
}

function buscar(consulta, { carrera = null, k = TOP_K } = {}) {
  const opciones = carrera
    ? { filter: (r) => r.carrera === carrera || r.carrera === 'general' }
    : {};
  const res = index.search(consulta, opciones).slice(0, k);
  if (!res.length) {
    return ['gen-01', 'gen-09'].map((id) => ({ ...porId.get(id), score: 0 }));
  }
  return res.map((r) => ({ ...porId.get(r.id), score: r.score }));
}

module.exports = { buscar, detectarCarrera, total: chunks.length };
