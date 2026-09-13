import assert from 'node:assert/strict';
import { levelFromElo } from './levels';

const boundaries: Array<[number, number]> = [
  [800, 1],
  [801, 2],
  [950, 2],
  [951, 3],
  [1100, 3],
  [1101, 4],
  [1250, 4],
  [1251, 5],
  [1400, 5],
  [1401, 6],
  [1550, 6],
  [1551, 7],
  [1700, 7],
  [1701, 8],
  [1850, 8],
  [1851, 9],
  [2000, 9],
  [2001, 10],
];

for (const [elo, expectedLevel] of boundaries) {
  assert.equal(levelFromElo(elo), expectedLevel, `${elo} ELO should be Level ${expectedLevel}`);
}
