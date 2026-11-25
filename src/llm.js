const config = require('./config');

async function llamar(modelo, mensajes) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.LLM_TIMEOUT_MS);
  try {
    const r = await fetch(config.GROQ_BASE + '/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.GROQ_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes,
        temperature: 0.3,
        max_completion_tokens: 1200,
        reasoning_effort: 'low'
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

// Prueba el modelo principal y, si falla, el de respaldo.
async function responder(mensajes) {
  if (!config.GROQ_API_KEY) throw new Error('Falta GROQ_API_KEY');
  const errores = [];
  for (const modelo of config.MODELOS) {
    try {
      return { texto: await llamar(modelo, mensajes), modelo };
    } catch (e) {
      console.error('[llm] fallo ' + modelo + ': ' + e.message);
      errores.push(modelo + ': ' + e.message);
    }
  }
  const err = new Error('Todos los modelos fallaron');
  err.detalle = errores;
  throw err;
}

module.exports = { responder };
