import assert from 'node:assert/strict';
import { FederationSlug } from '@liga/shared';
import {
  getCctGlobalFinalsCoachMessage,
  getCctGlobalFinalsCoachSubject,
  getCctGlobalFinalsRegion,
} from './cct-global-finals-coach-messages';

for (const region of ['Europe', 'Americas', 'Asia', 'Oceania'] as const) {
  for (const outcome of ['start', 'quarterfinal_loss', 'semifinal_loss', 'champion'] as const) {
    const message = getCctGlobalFinalsCoachMessage({ region, outcome, city: 'Test City' });
    assert.ok(message);
    assert.equal(message.includes('CITY'), false);
  }
}

assert.equal(getCctGlobalFinalsRegion(FederationSlug.ESPORTS_OCE), 'Oceania');
assert.equal(getCctGlobalFinalsRegion('world'), null);
assert.equal(getCctGlobalFinalsCoachSubject(6), 'CCT Global Finals — Season 6');
