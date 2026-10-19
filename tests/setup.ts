// Every test plays skirmish maps at 64 tiles, not the shipped 96: map size changes only generation, and the
// smaller maps make AI games (the slowest tests) much quicker.
import { setMapSize } from '../src/sim/map';

setMapSize(64);
