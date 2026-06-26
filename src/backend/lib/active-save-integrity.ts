import log from 'electron-log';
import DatabaseClient from '@liga/backend/lib/database-client';
import { sealSaveIntegrity } from '@liga/backend/lib/save-integrity';

const integrityLog = log.scope('save-integrity');

export async function sealActiveSaveIntegrity() {
  if (!DatabaseClient.connected || DatabaseClient.id === 0) {
    return;
  }

  await sealSaveIntegrity(DatabaseClient.prisma as any, DatabaseClient.path).catch((error) => {
    integrityLog.warn('Could not seal save integrity for %s.', DatabaseClient.path);
    integrityLog.warn(error);
  });
}

export async function disconnectActiveDatabaseWithIntegrity() {
  await sealActiveSaveIntegrity();
  await DatabaseClient.disconnect();
}
