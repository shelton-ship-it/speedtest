import { describe, it, expect } from 'vitest';
import type { Results } from '@cloudflare/speedtest';
import { normalizeResults } from '@/features/speed-test/domain/normalizeResults';
import type { SpeedTestSession } from '@/features/speed-test/engine/engineTypes';

/** Motor falso com a forma da interface Results (apenas para testes). */
function fakeResults(overrides: Partial<Record<string, unknown>> = {}): Results {
  const def: Record<string, () => unknown> = {
    getDownloadBandwidth: () => undefined,
    getUploadBandwidth: () => undefined,
    getUnloadedLatency: () => undefined,
    getUnloadedJitter: () => undefined,
    getUnloadedLatencyPoints: () => [],
    getDownLoadedLatency: () => undefined,
    getDownLoadedJitter: () => undefined,
    getDownLoadedLatencyPoints: () => [],
    getUpLoadedLatency: () => undefined,
    getUpLoadedJitter: () => undefined,
    getUpLoadedLatencyPoints: () => [],
    getDownloadBandwidthPoints: () => [],
    getUploadBandwidthPoints: () => [],
    getPacketLoss: () => undefined,
    getTotalDurationMs: () => undefined,
    getScores: () => ({}),
    getSummary: () => ({}),
  };
  for (const k of Object.keys(overrides)) def[k] = () => (overrides as Record<string, unknown>)[k];
  return def as unknown as Results;
}

const baseInput = {
  profileId: 'balanced',
  profileVersion: 1,
  engineName: 'test-engine',
  engineVersion: '0.0.0',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  finishedAt: new Date('2026-01-01T00:00:30Z'),
  status: 'completed' as const,
  pageHiddenDuringTest: false,
  environment: { browser: null, os: null, connectionType: null },
};

describe('normalizeResults — sessão completa', () => {
  const bandPoint = (bps: number, measOffsetMs: number, bytes = 1e6) => ({
    bps, bytes, transferSize: bytes, measTime: new Date(2026 - 1970, 0, 1, 0, 0, measOffsetMs / 1000),
  });

  const session = normalizeResults({
    ...baseInput,
    results: fakeResults({
      getDownloadBandwidth: 94e6,
      getUploadBandwidth: 42e6,
      getUnloadedLatency: 12,
      getUnloadedLatencyPoints: [10, 14, 12],
      getDownLoadedLatency: 55,
      getDownLoadedLatencyPoints: [50, 60],
      getUpLoadedLatency: 80,
      getUpLoadedLatencyPoints: [70, 90],
      getDownloadBandwidthPoints: [bandPoint(90e6, 1), bandPoint(98e6, 2)],
      getUploadBandwidthPoints: [bandPoint(40e6, 3)],
      getTotalDurationMs: 29500,
      getScores: { gaming: { points: 85, classificationIdx: 3, classificationName: 'great' } },
    }),
  });

  it('converte bps para Mbps', () => {
    expect(session.metrics.downloadMbps.value).toBeCloseTo(94);
    expect(session.metrics.uploadMbps.value).toBeCloseTo(42);
    expect(session.metrics.downloadMbps.unit).toBe('Mbps');
  });

  it('calcula deltas sob carga como derivados', () => {
    expect(session.derived.downloadLoadedLatencyDeltaMs.value).toBeCloseTo(43);
    expect(session.derived.downloadLoadedLatencyDeltaMs.source).toBe('derived');
    expect(session.derived.uploadLoadedLatencyDeltaMs.value).toBeCloseTo(68);
  });

  it('deriva jitter quando o motor não fornece', () => {
    expect(session.metrics.unloadedJitterMs.status).toBe('measured');
    expect(session.metrics.unloadedJitterMs.value).toBeCloseTo(3); // |14-10|+|12-14| /2
  });

  it('preserva pontuações do motor e conta amostras', () => {
    expect(session.scores.gaming?.classificationName).toBe('great');
    expect(session.sampleCounts.download.valid).toBe(2);
    expect(session.sampleCounts.unloadedLatency.valid).toBe(3);
  });

  it('soma bytes transferidos e usa duração do motor', () => {
    expect(session.transferBytes).toBe(3e6);
    expect(session.durationMs).toBe(29500);
  });

  it('perda de pacotes é unsupported sem TURN (não zero)', () => {
    expect(session.metrics.packetLossRatio.status).toBe('unsupported');
  });

  it('amostras de bandwidth ficam em Mbps', () => {
    expect(session.samples.downloadMbps[0].value).toBeCloseTo(90);
  });
});

describe('normalizeResults — sessão parcial/vazia', () => {
  it('métricas ausentes ficam unavailable, nunca 0', () => {
    const s = normalizeResults({ ...baseInput, results: fakeResults(), status: 'partial' });
    expect(s.metrics.downloadMbps.status).toBe('unavailable');
    expect(s.metrics.downloadMbps.value).toBeNull();
    expect(s.metrics.unloadedLatencyMs.status).toBe('unavailable');
    expect(s.diagnostics.some((d) => d.code === 'no-samples')).toBe(true);
    expect(s.transferBytes).toBeNull();
    expect(s.status).toBe('partial');
  });

  it('regista página oculta como diagnóstico', () => {
    const s = normalizeResults({ ...baseInput, pageHiddenDuringTest: true, results: fakeResults({ getUnloadedLatency: 5, getUnloadedLatencyPoints: [5, 6] }) });
    expect(s.diagnostics.some((d) => d.code === 'page-hidden-during-test')).toBe(true);
  });
});

describe('classifyExperience v1', () => {
  const mk = (over: Partial<SpeedTestSession['metrics']> & { scores?: SpeedTestSession['scores'] }): SpeedTestSession => ({
    id: 'x', schemaVersion: 1, productVersion: '0', engine: { name: 'e', version: '0', profileId: 'balanced', profileVersion: 1 },
    startedAt: '', finishedAt: '', durationMs: 0, status: 'completed',
    metrics: {
      downloadMbps: { value: 200, unit: 'Mbps', source: 'engine', status: 'measured' },
      uploadMbps: { value: 50, unit: 'Mbps', source: 'engine', status: 'measured' },
      unloadedLatencyMs: { value: 10, unit: 'ms', source: 'engine', status: 'measured' },
      unloadedJitterMs: { value: 2, unit: 'ms', source: 'engine', status: 'measured' },
      downloadLoadedLatencyMs: { value: 20, unit: 'ms', source: 'engine', status: 'measured' },
      downloadLoadedJitterMs: { value: 3, unit: 'ms', source: 'engine', status: 'measured' },
      uploadLoadedLatencyMs: { value: 25, unit: 'ms', source: 'engine', status: 'measured' },
      uploadLoadedJitterMs: { value: 4, unit: 'ms', source: 'engine', status: 'measured' },
      packetLossRatio: { value: null, unit: 'ratio', source: 'engine', status: 'unsupported' },
      ...over,
    },
    derived: (over as Record<string, unknown>).__derivedUnavail ? {
      downloadLoadedLatencyDeltaMs: { value: null, unit: 'ms', source: 'derived', status: 'unavailable' },
      uploadLoadedLatencyDeltaMs: { value: null, unit: 'ms', source: 'derived', status: 'unavailable' },
    } : {
      downloadLoadedLatencyDeltaMs: { value: 10, unit: 'ms', source: 'derived', status: 'measured' },
      uploadLoadedLatencyDeltaMs: { value: 15, unit: 'ms', source: 'derived', status: 'measured' },
    },
    scores: over.scores ?? {}, sampleCounts: {}, transferBytes: null,
    samples: { unloadedLatencyMs: [], downloadLoadedLatencyMs: [], uploadLoadedLatencyMs: [], downloadMbps: [], uploadMbps: [] },
    environment: { browser: null, os: null, connectionType: null, pageHiddenDuringTest: false },
    diagnostics: [],
  });

  it('classifica ligação excelente para todos os casos de uso', async () => {
    const { classifyExperience } = await import('@/features/speed-test/domain/classifyExperience');
    const assessments = classifyExperience(mk({}));
    expect(assessments.length).toBe(6);
    expect(assessments.every((a) => a.rating === 'great')).toBe(true);
    expect(assessments.every((a) => !a.fromEngine)).toBe(true);
  });

  it('latência alta degrada gaming mas não streaming', async () => {
    const { classifyExperience } = await import('@/features/speed-test/domain/classifyExperience');
    const a = classifyExperience(mk({ unloadedLatencyMs: { value: 200, unit: 'ms', source: 'engine', status: 'measured' } }));
    const gaming = a.find((x) => x.useCase === 'gaming')!;
    const streaming = a.find((x) => x.useCase === 'streaming')!;
    expect(gaming.rating === 'poor' || gaming.rating === 'limited').toBe(true);
    expect(streaming.rating).toBe('great');
  });

  it('usa classificação do motor quando existe (fromEngine=true)', async () => {
    const { classifyExperience } = await import('@/features/speed-test/domain/classifyExperience');
    const a = classifyExperience(mk({ scores: { gaming: { points: 10, classificationIdx: 0, classificationName: 'bad' } } }));
    const gaming = a.find((x) => x.useCase === 'gaming')!;
    expect(gaming.fromEngine).toBe(true);
    expect(gaming.rating).toBe('poor');
  });

  it('sem medições → unknown, não poor', async () => {
    const { classifyExperience } = await import('@/features/speed-test/domain/classifyExperience');
    const a = classifyExperience(mk({
      __derivedUnavail: true,
      downloadMbps: { value: null, unit: 'Mbps', source: 'engine', status: 'unavailable' },
      uploadMbps: { value: null, unit: 'Mbps', source: 'engine', status: 'unavailable' },
      unloadedLatencyMs: { value: null, unit: 'ms', source: 'engine', status: 'unavailable' },
      unloadedJitterMs: { value: null, unit: 'ms', source: 'engine', status: 'unavailable' },
    } as never));
    // sem medições, nenhuma classificação pode ser positiva; é unknown (não poor inventado)
    expect(a.every((x) => x.rating === 'unknown')).toBe(true);
  });
});
