// The Wildwelds' standard set of 3D prints (scripts/stl.ts all): each unit standing, and in a pose or two that shows
// what it does. Poses are the art's own animations, at a moment through them (`phase`).
import type { ArtJoint } from '../../kits/print3d/articulate';
import type { UnitPrints } from '../../kits/print3d/print';

export const prints: UnitPrints[] = [
  // the mothers: standing, and laying (her abdomen swung down, an egg swelling from its tip); the T3 striking too
  ...[1, 2, 3].map((t): UnitPrints => ({ unit: `mother${t}`, poses: [
    { name: 'standing', anim: 'idle', phase: 0 },
    { name: 'laying', anim: 'lay', phase: 0.62 },
    ...(t === 3 ? [{ name: 'striking', anim: 'attack', phase: 0.3 } as const] : []),
  ], ...(t === 3 ? { articulated: {
    // poseable: her four legs at hip and knee, her brood abdomen, her neck and head (eleven parts)
    pose: { name: 'standing', anim: 'idle', phase: 0 }, mmPerUnit: 50, body: ['thoraxBack', 'thoraxFront'],
    joints: [
      ...(['L', 'R'] as const).flatMap((s): ArtJoint[] => [
        { part: `thigh${s}`, parent: 'body', at: `hip${s}`, bones: [`knee${s}`], reach: 0.3 },
        { part: `shin${s}`, parent: `thigh${s}`, at: `knee${s}`, bones: [`ankle${s}`, `foot${s}`], reach: 0.22 },
        { part: `forethigh${s}`, parent: 'body', at: `fhip${s}`, bones: [`fknee${s}`], reach: 0.2 },
        { part: `foreshin${s}`, parent: `forethigh${s}`, at: `fknee${s}`, bones: [`ffoot${s}`], reach: 0.17 },
      ]),
      { part: 'abdomen', parent: 'body', at: 'abdomen', bones: ['abdomenMid', 'abdomenTip'], reach: 0.85 },
      { part: 'head', parent: 'body', at: 'neck', bones: ['neckMid', 'head', 'snout'], more: [['head', 'crest']], reach: 0.26 },
    ],
  } } : {}) })),
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
  ], articulated: {
    // poseable: its one great leg at hip, knee and ankle, the foot on a base (four parts)
    pose: { name: 'standing', anim: 'idle', phase: 0 }, mmPerUnit: 36, baseOn: 'foot', body: ['tail', 'nose'],
    joints: [
      { part: 'thigh', parent: 'body', at: 'hip', bones: ['knee'], reach: 0.32 },
      { part: 'shin', parent: 'thigh', at: 'knee', bones: ['ankle'], reach: 0.18 },
      { part: 'foot', parent: 'shin', at: 'ankle', bones: ['foot', 'toe'], more: [['foot', 'toeL'], ['foot', 'toeR'], ['foot', 'heel']], reach: 0.2 },
    ],
  } },
];
