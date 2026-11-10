// The Wildwelds' standard set of 3D prints (scripts/stl.ts all): each unit standing, and in a pose or two that shows
// what it does. Poses are the art's own animations, at a moment through them (`phase`).
import type { UnitPrints } from '../../kits/print3d/print';

export const prints: UnitPrints[] = [
  // the mothers: standing, and laying (her abdomen swung down, an egg swelling from its tip); the T3 striking too
  ...[1, 2, 3].map((t): UnitPrints => ({ unit: `mother${t}`, poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'laying', anim: 'lay', phase: 0.62 },
    ...(t === 3 ? [{ name: 'striking', anim: 'attack', phase: 0.3 } as const] : []),
  ] })),
  // the eggs, and the biggest hatching (its top opened out, the larva's head rising)
  ...[1, 2, 3].map((t): UnitPrints => ({ unit: `egg${t}`, poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    ...(t === 3 ? [{ name: 'hatching', anim: 'hatch', phase: 0.92 } as const] : []),
  ] })),
  // the larvae: crawling, and reared up on the front segment to gather
  ...[1, 2, 3].map((t): UnitPrints => ({ unit: `larva${t}`, poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'rearing', anim: 'gather', phase: 0.3 },
  ] })),
  { unit: 'cocoon', poses: [{ name: 'standing', anim: 'idle', phase: 0 }] },
  // the Charger: squatting at rest, and ramming (its whole body slammed forward, spike first)
  { unit: 'charger', poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'ramming', anim: 'attack', phase: 0.48 },
  ] },
  // the Micropike: on its tripod, set against a charge (sunk low, the pike swung up), and stabbing
  { unit: 'micropike', poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'braced', anim: 'brace', phase: 0 },
    { name: 'stabbing', anim: 'attack', phase: 0.4 },
  ] },
  // the Vimmer: standing on its wings, and in flight (wings spread)
  { unit: 'flier', poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'flying', anim: 'fly', phase: 0.5, air: true },
  ] },
  // the Whipweld: up on its legs (at rest it squats, its whips trailing into the ground), and mid-lash (the near
  // whip unrolling out ahead)
  { unit: 'whipweld', poses: [
    { name: 'standing', anim: 'walk', phase: 0 },
    { name: 'lashing', anim: 'attack', phase: 0.33 },
  ] },
  // the Slinger: at rest, and mid-throw (head plunging, the arm whipping the sling over its back)
  { unit: 'slinger', poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'throwing', anim: 'attack', phase: 0.45 },
  ] },
  // the Dragon Fly: wings folded up on the ground, and in flight
  { unit: 'dragon-fly', poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'flying', anim: 'fly', phase: 0.25, air: true },
  ] },
  // the Goliath Charger: crouched, mid-bound (at the top of its arc), and striking
  { unit: 'ground-attacker3', poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'bounding', anim: 'walk', phase: 0.5, air: true },
    { name: 'striking', anim: 'attack', phase: 0.4 },
  ] },
];
