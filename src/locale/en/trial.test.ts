import assert from 'node:assert/strict';
import { getTrialFailureResponse, getTrialSuccessResponse } from './trial';

const playerMessages = [49.99, 50, 75, 90].map((completion) =>
  getTrialFailureResponse('RIFLER', completion),
);
assert.equal(new Set(playerMessages).size, 4);
assert.equal(getTrialFailureResponse('AWPER', 90), playerMessages[3]);
assert.equal(getTrialFailureResponse('RIFLER', 89.99), playerMessages[2]);
assert.equal(getTrialFailureResponse('RIFLER', 74.99), playerMessages[1]);

const iglMessages = [0, 25, 50, 50.01].map((completion) =>
  getTrialFailureResponse('IGL', completion),
);
assert.equal(new Set(iglMessages).size, 4);
assert.equal(getTrialFailureResponse('IGL', 49.99), iglMessages[1]);
assert.equal(getTrialFailureResponse('IGL', Number.NaN), iglMessages[0]);

const iglSuccessMessages = [0.99, 1, 1.5, 1.51].map((rating) =>
  getTrialSuccessResponse('IGL', 100, rating),
);
assert.equal(iglSuccessMessages[1], iglSuccessMessages[2]);
assert.equal(
  new Set([iglSuccessMessages[0], iglSuccessMessages[1], iglSuccessMessages[3]]).size,
  3,
);

for (const role of ['RIFLER', 'AWPER']) {
  const successMessages = [100, 124.99, 125, 149.99, 150].map((completion) =>
    getTrialSuccessResponse(role, completion, 1),
  );
  assert.equal(successMessages[0], successMessages[1]);
  assert.equal(successMessages[2], successMessages[3]);
  assert.equal(new Set([successMessages[0], successMessages[2], successMessages[4]]).size, 3);
}
