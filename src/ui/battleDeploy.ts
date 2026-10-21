// Pitched Battle, step 2: deployment. Each unit type you drafted is a block in your zone (tinted on the ground).
// Pick a block (its button, or left-click one of its units), right-click where it should stand, repeat; then Ready starts the
// battle. Until then the world doesn't step (main.ts asks `deploying`).
import { BATTLE_SIZE, inZone, intoZone, zoneCenter } from '../sim/battleMaps';
import { placeBlock } from '../sim/battle';
import type { World } from '../sim/world';
import type { Renderer, RenderState } from '../render/renderer';
import { esc } from './format';

export class BattleDeploy {
  deploying = true;
  private chosen: string | null;

  constructor(private world: World, private renderer: Renderer, canvas: HTMLCanvasElement, private rs: RenderState, private select: (ids: number[]) => void, private onReady: () => void) {
    const [cx, cy] = zoneCenter(0);
    renderer.cam.zoom = 0.85; // your whole zone, and on toward the middle of the field
    renderer.cam.centerOn(cx + 6, cy);
    rs.zone = [];
    for (let y = 0; y < BATTLE_SIZE; y++) for (let x = 0; x < BATTLE_SIZE; x++) if (inZone(0, x, y)) rs.zone.push([x, y]);
    this.chosen = this.types()[0] ?? null;
    if (this.chosen) this.select(this.ids(this.chosen));
    // as everywhere: left-click selects (on one of your units it picks that block), right-click does (moves the chosen
    // block there)
    canvas.addEventListener('mousedown', (e) => {
      if (!this.deploying) return;
      if (e.button === 0) {
        const hit = this.renderer.pick(e.clientX, e.clientY, 1);
        const mine = this.world.units.get(hit) ?? this.world.buildings.get(hit);
        if (mine && mine.owner === 0) { e.stopImmediatePropagation(); e.preventDefault(); this.choose(mine.specId); }
        return;
      }
      if (e.button !== 2) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (!this.chosen) return;
      const [x, y] = intoZone(0, ...this.renderer.cam.toWorld(e.clientX, e.clientY)); // (a click past the zone lands at its edge)
      const ids = this.ids(this.chosen);
      this.select(placeBlock(this.world, 0, { specId: this.chosen, n: ids.length, x, y }, ids));
      this.world.updateVision(); // (what you can see from the new spot)
    }, true);
    this.draw();
  }

  private types(): string[] {
    return [...new Set([...this.world.unitsOf(0), ...this.world.buildingsOf(0)].map((u) => u.specId))];
  }

  /** The units (or supply camps) in a block. */
  private ids(specId: string): number[] {
    return [...this.world.unitsOf(0), ...this.world.buildingsOf(0)].filter((u) => u.specId === specId).map((u) => u.id);
  }

  private choose(specId: string): void {
    this.chosen = specId;
    this.select(this.ids(specId));
    this.draw();
  }

  private draw(): void {
    const help = document.getElementById('help')!;
    help.classList.add('lesson');
    help.style.display = 'block';
    help.innerHTML = `<b>Deploy your army</b>
      <p>Your zone is tinted blue. Pick a block (below, or left-click one of its units), then right-click where it should stand. Repeat for each block; the enemy is somewhere at the far end, out of sight.</p>
      <div class="deploy-blocks">${this.types().map((id) => `<button data-block="${id}" class="${this.chosen === id ? 'on' : ''}">${esc((this.world.specOf(0, id)?.spec ?? this.world.buildingSpecOf(0, id))?.name ?? id)} ×${this.ids(id).length}</button>`).join('')}</div>
      <div class="lesson-nav"><span></span><a href="#" data-ready>Ready: to battle! ▶</a></div>`;
    help.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.dataset.block) this.choose(t.dataset.block);
      if (t.dataset.ready !== undefined) {
        e.preventDefault();
        this.deploying = false;
        this.chosen = null;
        this.rs.zone = null;
        help.innerHTML = '<b>Battle!</b><p>Command your army as usual. The battle ends when one army is gone.</p>';
        setTimeout(() => (help.style.display = 'none'), 6000);
        this.onReady();
      }
    };
  }
}
