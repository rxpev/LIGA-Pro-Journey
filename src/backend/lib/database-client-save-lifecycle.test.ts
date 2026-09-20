/**
 * Regression coverage for deleting a save and reusing its id.
 *
 * This is a standalone ts-node test, matching the other backend integration
 * tests in this directory. It uses an isolated APPDATA directory and never
 * touches the user's saves.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';

process.env.NODE_ENV = 'cli';

function getSqlite<T>(dbPath: string, query: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.configure('busyTimeout', 5000);
    db.get(query, (error, row: T) => {
      db.close(() => {
        if (error) reject(error);
        else resolve(row);
      });
    });
  });
}

async function main() {
  const appDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'liga-save-lifecycle-'));
  const rootSavePath = path.resolve('src/backend/prisma/saves/save_0.db');
  const temporaryRootSavePath = path.join(appDataPath, 'LIGA Pro Journey', 'saves', 'save_0.db');
  await fs.mkdir(path.dirname(temporaryRootSavePath), { recursive: true });
  await fs.copyFile(rootSavePath, temporaryRootSavePath);
  process.env.APPDATA = appDataPath;

  // Require after APPDATA is configured because DatabaseClient resolves its
  // base path at runtime from this environment.
  const { default: DatabaseClient } = require('./database-client') as typeof import('./database-client');
  const savePath = path.join(appDataPath, 'LIGA Pro Journey', 'saves', 'save_1.db');

  try {
    await DatabaseClient.connect(0);
    await DatabaseClient.disconnect();

    const firstSave = await DatabaseClient.initSave(1);
    assert.equal(firstSave.created, true);
    await DatabaseClient.connect(1);
    await DatabaseClient.forget(1);
    await fs.unlink(savePath);

    // Reusing the same id must create and fully initialize a new database,
    // even though the old path was migrated and maintained earlier in this
    // process.
    const recreatedSave = await DatabaseClient.initSave(1);
    assert.equal(recreatedSave.created, true);
    await DatabaseClient.connect(1);
    assert.ok(await DatabaseClient.prisma.profile.count());
    await DatabaseClient.forget(1);

    // A schema can be ahead of its migration ledger after an interrupted
    // update. The additive migration should catch up without duplicate-column
    // failure and record itself as applied.
    await DatabaseClient.connect(1);
    await DatabaseClient.prisma.$executeRawUnsafe(
      'DELETE FROM _prisma_migrations WHERE migration_name = \'20260915120000_npc_recruitment_policy\'',
    );
    await DatabaseClient.forget(1);
    await DatabaseClient.migrate(1);
    const migration = await getSqlite<{ count: number }>(
      savePath,
      'SELECT COUNT(*) AS count FROM _prisma_migrations WHERE migration_name = \'20260915120000_npc_recruitment_policy\'',
    );
    assert.equal(migration?.count, 1);
  } finally {
    await DatabaseClient.disconnect().catch(() => Promise.resolve());
    await fs.rm(appDataPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
