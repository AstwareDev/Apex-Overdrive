/**
 * Screen-space FX overlay — a cheap DOM layer that amplifies the sense of speed
 * and flags an active boost. Pure consumer of the game's 'tick' event; it never
 * touches the WebGL render path, so it's effectively free.
 *
 *   • vignette  — darkens the edges, tightening with speed (tunnel-vision)
 *   • speedlines — radial streaks that pulse outward at high speed
 *   • boost tint — cyan edge flash while a boost is active
 *
 * Mount it alongside the HUD: mountFxOverlay(game).
 */
const STYLE = `
#fx-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
#fx-overlay > div { position: absolute; inset: -10%; }
#fx-vignette {
  opacity: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(0,0,0,0.6) 100%);
  transition: opacity 0.2s;
}
#fx-speedlines {
  opacity: 0;
  background: repeating-conic-gradient(from 0deg,
    rgba(255,255,255,0) 0deg, rgba(255,255,255,0) 5.4deg,
    rgba(255,255,255,0.07) 6deg, rgba(255,255,255,0) 6.6deg);
  -webkit-mask-image: radial-gradient(circle, transparent 38%, black 78%);
          mask-image: radial-gradient(circle, transparent 38%, black 78%);
  animation: fx-zoom 0.55s linear infinite;
  transition: opacity 0.2s;
}
#fx-boost {
  opacity: 0;
  background: radial-gradient(ellipse at center, rgba(0,229,255,0) 48%, rgba(0,229,255,0.28) 100%);
  transition: opacity 0.12s;
}
@keyframes fx-zoom { from { transform: scale(1); } to { transform: scale(1.18); } }
`;

export function mountFxOverlay(game, root = document.body) {
  if (!document.getElementById('fx-overlay-style')) {
    const s = document.createElement('style');
    s.id = 'fx-overlay-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  const el = document.createElement('div');
  el.id = 'fx-overlay';
  el.innerHTML = `<div id="fx-vignette"></div><div id="fx-speedlines"></div><div id="fx-boost"></div>`;
  root.appendChild(el);

  const vign  = el.querySelector('#fx-vignette');
  const lines = el.querySelector('#fx-speedlines');
  const boost = el.querySelector('#fx-boost');

  const off = game.on('tick', (s) => {
    const spd = s.speedRaw ?? s.speed ?? 0;
    const t = Math.min(1, spd / 200);
    vign.style.opacity  = (t * 0.5).toFixed(3);
    lines.style.opacity = (Math.max(0, t - 0.35) * 1.2).toFixed(3);
    boost.style.opacity = s.boosting ? '1' : '0';
  });

  return { destroy() { off(); el.remove(); } };
}
