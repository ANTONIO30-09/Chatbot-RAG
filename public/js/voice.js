(() => {
  'use strict';

  const btnMic = document.getElementById('btn-mic');
  const btnLive = document.getElementById('btn-live');
  const entrada = document.getElementById('entrada');
  const waveform = document.getElementById('waveform');
  
  const liveOverlay = document.getElementById('live-overlay');
  const liveContainer = document.getElementById('live-container');
  const btnCloseLive = document.getElementById('btn-close-live');
  const transcription = document.getElementById('live-transcription');

  let isRecording = false;

  // 1. Lógica visual del Micrófono (Dictado normal)
  if (btnMic) {
    btnMic.addEventListener('click', () => {
      isRecording = !isRecording;
      if (isRecording) {
        btnMic.classList.add('active');
        entrada.hidden = true;
        waveform.hidden = false;
      } else {
        btnMic.classList.remove('active');
        waveform.hidden = true;
        entrada.hidden = false;
        entrada.focus();
      }
    });
  }

  // 2. Lógica del Modo "Charla en vivo"
  if (btnLive && liveOverlay) {
    btnLive.addEventListener('click', () => {
      btnLive.classList.add('active');
      liveOverlay.hidden = false;
      
      // Resetear estado de la UI
      liveContainer.classList.remove('active-session');
      transcription.innerHTML = '<span class="placeholder-text">Habla ahora, estoy procesando tu voz...</span>';

      // Mostrar overlay
      setTimeout(() => liveOverlay.style.opacity = '1', 10);

      // Mover a la izquierda después de 1 segundo (sin simulación de texto)
      setTimeout(() => {
        liveContainer.classList.add('active-session');
      }, 1000);
    });

    // Cerrar el modo Live
    if (btnCloseLive) {
      btnCloseLive.addEventListener('click', () => {
        btnLive.classList.remove('active');
        liveOverlay.style.opacity = '0';
        setTimeout(() => {
          liveOverlay.hidden = true;
        }, 400); 
      });
    }
  }
})();
