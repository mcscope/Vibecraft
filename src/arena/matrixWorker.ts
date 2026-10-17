// Fills in the arena matrix in the background: every pair of the roster, one fight each.
import { PLAYABLE } from '../factions';
import { arenaRoster, runFight } from '../sim/arena';

self.onmessage = (e: MessageEvent<{ budget: number }>) => {
  const roster = arenaRoster(PLAYABLE);
  for (let i = 0; i < roster.length; i++) for (let j = 0; j < roster.length; j++) {
    if (i === j) continue;
    (self as unknown as Worker).postMessage({ budget: e.data.budget, i, j, score: runFight(roster[i], roster[j], e.data.budget) });
  }
};
