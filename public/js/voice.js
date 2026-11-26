(() => {
  'use strict';

  const btnMic = document.getElementById('btn-mic');
  const btnLive = document.getElementById('btn-live');
  const form = document.getElementById('form');
  const entrada = document.getElementById('entrada');
  const waveform = document.getElementById('waveform');

  const liveOverlay = document.getElementById('live-overlay');
  const liveContainer = document.getElementById('live-container');
  const btnCloseLive = document.getElementById('btn-close-live');
  const transcription = document.getElementById('live-transcription');
  const statusText = document.getElementById('status-text');

  // Baja solo con cada texto nuevo, salvo que la persona haya subido a leer.
  let seguirAbajo = true;
  transcription.addEventListener('scroll', () => {
    seguirAbajo = transcription.scrollHeight - transcription.scrollTop - transcription.clientHeight < 40;
  });
  new MutationObserver(() => {
    if (seguirAbajo) transcription.scrollTop = transcription.scrollHeight;
  }).observe(transcription, { childList: true, subtree: true });

  const TIPOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  const MIC = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

  function avisar(texto) {
    if (window.Chat && window.Chat.avisar) window.Chat.avisar(texto);
    else alert(texto);
  }

  function elegirTipo() {
    if (!window.MediaRecorder) return '';
    return TIPOS.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function hayMicrofono() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  // ===================== 1. DICTADO (micrófono -> Whisper -> caja de texto) =====================
  const MAX_MS = 60000;
  const MIN_MS = 700;

  let isRecording = false;
  let transcribiendo = false;
  let recorder = null;
  let stream = null;
  let trozos = [];
  let inicio = 0;
  let timerMax = null;
  let enviarAlTerminar = false;

  function mostrarGrabando(on) {
    btnMic.classList.toggle('active', on);
    waveform.hidden = !on;
    entrada.hidden = on;
  }

  async function iniciar() {
    if (isRecording || transcribiendo || live.activo) return;
    if (!hayMicrofono()) {
      avisar('Este navegador no permite grabar audio aquí. El micrófono solo funciona en páginas seguras (HTTPS) y en navegadores recientes.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia(MIC);
    } catch (e) {
      avisar(e.name === 'NotAllowedError'
        ? 'Necesito permiso para usar el micrófono. Actívalo desde el candado de la barra de direcciones y vuelve a intentarlo.'
        : 'No encontré un micrófono disponible.');
      return;
    }
    const tipo = elegirTipo();
    recorder = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
    trozos = [];
    enviarAlTerminar = false;
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };
    recorder.onstop = alTerminar;
    recorder.start();
    inicio = Date.now();
    isRecording = true;
    mostrarGrabando(true);
    timerMax = setTimeout(() => detener(false), MAX_MS);
  }

  function detener(enviar) {
    if (!isRecording) return;
    enviarAlTerminar = Boolean(enviar);
    isRecording = false;
    clearTimeout(timerMax);
    try { recorder.stop(); } catch (e) { /* ya estaba detenido */ }
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  async function alTerminar() {
    const duracion = Date.now() - inicio;
    const tipo = (recorder && recorder.mimeType) || 'audio/webm';
    const blob = new Blob(trozos, { type: tipo });
    mostrarGrabando(false);

    if (duracion < MIN_MS || blob.size < 1500) {
      avisar('No alcancé a escucharte. Deja el micrófono encendido un poco más mientras hablas.');
      entrada.focus();
      return;
    }

    transcribiendo = true;
    btnMic.disabled = true;
    const placeholder = entrada.placeholder;
    entrada.placeholder = 'Transcribiendo tu voz...';
    try {
      const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': tipo }, body: blob });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.texto) {
        avisar(data.error || 'No pude transcribir el audio. Intenta de nuevo o escribe tu pregunta.');
        return;
      }
      if (enviarAlTerminar) {
        window.Chat.enviar(data.texto);
      } else {
        window.Chat.ponerTexto((entrada.value ? entrada.value + ' ' : '') + data.texto);
      }
    } catch (e) {
      avisar('No pude conectarme para transcribir tu voz. Revisa tu conexión.');
    } finally {
      transcribiendo = false;
      btnMic.disabled = false;
      entrada.placeholder = placeholder;
    }
  }

  if (btnMic) {
    btnMic.addEventListener('click', () => (isRecording ? detener(false) : iniciar()));
  }

  // Si están grabando y pulsan Enviar: se detiene, se transcribe y se envía solo.
  if (form) {
    form.addEventListener('submit', (e) => {
      if (isRecording) {
        e.preventDefault();
        e.stopImmediatePropagation();
        detener(true);
      }
    }, true);
  }

  // ===================== 2. CHARLA EN VIVO =====================
  // Ajustes: si corta demasiado pronto o tarda en reaccionar, cambia estos valores.
  const SILENCIO_FIN_MS = 1100;   // silencio que marca el final de tu frase
  const MIN_HABLA_MS = 500;       // menos que esto se ignora (un golpe, un ruido)
  const MAX_TURNO_MS = 30000;     // tope por intervención
  const UMBRAL_MIN = 0.02;        // volumen mínimo para considerar que hablas

  const live = {
    sesion: 0, activo: false, estado: '',
    stream: null, ctx: null, analyser: null, datos: null, timerVAD: null,
    rec: null, trozos: [], habloDesde: 0, ultimoVoz: 0,
    ruido: 0.01, muestras: 0, cuenta: 0,
    ctrl: null, historial: [], audio: null
  };
  let vozDisponible = null; // null = aún no se sabe; false = el servidor no tiene /api/speak

  function setEstado(estado, texto) {
    live.estado = estado;
    if (statusText) statusText.textContent = texto;
    if (liveContainer) liveContainer.dataset.estado = estado;
  }

  function quitarPlaceholder() {
    const ph = transcription.querySelector('.placeholder-text');
    if (ph) ph.remove();
  }

  function agregarLinea(rol, texto) {
    quitarPlaceholder();
    transcription.querySelectorAll('.live-nota').forEach((n) => n.remove());
    const p = document.createElement('p');
    p.className = 'live-line ' + (rol === 'user' ? 'live-user' : 'live-bot');
    p.textContent = texto;
    transcription.appendChild(p);
    const lineas = transcription.querySelectorAll('.live-line');
    if (lineas.length > 40) lineas[0].remove();
    return p;
  }

  function mensajeLive(texto) {
    quitarPlaceholder();
    transcription.querySelectorAll('.live-nota').forEach((n) => n.remove());
    const p = document.createElement('p');
    p.className = 'live-nota';
    p.textContent = texto;
    transcription.appendChild(p);
  }

  function nivelRMS() {
    live.analyser.getFloatTimeDomainData(live.datos);
    let suma = 0;
    for (let i = 0; i < live.datos.length; i++) suma += live.datos[i] * live.datos[i];
    return Math.sqrt(suma / live.datos.length);
  }

  async function iniciarLive() {
    if (live.activo) return;
    if (isRecording) detener(false);
    const sesion = ++live.sesion;
    live.historial = [];
    transcription.innerHTML = '<span class="placeholder-text">Habla cuando quieras, te estoy escuchando.</span>';

    if (!hayMicrofono()) {
      setEstado('error', 'Sin micrófono');
      mensajeLive('Este navegador no permite grabar audio aquí. Usa una página segura (HTTPS) y un navegador reciente.');
      return;
    }
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia(MIC);
    } catch (e) {
      setEstado('error', 'Sin micrófono');
      mensajeLive(e.name === 'NotAllowedError'
        ? 'Necesito permiso para usar el micrófono. Actívalo desde el candado de la barra de direcciones.'
        : 'No encontré un micrófono disponible.');
      return;
    }
    if (sesion !== live.sesion) { s.getTracks().forEach((t) => t.stop()); return; } // cerraron mientras pedía permiso

    const AC = window.AudioContext || window.webkitAudioContext;
    live.ctx = new AC();
    try { await live.ctx.resume(); } catch (e) { /* algunos navegadores ya lo inician activo */ }
    live.stream = s;
    const fuente = live.ctx.createMediaStreamSource(s);
    live.analyser = live.ctx.createAnalyser();
    live.analyser.fftSize = 1024;
    fuente.connect(live.analyser);
    live.datos = new Float32Array(live.analyser.fftSize);

    live.activo = true;
    live.ruido = 0.01;
    live.muestras = 0;
    live.cuenta = 0;
    live.rec = null;
    setEstado('escuchando', 'Escuchando...');
    live.timerVAD = setInterval(vigilar, 50);
  }

  // Detecta cuándo empiezas y cuándo terminas de hablar.
  function vigilar() {
    if (!live.activo || live.estado !== 'escuchando') return;
    const nivel = nivelRMS();
    const ahora = Date.now();

    // Primeros ~0.5 s: mide el ruido de fondo para ajustar el umbral.
    if (live.muestras < 10) {
      live.ruido = Math.min(0.05, (live.ruido * live.muestras + nivel) / (live.muestras + 1));
      live.muestras++;
      return;
    }
    const umbral = Math.max(UMBRAL_MIN, live.ruido * 3);

    if (!live.rec) {
      if (nivel > umbral) {
        live.cuenta++;
        if (live.cuenta >= 2) empezarGrabacion(ahora);
      } else {
        live.cuenta = 0;
      }
      return;
    }

    if (nivel > umbral * 0.7) live.ultimoVoz = ahora;
    if (ahora - live.ultimoVoz > SILENCIO_FIN_MS || ahora - live.habloDesde > MAX_TURNO_MS) {
      terminarGrabacion();
    }
  }

  function empezarGrabacion(ahora) {
    const tipo = elegirTipo();
    live.rec = tipo ? new MediaRecorder(live.stream, { mimeType: tipo }) : new MediaRecorder(live.stream);
    live.trozos = [];
    live.rec.ondataavailable = (e) => { if (e.data && e.data.size) live.trozos.push(e.data); };
    live.rec.start();
    live.habloDesde = ahora;
    live.ultimoVoz = ahora;
    quitarPlaceholder();
    setEstado('escuchando', 'Te escucho...');
  }

  function terminarGrabacion() {
    const rec = live.rec;
    if (!rec) return;
    const duracionHabla = Date.now() - live.habloDesde - SILENCIO_FIN_MS;
    const sesion = live.sesion;
    setEstado('pensando', 'Transcribiendo...');
    rec.onstop = () => {
      const blob = new Blob(live.trozos, { type: rec.mimeType || 'audio/webm' });
      live.rec = null;
      procesarTurno(blob, duracionHabla, sesion);
    };
    try { rec.stop(); } catch (e) { live.rec = null; volverAEscuchar(); }
  }

  function volverAEscuchar() {
    if (!live.activo) return;
    live.rec = null;
    live.cuenta = 0;
    setTimeout(() => {
      if (live.activo && live.rec === null) setEstado('escuchando', 'Escuchando...');
    }, 300);
  }

  async function procesarTurno(blob, duracionHabla, sesion) {
    if (duracionHabla < MIN_HABLA_MS || blob.size < 1500) { volverAEscuchar(); return; }

    live.ctrl = new AbortController();
    const senal = live.ctrl.signal;
    try {
      const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: senal });
      const d = await r.json().catch(() => ({}));
      if (sesion !== live.sesion) return;
      if (!r.ok || !d.texto) {
        mensajeLive(r.status === 422 ? 'No te escuché bien. ¿Puedes repetirlo?' : (d.error || 'No pude transcribir tu voz.'));
        return;
      }
      const pregunta = d.texto.slice(0, 600);
      agregarLinea('user', pregunta);
      setEstado('pensando', 'Pensando...');

      const rc = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pregunta, history: live.historial.slice(-6), modo: 'voz' }),
        signal: senal
      });
      const dc = await rc.json().catch(() => ({}));
      if (sesion !== live.sesion) return;
      if (!rc.ok || !dc.respuesta) {
        mensajeLive(dc.error || 'Algo salió mal. Intenta de nuevo.');
        return;
      }
      if (dc.modelo !== 'sin-ia') {
        live.historial.push({ role: 'user', content: pregunta }, { role: 'assistant', content: dc.respuesta });
      }
      const lineaBot = agregarLinea('bot', '');
      await Promise.all([escribir(lineaBot, dc.respuesta, sesion), hablar(dc.respuesta, sesion, senal)]);
    } catch (e) {
      if (e.name !== 'AbortError' && sesion === live.sesion) mensajeLive('Se cortó la conexión. Intenta de nuevo.');
    } finally {
      if (sesion === live.sesion) volverAEscuchar();
    }
  }

  // Muestra la respuesta de a poco, como si Lexio la fuera diciendo.
  function escribir(elemento, texto, sesion) {
    return new Promise((resolve) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        elemento.textContent = texto;
        resolve();
        return;
      }
      let i = 0;
      const t = setInterval(() => {
        i += 1;
        elemento.textContent = texto.slice(0, i);
        if (i >= texto.length || sesion !== live.sesion) {
          clearInterval(t);
          if (sesion === live.sesion) elemento.textContent = texto;
          resolve();
        }
      }, 16);
    });
  }

  // Voz de Lexio: usa /api/speak cuando el servidor la tenga. Mientras no exista, no hace nada.
  async function hablar(texto, sesion, senal) {
    if (vozDisponible === false) return;
    try {
      const r = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
        signal: senal
      });
      if (r.status === 404 || r.status === 501 || r.status === 503) { vozDisponible = false; return; }
      if (!r.ok || sesion !== live.sesion) return;
      vozDisponible = true;
      const blob = await r.blob();
      if (sesion !== live.sesion) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      live.audio = audio;
      setEstado('hablando', 'Hablando...');
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });
      URL.revokeObjectURL(url);
      live.audio = null;
    } catch (e) { /* sin voz: la respuesta igual se ve en pantalla */ }
  }

  function detenerLive() {
    live.sesion++;
    live.activo = false;
    clearInterval(live.timerVAD);
    if (live.ctrl) { try { live.ctrl.abort(); } catch (e) { /* nada */ } }
    if (live.rec) {
      try { live.rec.onstop = null; live.rec.stop(); } catch (e) { /* nada */ }
      live.rec = null;
    }
    if (live.audio) { live.audio.pause(); live.audio = null; }
    if (live.stream) { live.stream.getTracks().forEach((t) => t.stop()); live.stream = null; }
    if (live.ctx) { live.ctx.close().catch(() => {}); live.ctx = null; }
    setEstado('', 'Escuchando...');
  }

  if (btnLive && liveOverlay) {
    btnLive.addEventListener('click', () => {
      btnLive.classList.add('active');
      liveOverlay.hidden = false;

      liveContainer.classList.remove('active-session');
      setTimeout(() => liveOverlay.style.opacity = '1', 10);
      setTimeout(() => {
        liveContainer.classList.add('active-session');
      }, 1000);

      iniciarLive();
    });

    if (btnCloseLive) {
      btnCloseLive.addEventListener('click', () => {
        detenerLive();
        btnLive.classList.remove('active');
        liveOverlay.style.opacity = '0';
        setTimeout(() => {
          liveOverlay.hidden = true;
        }, 400);
      });
    }
  }
})();
