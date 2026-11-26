import assert from 'node:assert/strict';
import { sampleMapScoreline } from './simulator';

const SAMPLE_SIZE = 200_000;

function sampleDistribution(homeWinProbability: number, winnerIsHome: boolean) {
  const counts = {
    overtime: 0,
    close: 0,
    medium: 0,
    stomp: 0,
    thirteenZero: 0,
  };

  for (let index = 0; index < SAMPLE_SIZE; index += 1) {
    const result = sampleMapScoreline(
      homeWinProbability,
      winnerIsHome,
      (index + 0.5) / SAMPLE_SIZE,
    );
    counts[result.band] += 1;
    if (result.winner === 13 && result.loser === 0) counts.thirteenZero += 1;
  }

  return counts;
}

function percentage(count: number) {
  return (count / SAMPLE_SIZE) * 100;
}

const neutral = sampleDistribution(0.5, true);
assert.ok(Math.abs(percentage(neutral.overtime) - 11.7) < 0.01);
assert.ok(Math.abs(percentage(neutral.close) - 33.85) < 0.01);
assert.ok(Math.abs(percentage(neutral.medium) - 37.15) < 0.01);
assert.ok(Math.abs(percentage(neutral.stomp) - 17.3) < 0.01);
assert.ok(Math.abs(percentage(neutral.thirteenZero) - 0.6146) < 0.01);

const expectedWinner = sampleDistribution(0.75, true);
const upsetWinner = sampleDistribution(0.75, false);
assert.ok(expectedWinner.stomp > neutral.stomp);
assert.ok(expectedWinner.overtime < neutral.overtime);
assert.ok(upsetWinner.stomp < neutral.stomp);
assert.ok(upsetWinner.overtime > neutral.overtime);

for (let index = 0; index < SAMPLE_SIZE; index += 1) {
  const result = sampleMapScoreline(0.5, true, (index + 0.5) / SAMPLE_SIZE);
  assert.ok(result.winner > result.loser);
  if (result.band === 'overtime') {
    assert.ok(result.winner >= 16);
    assert.ok(result.loser >= 12);
  } else {
    assert.equal(result.winner, 13);
    assert.ok(result.loser >= 0 && result.loser <= 11);
  }
}

console.log('Simulator scoreline distribution tests passed.');
