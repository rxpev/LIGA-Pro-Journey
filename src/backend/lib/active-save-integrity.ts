import log from 'electron-log';
import DatabaseClient from '@liga/backend/lib/database-client';
import { sealSaveIntegrity } from '@liga/backend/lib/save-integrity';
import { isSaveIntegrityDevModeEnabled } from '@liga/backend/lib/save-integrity-dev-mode';

const integrityLog = log.scope('save-integrity');

export async function sealActiveSaveIntegrity(options: { throwOnError?: boolean } = {}) {
  if (!DatabaseClient.connected || DatabaseClient.id === 0) {
    return;
  }

  if (isSaveIntegrityDevModeEnabled()) {
    integrityLog.warn(
      'Save integrity development mode is enabled; skipping seal for %s.',
      DatabaseClient.path,
    );
    return;
  }

  await sealSaveIntegrity(DatabaseClient.prisma as any, DatabaseClient.path).catch((error) => {
    integrityLog.warn('Could not seal save integrity for %s.', DatabaseClient.path);
    integrityLog.warn(error);
    if (options.throwOnError) throw error;
  });
}

export async function disconnectActiveDatabaseWithIntegrity() {
  // Never disconnect and switch databases after a failed seal. Doing so leaves
  // an older sidecar ready to roll only part of the save back on next launch.
  await sealActiveSaveIntegrity({ throwOnError: true });
  await DatabaseClient.disconnect();
}
