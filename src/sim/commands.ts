// Everything a player can do is a Command. Commands are the only input to the
// simulation, which makes it lockstep-ready: clients exchange commands, not state.

export type Command = CommandBody & {
  /** Shift-queued: unit orders go after what the units are doing instead of replacing it. */
  queue?: boolean;
};

export type CommandBody =
  | { type: 'move'; units: number[]; x: number; y: number }
  | { type: 'attackMove'; units: number[]; x: number; y: number }
  | { type: 'attack'; units: number[]; target: number }
  | { type: 'gather'; units: number[]; node: number }
  /**
   * Go to own town center: drop off cargo, restock crystal loadout, eat to full.
   * Afterwards units return to what they were doing (or where they stood),
   * unless `thenX/thenY` gives somewhere else to go.
   */
  | { type: 'resupply'; units: number[]; building: number; thenX?: number; thenY?: number }
  /** Walk to a friendly unit and hand over surplus food/crystal. */
  | { type: 'give'; units: number[]; to: number }
  | { type: 'stop'; units: number[] }
  | { type: 'train'; building: number; specId: string }
  | { type: 'research'; building: number; techId: string }
  /** Keep training this unit whenever the queue is empty and stock allows (null = off). */
  | { type: 'autoTrain'; building: number; specId: string | null }
  /** Which resources a sowing building plants. */
  | { type: 'setSowing'; building: number; resources: Array<'food' | 'wood'> }
  /** Cancel a queue item (default: the last one). */
  | { type: 'cancelTrain'; building: number; index?: number }
  /** Place a construction site; `units` start carrying wood to it. */
  | { type: 'build'; units: number[]; specId: string; ox: number; oy: number }
  /** Reassign carters to supply a different building. */
  | { type: 'assignCart'; units: number[]; building: number }
  /** Workers carry what a building is missing from the base, trip after trip, until it's stocked. */
  | { type: 'haul'; units: number[]; building: number }
  /** Throwers restock from a friendly ammo bearer. */
  | { type: 'rearm'; units: number[]; bearer: number }
  /** Tamers feed a wild animal until it joins you. */
  | { type: 'tame'; units: number[]; target: number }
  /** Workers walk up to a passive animal, bring it down, and gather the carcass. */
  | { type: 'hunt'; units: number[]; target: number }
  /** Send units to help an existing construction site. */
  | { type: 'construct'; units: number[]; site: number }
  /** `node`: rallied onto a resource, so new workers gather it. */
  | { type: 'rally'; building: number; x: number; y: number; node?: number }
  /** Give up: you lose, the others play on (or win). */
  | { type: 'resign' }
  /** Kill your own units and/or knock down your own buildings (Backspace / Delete). */
  | { type: 'destroy'; ids: number[] };

export interface PlayerCommand {
  player: number;
  cmd: Command;
}
