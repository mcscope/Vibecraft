// Garrison: units can shelter inside one of their side's buildings. Inside, they
// are off the map (nothing can reach them) and the building feeds them and
// restocks their crystal. Throwers inside keep throwing, from the building's
// height and under cover. If the building falls, or on Ungarrison, they come out.
// A building holds two units per tile of footprint, of a body that fits through its door.
import { K } from './physics';
import { DT, type Building, type Unit, type World } from './world';

/** The heaviest body that fits through a door (kg): about a big man in armour. Mounts, beasts and great birds stay out. */
export const DOOR_KG = 150;
export const fitsInside = (u: Unit): boolean => u.stats.mass <= DOOR_KG;

/** Units a building can hold. */
export const capacity = (b: Building): number => (b.complete ? b.size * b.size * 2 : 0);

/** Height (m) garrisoned throwers throw from: about a storey per tile of footprint. */
export const garrisonHeight = (b: Building): number => 1.5 + b.size;

/** Order kind 'garrison': walk up to the building and go in (if there's room). Returns whether it moved. */
export function runGarrison(w: World, u: Unit, buildingId: number): boolean {
  const b = w.buildings.get(buildingId);
  if (!b || b.owner !== u.owner || b.garrison.length >= capacity(b) || !fitsInside(u)) { w.finish(u); return false; }
  if (!w.moveToBuilding(u, b)) return u.x !== u.px || u.y !== u.py;
  u.order = { kind: 'idle' }; u.path = []; u.engage = 0; u.queue = []; u.resume = null;
  u.x = u.px = b.ox + b.size / 2; u.y = u.py = b.oy + b.size / 2;
  w.units.delete(u.id);
  b.garrison.push(u);
  return false;
}

/** Everyone out, onto open ground around the building. */
export function eject(w: World, b: Building): void {
  for (const u of b.garrison) {
    const spot = w.grid.nearestOpen(b.ox + b.size + 0.5, b.oy + b.size / 2, b.size + 4) ?? [b.ox - 0.5, b.oy - 0.5];
    u.x = u.px = spot[0]; u.y = u.py = spot[1];
    u.order = { kind: 'idle' }; u.path = [];
    w.units.set(u.id, u);
  }
  b.garrison = [];
}

/** Each tick: the garrison eats and restocks from the building, and its throwers throw from cover. */
export function tickGarrison(w: World, b: Building): void {
  if (!b.garrison.length) return;
  const cx = b.ox + b.size / 2, cy = b.oy + b.size / 2, h = garrisonHeight(b);
  for (const u of b.garrison) {
    if (u.cooldown > 0) u.cooldown -= DT;
    // restock and rest
    const need = Math.min(Math.max(0, u.stats.loadoutCrystal - u.ammo), b.stock.crystal);
    if (need > 0) { u.ammo += need; b.stock.crystal -= need; }
    const room = u.stats.maxCalories - u.cal;
    if (room > 1 && b.stock.food > 0) { const kg = Math.min(b.stock.food, (u.stats.eatRate * DT) / K.calPerFood, room / K.calPerFood); b.stock.food -= kg; u.cal += kg * K.calPerFood; }
    if (!u.throws || u.cooldown > 0 || u.ammo < u.crystalMass - 1e-6) continue;
    // throw at the nearest enemy in reach (from height: the crystal carries further and hits harder)
    const reach = u.stats.range + h * 0.5 + b.size / 2;
    let target: Unit | null = null, best = reach * reach;
    for (const e of w.units.values()) {
      if (e.owner === b.owner || w.players[e.owner]?.neutral || e.dummy) continue;
      const d = (e.x - cx) ** 2 + (e.y - cy) ** 2;
      if (d < best) { best = d; target = e; }
    }
    if (!target) continue;
    u.cooldown = u.stats.cooldown;
    u.ammo -= u.crystalMass;
    const damage = u.stats.damage + u.crystalMass * K.gravity * h * K.damageScale;
    w.launch(b.owner, cx, cy, h, target.x, target.y, damage, u.crystalMass, target.id);
  }
}
