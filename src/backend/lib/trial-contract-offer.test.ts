import assert from 'node:assert/strict';
import { TierSlug } from '@liga/shared';
import { getTrialSuccessResponseTier } from '@liga/locale/en/trial';
import {
  getTrialContractChatMessage,
  getTrialContractDecisionMessage,
  getTrialContractOpening,
  rollTrialContractTerms,
} from './trial-contract-offer';

function sequence(...values: number[]) {
  let index = 0;
  return () => values[index++] ?? 0;
}

assert.deepEqual(rollTrialContractTerms(TierSlug.LEAGUE_OPEN, 1, 'RIFLER', sequence(0, 0, 0, 0)), {
  contractMonths: 3,
  postBenchTerminationClause: true,
  postBenchTerminationMonths: 0.5,
  rosterStabilityClause: true,
});
assert.equal(
  rollTrialContractTerms(TierSlug.LEAGUE_ADVANCED, 3, 'AWPER', () => 0).contractMonths,
  12,
);
assert.equal(
  rollTrialContractTerms(TierSlug.LEAGUE_OPEN, 3, 'RIFLER', sequence(0.9, 0.999, 0.9))
    .contractMonths,
  12,
);
assert.equal(
  rollTrialContractTerms(TierSlug.LEAGUE_MAIN, 2, 'IGL', sequence(0.9, 0, 0.149))
    .rosterStabilityClause,
  true,
);
assert.equal(
  rollTrialContractTerms(TierSlug.LEAGUE_MAIN, 2, 'IGL', sequence(0.9, 0, 0.15))
    .rosterStabilityClause,
  false,
);

assert.equal(getTrialSuccessResponseTier('RIFLER', 100, 1.4), 1);
assert.equal(getTrialSuccessResponseTier('AWPER', 125, 1.4), 2);
assert.equal(getTrialSuccessResponseTier('RIFLER', 150, 1.4), 3);
assert.equal(getTrialSuccessResponseTier('IGL', 200, 0.99), 1);
assert.equal(getTrialSuccessResponseTier('IGL', 100, 1.5), 2);
assert.equal(getTrialSuccessResponseTier('IGL', 100, 1.51), 3);

assert.match(getTrialContractChatMessage(1, 'USER X', 'COACH X', 'ALGO'), /previously discussed/);
assert.match(
  getTrialContractChatMessage(2, 'USER X', 'COACH X', 'ALGO'),
  /Following your discussions/,
);
assert.match(getTrialContractChatMessage(3, 'USER X', 'COACH X', 'ALGO'), /successful conclusion/);
assert.match(getTrialContractOpening(3, 'RIFLER', 'COACH X', 'ALGO'), /outstanding trial/);
assert.match(getTrialContractOpening(3, 'IGL', 'COACH X', 'ALGO'), /leadership and impact/);
assert.match(getTrialContractDecisionMessage(2, 'RIFLER', true), /strong trial/);
assert.match(getTrialContractDecisionMessage(2, 'IGL', true), /your leadership/);
assert.match(getTrialContractDecisionMessage(1, 'RIFLER', false), /decided not to accept/);
assert.match(getTrialContractDecisionMessage(1, 'IGL', false), /through your leadership/);

console.log('trial contract offer tests passed');
