import { Database } from 'node-sqlite3-wasm'
import type { JSValue } from 'node-sqlite3-wasm'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync, rmdirSync } from 'fs'
import { SCHEMA_SQL, MIGRATIONS } from './schema'

let db: Database | null = null

function getDbPath(): string {
  const filename = process.env['NODE_ENV'] === 'development' ? 'prepcoach-dev.db' : 'prepcoach.db'
  return join(app.getPath('userData'), filename)
}

function applySchema(instance: Database): void {
  // Execute each statement individually — node-sqlite3-wasm's exec() locks
  // itself when given multi-statement SQL, so we split and run one at a time.
  const statements = SCHEMA_SQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const sql of statements) {
    instance.prepare(sql).run([])
  }
}

function runMigrations(instance: Database): void {
  instance.prepare(`INSERT OR IGNORE INTO settings (key,value) VALUES ('schema_version','0')`).run([])
  const row = instance.prepare(`SELECT value FROM settings WHERE key='schema_version'`).get([]) as { value: string } | null
  let ver = parseInt(row?.value ?? '0', 10)
  for (const m of MIGRATIONS) {
    if (m.version > ver) {
      try {
        for (const sql of m.sql.split(';').map((s) => s.trim()).filter(Boolean)) {
          instance.prepare(sql).run([])
        }
        instance.prepare(`UPDATE settings SET value=? WHERE key='schema_version'`).run([String(m.version)])
        ver = m.version
      } catch (e) {
        // Log but don't rethrow — a failed migration must never wipe existing user data.
        // The app continues with the schema it already has.
        console.error(`[DB] Migration v${m.version} failed (skipped):`, e)
      }
    }
  }
}

function openFresh(dbPath: string): Database {
  const instance = new Database(dbPath)
  try {
    applySchema(instance)
    runMigrations(instance)
  } catch (e) {
    // Close the handle so the file descriptor is released before the caller
    // tries to delete or re-open the file (Windows won't delete open files).
    try { instance.close() } catch { /* ignore */ }
    throw e
  }
  return instance
}

function clearStaleLock(dbPath: string): void {
  // Only removes the advisory lock directory — leaves the DB file intact.
  try {
    if (existsSync(dbPath + '.lock')) rmdirSync(dbPath + '.lock')
  } catch { /* ignore */ }
}

function wipeDb(dbPath: string): void {
  // Full wipe: DB file + WAL/SHM sidecars + lock directory.
  // Only called when the DB itself is corrupt and unrecoverable.
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix
    try { if (existsSync(f)) unlinkSync(f) } catch { /* file may be locked */ }
  }
  try {
    if (existsSync(dbPath + '.lock')) rmdirSync(dbPath + '.lock')
  } catch { /* ignore */ }
}

export function initDb(): void {
  if (db) return
  const dbPath = getDbPath()
  try {
    db = openFresh(dbPath)
  } catch (e) {
    // First: try clearing a stale lock (common after hot-reload crash).
    // This preserves the DB file — only the lock directory is removed.
    if (existsSync(dbPath + '.lock')) {
      console.warn('[DB] Stale lock found — clearing lock and retrying (data preserved)...')
      clearStaleLock(dbPath)
      try {
        db = openFresh(dbPath)
        return
      } catch (e2) {
        console.error('[DB] Still failing after lock clear:', e2)
      }
    }

    // Second: if dev mode and DB is truly corrupt (not just a lock issue), wipe and start fresh.
    if (process.env['NODE_ENV'] === 'development') {
      console.warn('[DB] Wiping corrupt dev database and starting fresh...')
      wipeDb(dbPath)
      db = openFresh(dbPath)
    } else {
      throw new Error('Failed to open database. Close any other running instances and try again.')
    }
  }
}

export function getDb(): Database {
  if (!db) initDb()
  return db!
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

// node-sqlite3-wasm requires named param keys to include the @ prefix.
// This helper transforms {key: value} → {'@key': value} and converts undefined → null.
export function namedParams(obj: Record<string, unknown>): Record<string, JSValue> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [`@${k}`, v ?? null])
  ) as Record<string, JSValue>
}
