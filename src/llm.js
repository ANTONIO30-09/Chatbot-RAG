const config = require('./config');

// Orden de intento: modelos de Groq y después Gemini. Solo entran los que tienen llave.
function proveedores() {
  const lista = [];
  if (config.GROQ_API_KEY) {
    for (const modelo of config.MODELOS) {
      lista.push({
        modelo,
        url: config.GROQ_BASE + '/chat/completions',
        llave: config.GROQ_API_KEY,
        timeout: config.LLM_TIMEOUT_MS,
        extra: (opts) => ({ temperature: 0.6, max_completion_tokens: opts.modo === 'voz' ? 700 : 1200 })
      });
    }
  }
  if (config.GEMINI_API_KEY) {
    lista.push({
      modelo: config.GEMINI_MODEL,
      url: config.GEMINI_BASE + '/chat/completions',
      llave: config.GEMINI_API_KEY,
      timeout: config.GEMINI_TIMEOUT_MS,
      // Margen amplio porque el razonamiento también consume tokens.
      extra: () => ({ max_tokens: 2000 })
    });
  }
  return lista;
}

async function llamar(p, mensajes, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), p.timeout);
  try {
    const r = await fetch(p.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + p.llave,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: p.modelo,
        messages: mensajes,
        reasoning_effort: 'low',
        ...p.extra(opts)
      }),
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const data = await r.json();
    const texto = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!texto || !texto.trim()) throw new Error('respuesta vacia');
    return texto.trim();
  } finally {
    clearTimeout(timer);
  }
}

// Prueba cada proveedor en orden hasta que uno responda.
async function responder(mensajes, opts = {}) {
  const lista = proveedores();
  if (!lista.length) throw new Error('No hay llaves de IA configuradas');
  const errores = [];
  for (const p of lista) {
    try {
      return { texto: await llamar(p, mensajes, opts), modelo: p.modelo };
    } catch (e) {
      console.error('[llm] fallo ' + p.modelo + ': ' + e.message);
      errores.push(p.modelo + ': ' + e.message);
    }
  }
  const err = new Error('Todos los modelos fallaron');
  err.detalle = errores;
  throw err;
}

module.exports = { responder };
