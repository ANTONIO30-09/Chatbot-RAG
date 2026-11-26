(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const el = {
    chat: $('#chat'),
    hero: $('#hero'),
    mensajes: $('#mensajes'),
    form: $('#form'),
    entrada: $('#entrada'),
    enviar: $('#btn-enviar'),
    nuevo: $('#btn-nuevo'),
    chips: $('#chips')
  };

  const MAX_HISTORIAL = 6;
  const TIMEOUT_MS = 35000;
  let historial = [];
  let ocupado = false;
  let esPrimerBot = true;

  // ---------- Formato seguro: se escapa todo el HTML y solo se permiten negritas y listas ----------
  function escapar(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function negritas(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  function formatear(texto) {
    const lineas = escapar(String(texto).trim()).split('\n');
    let html = '';
    let enLista = false;
    let parrafo = [];
    const cerrarParrafo = () => {
      if (parrafo.length) { html += '<p>' + parrafo.join('<br>') + '</p>'; parrafo = []; }
    };
    const cerrarLista = () => {
      if (enLista) { html += '</ul>'; enLista = false; }
    };
    for (const linea of lineas) {
      const t = linea.trim();
      const item = t.match(/^[-*•]\s+(.*)$/);
      if (item) {
        cerrarParrafo();
        if (!enLista) { html += '<ul>'; enLista = true; }
        html += '<li>' + negritas(item[1]) + '</li>';
      } else if (!t) {
        cerrarParrafo();
        cerrarLista();
      } else {
        cerrarLista();
        parrafo.push(negritas(t));
      }
    }
    cerrarParrafo();
    cerrarLista();
    return html;
  }

  // ---------- Mensajes ----------
  function bajar() {
    el.chat.scrollTo({ top: el.chat.scrollHeight, behavior: 'smooth' });
  }

  function crearFila(rol) {
    const fila = document.createElement('div');
    fila.className = 'fila ' + rol;
    let icono = null;
    if (rol === 'bot') {
      icono = document.createElement('img');
      icono.className = 'msg-icon';
      icono.src = 'img/avatar.png';
      icono.alt = '';
      fila.appendChild(icono);
    }
    const burbuja = document.createElement('div');
    burbuja.className = 'burbuja';
    fila.appendChild(burbuja);
    el.mensajes.appendChild(fila);
    return { fila, burbuja, icono };
  }

  function mostrarUsuario(texto) {
    const { burbuja } = crearFila('usuario');
    burbuja.textContent = texto;
    bajar();
  }

  function mostrarBot(texto, esError) {
    const { fila, burbuja, icono } = crearFila('bot');
    if (esError) fila.classList.add('error');
    burbuja.innerHTML = formatear(texto);
    bajar();
    if (esPrimerBot) {
      esPrimerBot = false;
      document.dispatchEvent(new CustomEvent('chat:primer-bot', { detail: { fila, icono } }));
    }
    return fila;
  }

  function mostrarEspera() {
    const { fila, burbuja } = crearFila('bot');
    burbuja.innerHTML = '<div class="puntos" aria-label="Escribiendo"><i></i><i></i><i></i></div>';
    bajar();
    return fila;
  }

  function actualizarUI() {
    el.enviar.disabled = ocupado;
  }

  // ---------- Envío ----------
  async function enviar(texto) {
    texto = String(texto || '').trim();
    if (!texto || ocupado) return;
    ocupado = true;
    actualizarUI();
    el.hero.classList.add('oculto');
    mostrarUsuario(texto);
    const espera = mostrarEspera();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: texto, history: historial.slice(-MAX_HISTORIAL) }),
        signal: ctrl.signal
      });
      const data = await r.json().catch(() => ({}));
      espera.remove();
      if (!r.ok) {
        mostrarBot(data.error || 'Algo salió mal. Intenta de nuevo.', true);
      } else {
        // Si respondió el modo sin IA, no se guarda en el historial para no contaminar el contexto.
        if (data.modelo !== 'sin-ia') {
          historial.push({ role: 'user', content: texto }, { role: 'assistant', content: data.respuesta });
        }
        mostrarBot(data.respuesta);
      }
    } catch (e) {
      espera.remove();
      mostrarBot(
        e.name === 'AbortError'
          ? 'Estoy tardando más de lo normal. Intenta de nuevo en un momento.'
          : 'No pude conectarme. Revisa tu conexión e intenta de nuevo.',
        true
      );
    } finally {
      clearTimeout(timer);
      ocupado = false;
      actualizarUI();
      el.entrada.focus();
    }
  }

  // ---------- Eventos ----------
  function autoajustar() {
    el.entrada.style.height = 'auto';
    el.entrada.style.height = Math.min(el.entrada.scrollHeight, 140) + 'px';
  }

  el.entrada.addEventListener('input', autoajustar);
  el.entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el.form.requestSubmit();
    }
  });
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = el.entrada.value;
    el.entrada.value = '';
    autoajustar();
    enviar(t);
  });
  el.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (b) enviar(b.dataset.q);
  });
  el.nuevo.addEventListener('click', () => {
    if (ocupado) return;
    historial = [];
    esPrimerBot = true;
    el.mensajes.innerHTML = '';
    el.hero.classList.remove('oculto');
    el.chat.scrollTo({ top: 0 });
  });

  // Despierta el servidor (útil en hosting gratuito que se duerme).
  fetch('/health').catch(() => {});

  // API para voice.js y avatar.js
  window.Chat = {
    enviar,
    ponerTexto(t) { el.entrada.value = t; autoajustar(); el.entrada.focus(); },
    estaOcupado: () => ocupado
  };
})();
