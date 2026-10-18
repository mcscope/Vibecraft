// ?sounddebug=1: a small panel listing the last recorded clips played (voices and combat sounds), newest first, each
// with a ✕ to strike it from the game (and from the Voice Lab, which shares the strike list in this browser).
import { played, strike } from '../audio/clips';

export function soundDebug(): void {
  if (new URLSearchParams(location.search).get('sounddebug') !== '1') return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:10px;bottom:170px;z-index:20;width:300px;padding:8px 10px;font:12px ui-monospace,Menlo,monospace;color:#e9dfc4;background:rgba(20,16,12,0.92);border:1px solid #8a6a34;border-radius:4px;pointer-events:auto';
  document.body.appendChild(box);
  let shown = '';
  const draw = () => {
    const rows = played.slice(-8).reverse();
    const key = rows.map((r) => r.t).join();
    if (key !== shown) {
      shown = key;
      box.innerHTML = '<b style="color:#d8b25a">Sounds (newest first)</b>' + rows.map((r) => `<div style="display:flex;justify-content:space-between;gap:6px;margin-top:3px"><span>${r.id}<br><span style="color:#a99f86">${r.what}</span></span><button data-strike="${r.id}" title="Never play this clip again" style="background:#5a1e18;color:#fbb;border:1px solid #c0503a;border-radius:3px;cursor:pointer">✕</button></div>`).join('');
    }
    requestAnimationFrame(draw);
  };
  box.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).dataset.strike;
    if (!id) return;
    strike(id);
    (e.target as HTMLElement).textContent = 'struck';
  });
  draw();
}
