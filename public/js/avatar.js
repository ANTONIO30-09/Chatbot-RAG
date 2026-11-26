(() => {
  'use strict';

  // Función mejorada para sincronizar tiempos
  function prepararYAnimarSVG(svgSelector, duracionTotalSeg = 3.5, duracionTrazoSeg = 1.2) {
    const svg = document.querySelector(svgSelector);
    if (!svg) return;

    const formas = svg.querySelectorAll('path, rect, circle, line, polyline');
    const totalFormas = formas.length;
    
    if (totalFormas === 0) return;

    formas.forEach((forma, index) => {
      const longitud = forma.getTotalLength();
      
      // Configurar el trazo oculto
      forma.style.strokeDasharray = longitud;
      forma.style.strokeDashoffset = longitud;
      
      // Matemática para sincronizar:
      // El último elemento (index = totalFormas - 1) debe empezar su trazo
      // en el tiempo (duracionTotal - duracionTrazo) para terminar justo al final.
      const tiempoDisponibleParaDelay = duracionTotalSeg - duracionTrazoSeg;
      // Calculamos el delay proporcional al índice
      const retraso = (tiempoDisponibleParaDelay * (index / (totalFormas - 1 || 1))).toFixed(2);
      
      forma.style.animationDuration = `${duracionTrazoSeg}s`;
      forma.style.animationDelay = `${retraso}s`;
    });

    // Forzar un reflujo y lanzar la animación
    svg.getBoundingClientRect();
    svg.classList.add('dibujar');
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      // Ambos empezarán y terminarán exactamente al mismo tiempo (3.5 segundos)
      prepararYAnimarSVG('#svg-chip', 3.5, 1.2);
      prepararYAnimarSVG('#svg-balanza', 3.5, 1.2);
    }, 500);
  });

  document.addEventListener('chat:reiniciar', () => {
    // Lógica para reiniciar si es necesario
  });
})();
