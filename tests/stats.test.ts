// `npm run stats` prints the derived stat sheet for every unit — the balancing view.
import { test } from 'vitest';
import { meadowfolk } from '../src/factions/meadowfolk';
import { derive } from '../src/sim/physics';

test('stat sheet', () => {
  const rows = meadowfolk.units.map((s) => {
    const d = derive(s);
    return {
      unit: s.name,
      kg: d.mass,
      hp: Math.round(d.maxHp),
      cal: Math.round(d.maxCalories),
      speed: +d.speed.toFixed(2),
      carry: +d.carryCapacity.toFixed(1),
      'v m/s': +d.crystalVelocity.toFixed(1),
      dmg: Math.round(d.damage),
      'cd s': +d.cooldown.toFixed(2),
      dps: +d.dps.toFixed(1),
      range: +d.range.toFixed(1),
      'cal/hit': Math.round(d.attackCalories),
      hits: Math.floor(d.maxCalories / d.attackCalories),
      food: d.foodCost,
      crys: d.crystalCost,
      'train s': +d.trainTime.toFixed(0),
      'dps/100f': +((d.dps / d.foodCost) * 100).toFixed(1),
      'hp/100f': +((d.maxHp / d.foodCost) * 100).toFixed(0),
    };
  });
  console.table(rows);
});
