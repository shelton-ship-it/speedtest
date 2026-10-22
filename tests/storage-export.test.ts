import { describe, it, expect } from 'vitest';
import { isValidSession, migrateSession, historyRepository, CURRENT_SCHEMA_VERSION } from '@/features/speed-test/storage/indexedDb';
import { exportJson, exportCsv, parseBackup, exportSessionsBackup } from '@/features/speed-test/export/exportFormats';
import type { SpeedTestSession } from '@/features/speed-test/engine/engineTypes';

function mkSession(id = 's1'): SpeedTestSession {
  return {
    id, schemaVersion: CURRENT_SCHEMA_VERSION, productVersion: '0.1.0',
    engine: { name: 'e', version: '1', profileId: 'balanced', profileVersion: 1 },
    startedAt: new Date('2026-01-01T00:00:00Z').toISOString(), finishedAt: new Date('2026-01-01T00:00:30Z').toISOString(),
    durationMs: 30000, status: 'completed',
    metrics: {
      downloadMbps: { value: 94.2, unit: 'Mbps', source: 'engine', status: 'measured' },
      uploadMbps: { value: null, unit: 'Mbps', source: 'engine', status: 'unavailable' },
      unloadedLatencyMs: { value: 12, unit: 'ms', source: 'engine', status: 'measured' },
      unloadedJitterMs: { value: 3, unit: 'ms', source: 'engine', status: 'measured' },
      downloadLoadedLatencyMs: { value: 55, unit: 'ms', source: 'engine', status: 'measured' },
      downloadLoadedJitterMs: { value: 4, unit: 'ms', source: 'engine', status: 'measured' },
      uploadLoadedLatencyMs: { value: null, unit: 'ms', source: 'engine', status: 'unavailable' },
      uploadLoadedJitterMs: { value: null, unit: 'ms', source: 'engine', status: 'unavailable' },
      packetLossRatio: { value: null, unit: 'ratio', source: 'engine', status: 'unsupported' },
    },
    derived: {
      downloadLoadedLatencyDeltaMs: { value: 43, unit: 'ms', source: 'derived', status: 'measured' },
      uploadLoadedLatencyDeltaMs: { value: null, unit: 'ms', source: 'derived', status: 'unavailable' },
    },
    scores: {}, sampleCounts: { download: { valid: 2, discarded: 0 } }, transferBytes: 2e7,
    samples: { unloadedLatencyMs: [{ t: 'x', value: 12 }], downloadLoadedLatencyMs: [], uploadLoadedLatencyMs: [], downloadMbps: [{ t: 'y', value: 90, bytes: 1e6 }], uploadMbps: [] },
    environment: { browser: null, os: null, connectionType: null, pageHiddenDuringTest: false },
    diagnostics: [],
  };
}

describe('validação de sessões (importações seguras)', () => {
  it('aceita sessão válida', () => expect(isValidSession(mkSession())).toBe(true));
  it('rejeita não-objeto / sem id / datas inválidas / status inválido', () => {
    expect(isValidSession(null)).toBe(false);
    expect(isValidSession({})).toBe(false);
    expect(isValidSession({ ...mkSession(), startedAt: 'lixo' })).toBe(false);
    expect(isValidSession({ ...mkSession(), status: 'hackeado' })).toBe(false);
    expect(isValidSession({ ...mkSession(), schemaVersion: 999 })).toBe(false);
  });
  it('rejeita listas de amostras enormes (anti-abuso)', () => {
    const big = mkSession();
    big.samples.downloadMbps = Array.from({ length: 5001 }, (_, i) => ({ t: 'x', value: i }));
    expect(isValidSession(big)).toBe(false);
  });
  it('migrateSession devolve null para lixo e sessão para dados válidos', () => {
    expect(migrateSession('string')).toBeNull();
    expect(migrateSession(mkSession())).not.toBeNull();
  });
});

describe('exportações', () => {
  const s = mkSession();
  it('JSON round-trip preserva métricas', () => {
    const parsed = JSON.parse(exportJson(s));
    expect(parsed.metrics.downloadMbps.value).toBe(94.2);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
  it('CSV inclui secções metric/derived/meta/sample com unidade e estado', () => {
    const csv = exportCsv(s);
    expect(csv.startsWith('section,key,value,unit,status,source')).toBe(true);
    expect(csv).toContain('metric,downloadMbps,94.2,Mbps,measured,engine');
    expect(csv).toContain('metric,uploadMbps,unavailable,Mbps,unavailable,engine');
    expect(csv).toContain('derived,downloadLoadedLatencyDeltaMs,43,ms,measured,derived');
    expect(csv).toContain('sample,downloadMbps,90,Mbps,measured,engine');
  });
  it('parseBackup aceita array e objeto sessions; rejeita lixo', () => {
    expect(parseBackup(JSON.stringify([s]))?.length).toBe(1);
    expect(parseBackup(exportSessionsBackup([s]))?.length).toBe(1);
    expect(parseBackup('<script>x</script>')).toBeNull();
    expect(parseBackup(JSON.stringify({ nope: 1 }))).toBeNull();
  });
});

describe('histórico IndexedDB (fake-indexeddb)', () => {
  it('save/list/get/remove/clear', async () => {
    const s1 = mkSession('id-1');
    await historyRepository.save(s1);
    expect((await historyRepository.list()).map((x) => x.id)).toContain('id-1');
    const got = await historyRepository.get('id-1');
    expect(got?.metrics.downloadMbps.value).toBe(94.2);
    await historyRepository.remove('id-1');
    expect(await historyRepository.get('id-1')).toBeNull();
    await historyRepository.save(mkSession('id-2'));
    await historyRepository.clear();
    expect(await historyRepository.list()).toEqual([]);
  });
  it('list filtra entradas corrompidas guardadas diretamente', async () => {
    // guardar via save uma sessão malformada contorna? save usa put direto — validar leitura defensiva:
    const bad = { ...mkSession('bad-1'), status: 'invalid-status' } as unknown as SpeedTestSession;
    await historyRepository.save(bad);
    const list = await historyRepository.list();
    expect(list.find((x) => x.id === 'bad-1')).toBeUndefined();
    await historyRepository.clear();
  });
});
