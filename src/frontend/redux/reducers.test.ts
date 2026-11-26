import assert from 'node:assert/strict';
import { ReduxActions } from './actions';
import { reduceEmails } from './reducers';

const oldDialogue = {
  id: 10,
  content: 'Opening message',
  sentAt: new Date('2026-01-01T00:00:00.000Z'),
};
const newDialogue = {
  id: 11,
  content: 'Live follow-up message',
  sentAt: new Date('2026-01-02T00:00:00.000Z'),
};
const oldEmail = {
  id: 1,
  subject: 'Europe RMR — Season 1',
  sentAt: oldDialogue.sentAt,
  dialogues: [oldDialogue],
};
const otherEmail = {
  id: 2,
  subject: 'Other conversation',
  sentAt: new Date('2025-12-31T00:00:00.000Z'),
  dialogues: [] as typeof oldDialogue[],
};
const state = [oldEmail, otherEmail] as any;

const next = reduceEmails(state, {
  type: ReduxActions.EMAILS_UPDATE,
  payload: [
    {
      ...oldEmail,
      sentAt: newDialogue.sentAt,
      dialogues: [oldDialogue, newDialogue],
    },
  ],
} as any);

assert.equal(next.length, 2);
assert.equal(next[0].id, oldEmail.id);
assert.deepEqual(
  next[0].dialogues.map((dialogue: any) => dialogue.id),
  [newDialogue.id, oldDialogue.id],
);
assert.equal(next[0].dialogues[0].content, 'Live follow-up message');
assert.equal(next.find((email: any) => email.id === otherEmail.id)?.subject, otherEmail.subject);
assert.deepEqual(oldEmail.dialogues, [oldDialogue], 'the previous Redux state must not be mutated');
