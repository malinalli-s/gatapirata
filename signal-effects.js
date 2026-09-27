'use strict';
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const original = 'gatapirata.png',
    altered = 'gatapirata-interference.png';
  const preload = new Image();
  preload.src = altered;
  const logos = [...document.querySelectorAll('.brand-logo,.vinyl-logo')];
  // Cada sección tiene su propia amplitud, frecuencia y velocidad de turbulencia.
  const settings = [
    ['header', 'header', 10, 0.004, 0.04, 0.7],
    ['player', '.player', 4, 0.003, 0.024, 0.53],
    ['motion', '.motion', 5, 0.005, 0.03, 0.61],
    ['history', '.history-panel', 3, 0.004, 0.019, 0.43],
    ['footer', 'footer', 3, 0.006, 0.022, 0.4],
    ['dialog', 'dialog[open]', 2, 0.004, 0.018, 0.37],
  ];
  const effects = settings.map(
    ([id, selector, amplitude, fx, fy, speed], index) => {
      const filter = document.getElementById('melt-' + id);
      return {
        selector,
        amplitude,
        fx,
        fy,
        speed,
        index,
        noise: filter.querySelector('feTurbulence'),
        displace: filter.querySelector('feDisplacementMap'),
        offsets: [...filter.querySelectorAll('feOffset')],
      };
    },
  );
  let last = 0,
    current = '';
  const start = performance.now();
  function draw(now) {
    requestAnimationFrame(draw);
    if (document.hidden) return;
    const t = (now - start) / 1000;
    // Original durante 0.3 s; señal intervenida durante 9 s. No cambia el tamaño.
    const desired = reduced.matches
      ? original
      : t % 9.3 < 0.3
        ? original
        : altered;
    if (
      current !== desired &&
      (desired === original || (preload.complete && preload.naturalWidth))
    ) {
      logos.forEach((img) => (img.src = desired));
      current = desired;
    }
    if (reduced.matches || now - last < 125) return;
    last = now;
    for (const e of effects) {
      const element = document.querySelector(e.selector);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) continue;
      const pulse = (Math.sin(t * e.speed + e.index * 1.7) + 1) / 2;
      e.displace.setAttribute(
        'scale',
        (e.amplitude * (0.2 + 0.8 * pulse)).toFixed(2),
      );
      e.noise.setAttribute(
        'baseFrequency',
        (e.fx * (0.8 + 0.25 * Math.sin(t * 0.3 + e.index))).toFixed(4) +
          ' ' +
          (e.fy * (0.8 + 0.3 * Math.sin(t * 0.41 + e.index))).toFixed(4),
      );
      const shift = 0.35 + 1.1 * pulse;
      e.offsets[0].setAttribute('dx', shift.toFixed(2));
      e.offsets[1].setAttribute('dx', (-shift).toFixed(2));
    }
  }
  requestAnimationFrame(draw);
})();
