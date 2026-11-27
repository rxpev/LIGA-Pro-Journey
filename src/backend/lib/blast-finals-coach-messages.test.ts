import assert from 'node:assert/strict';
import {
  getBlastFinalsCoachMessage,
  getBlastFinalsCoachSubject,
  getBlastFinalsOpeningRankFromConversation,
} from './blast-finals-coach-messages';

for (let openingWorldRank = 1; openingWorldRank <= 8; openingWorldRank += 1) {
  const start = getBlastFinalsCoachMessage({
    openingWorldRank,
    outcome: 'start',
    city: 'Test City',
  });
  assert.ok(start);
  assert.equal(start.includes('CITY'), false);
  assert.ok(getBlastFinalsCoachMessage({ openingWorldRank, outcome: 'champion', city: 'Test City' }));
  for (const eliminationStage of [
    'lower_round_1',
    'lower_round_2',
    'lower_semifinal',
    'lower_final',
    'grand_final',
  ] as const) {
    assert.ok(
      getBlastFinalsCoachMessage({
        openingWorldRank,
        outcome: 'eliminated',
        eliminationStage,
        city: 'Test City',
      }),
    );
  }
  assert.equal(
    getBlastFinalsOpeningRankFromConversation({
      dialogueContents: [start],
      city: 'Test City',
    }),
    openingWorldRank,
  );
}

assert.equal(getBlastFinalsCoachMessage({ openingWorldRank: 9, outcome: 'start' }), null);
assert.equal(getBlastFinalsCoachSubject(2), 'BLAST Finals — Season 2');
