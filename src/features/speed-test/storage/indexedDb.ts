/**
 * Persistência em IndexedDB: histórico de sessões + preferências.
 * Validação defensiva na leitura/importação (secção 8 — XSS/abuso de dados importados).
 */
import type { SpeedTestSession } from '../engine/engineTypes';

const DB_NAME = 'speedtest-db';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_PREFS = 'prefs';

export const CURRENT_SCHEMA_VERSION = 1;

type Migration = (session: Record<string, unknown>) => Record<string, unknown>;

/** Migrações por omissão de schemaVersion. Manter ordenadas e versionadas. */
export const migrations: Record<number, Migration> = {
  // ex.: 1: (s) => ({ ...s, schemaVersion: 2, ... })
};

export function migrateSession(raw: unknown): SpeedTestSession | null {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw as Record<string, unknown>;
  const from = typeof s.schemaVersion === 'number' ? s.schemaVersion : 0;
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) {
    const m = migrations[v];
    if (m) s = m(s);
    else break;
  }
  return isValidSession(s) ? (s as unknown as SpeedTestSession) : null;
}

/** Validação estrutural mínima — rejeita payloads malformados importados. */
export function isValidSession(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const x = s as Record<string, any>;
  if (typeof x.id !== 'string' || x.id.length > 200) return false;
  if (typeof x.startedAt !== 'string' || Number.isNaN(Date.parse(x.startedAt))) return false;
  if (x.finishedAt !== null && (typeof x.finishedAt !== 'string' || Number.isNaN(Date.parse(x.finishedAt)))) return false;
  if (!['completed', 'partial', 'failed', 'cancelled'].includes(x.status)) return false;
  if (typeof x.schemaVersion !== 'number' || x.schemaVersion < 1 || x.schemaVersion > CURRENT_SCHEMA_VERSION) return false;
  if (!x.metrics || typeof x.metrics !== 'object') return false;
  if (!x.engine || typeof x.engine.profileId !== 'string') return false;
  if (!x.samples || typeof x.samples !== 'object') return false;
  // Limites anti-abuso para dados importados.
  const sampleKeys = ['unloadedLatencyMs', 'downloadLoadedLatencyMs', 'uploadLoadedLatencyMs', 'downloadMbps', 'uploadMbps'];
  for (const k of sampleKeys) {
    const arr = x.samples[k];
    if (arr !== undefined && !Array.isArray(arr)) return false;
    if (Array.isArray(arr) && arr.length > 5000) return false;
  }
  if (Array.isArray(x.diagnostics) && x.diagnostics.length > 200) return false;
  return true;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const historyRepository = {
  async save(session: SpeedTestSession): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      tx.objectStore(STORE_SESSIONS).put(session);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async list(): Promise<SpeedTestSession[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const req = tx.objectStore(STORE_SESSIONS).getAll();
      req.onsuccess = () => {
        const items = (req.result as unknown[])
          .map(migrateSession)
          .filter((s): s is SpeedTestSession => s !== null)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        db.close();
        resolve(items);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  },

  async get(id: string): Promise<SpeedTestSession | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const req = tx.objectStore(STORE_SESSIONS).get(id);
      req.onsuccess = () => { db.close(); resolve(migrateSession(req.result)); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  },

  async remove(id: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      tx.objectStore(STORE_SESSIONS).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async clear(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      tx.objectStore(STORE_SESSIONS).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async setPref<T>(key: string, value: T): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PREFS, 'readwrite');
      tx.objectStore(STORE_PREFS).put({ key, value });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async getPref<T>(key: string): Promise<T | undefined> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PREFS, 'readonly');
      const req = tx.objectStore(STORE_PREFS).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result?.value); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  },
};
