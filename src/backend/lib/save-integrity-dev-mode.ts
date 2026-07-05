import crypto from 'node:crypto';
import log from 'electron-log';
import { is } from '@liga/shared';

const integrityLog = log.scope('save-integrity');
const DEV_MODE_FLAG = 'LPJ_SAVE_INTEGRITY_DEV_MODE';
const DEV_MODE_KEY = 'LPJ_SAVE_INTEGRITY_DEV_KEY';
const EXPECTED_DEV_MODE_KEY_HASH = 'ee5c262aa91105f369eef10904aac6b647b3d70c73ef73e448e46fa3ba6b9bb1';

function isEnabledValue(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes((value || '').trim().toLowerCase());
}

function hashKey(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function isSaveIntegrityDevModeEnabled() {
  if (!isEnabledValue(process.env[DEV_MODE_FLAG])) {
    return false;
  }

  if (!is.dev()) {
    integrityLog.warn('Ignoring save integrity development mode outside Electron dev runtime.');
    return false;
  }

  const key = process.env[DEV_MODE_KEY]?.trim();

  if (!key) {
    integrityLog.warn('Ignoring save integrity development mode because %s is missing.', DEV_MODE_KEY);
    return false;
  }

  if (hashKey(key) !== EXPECTED_DEV_MODE_KEY_HASH) {
    integrityLog.warn('Ignoring save integrity development mode because the key is invalid.');
    return false;
  }

  return true;
}
