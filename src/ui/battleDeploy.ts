// Pitched Battle, step 2: deployment. Each unit type you drafted is a block in your zone (the west end of the
// field). Pick a block, click where it should stand, repeat; then Ready starts the battle. Until then the world
// doesn't step (main.ts asks `deploying`).
import { inZone, zoneCenter } from '../sim/battleMaps';
import { placeBlock } from '../sim/battle';
import type { World } from '../sim/world';
import type { Renderer } from '../render/renderer';
import { esc } from './format';

export class BattleDeploy {
  deploying = true;
  private chosen: string | null = null;

  constructor(private world: World, private renderer: Renderer, canvas: HTMLCanvasElement, private select: (ids: number[]) => void, private onReady: () => void) {
    const [cx, cy] = zoneCenter(0);
    renderer.cam.zoom = 0.85; // your whole zone, and on toward the middle of the field
    renderer.cam.centerOn(cx + 12, cy);
    // a click on the field moves the chosen block there (and doesn't reach the usual selection)
    canvas.addEventListener('mousedown', (e) => {
      if (!this.deploying || !this.chosen || e.button !== 0) return;
      const [x, y] = this.renderer.cam.toWorld(e.clientX, e.clientY);
      e.stopImmediatePropagation(); e.preventDefault();
      if (!inZone(0, x, y)) { this.say('Place it in your zone: the west end of the field.'); return; }
      const ids = this.ids(this.chosen);
      this.select(placeBlock(this.world, 0, { specId: this.chosen, n: ids.length, x, y }, ids));
      this.world.updateVision(); // (what you can see from the new spot)
    }, true);
    this.draw();
  }

  /** The units (or supply camps) in a block. */
  private ids(specId: string): number[] {
    return [...this.world.unitsOf(0), ...this.world.buildingsOf(0)].filter((u) => u.specId === specId).map((u) => u.id);
  }

  private say(text: string): void {
    const el = document.querySelector<HTMLElement>('#help .deploy-note');
    if (el) el.textContent = text;
  }

  private draw(): void {
    const help = document.getElementById('help')!;
    const types = [...new Set([...this.world.unitsOf(0), ...this.world.buildingsOf(0)].map((u) => u.specId))];
    help.classList.add('lesson');
    help.style.display = 'block';
    help.innerHTML = `<b>Deploy your army</b>
      <p>Pick a block, then click in your zone (the west end of the field) to set it there. The enemy is deployed somewhere at the far end, out of sight.</p>
      <div class="deploy-blocks">${types.map((id) => `<button data-block="${id}" class="${this.chosen === id ? 'on' : ''}">${esc((this.world.specOf(0, id)?.spec ?? this.world.buildingSpecOf(0, id))?.name ?? id)} ×${this.ids(id).length}</button>`).join('')}</div>
      <p class="deploy-note"></p>
      <div class="lesson-nav"><span></span><a href="#" data-ready>Ready: to battle! ▶</a></div>`;
    help.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.block) { this.chosen = t.dataset.block; this.select(this.ids(this.chosen)); this.draw(); }
      if (t.dataset.ready !== undefined) {
        e.preventDefault();
        this.deploying = false;
        this.chosen = null;
        help.innerHTML = '<b>Battle!</b><p>Command your army as usual. The battle ends when one army is gone.</p>';
        setTimeout(() => (help.style.display = 'none'), 6000);
        this.onReady();
      }
    };
  }
}
