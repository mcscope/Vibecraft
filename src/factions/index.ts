// Factions you can bring to a game from this client. Add your own here: in an
// online game it's baked on your machine and sent to the other players as data.
import type { FactionSpec } from './types';
import { meadowfolk } from './meadowfolk';
import { fenfolk } from './fenfolk';
import { newFaction } from './newfaction';

export const PLAYABLE: FactionSpec[] = [meadowfolk, fenfolk, newFaction];
