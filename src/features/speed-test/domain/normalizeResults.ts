/**
 * Normalização dos resultados do motor para o modelo interno.
 * Regras: ausência de dados ≠ zero; valores derivados têm fonte 'derived';
 * amostras do motor são convertidas para unidades estáveis (ms / Mbps).
 */
import type { Results, BandwidthPoint } from '@cloudflare/speedtest';
import type {
  Diagnostic,
  EngineSamplePoint,
  ExperienceScoreInfo,
  SpeedTestSession,
} from '../engine/engineTypes';
import { measuredMetric, unavailableMetric } from '../engine/engineTypes';

export const SCHEMA_VERSION = 1;
export const PRODUCT_VERSION = '0.1.0';

const BITS_PER_MBPS = 1e6;

export function bpsToMbps(bps: number): number {
  return bps / BITS_PER_MBPS;
}

export function mbpsToMBs(mbps: number): number {
  // Mbps -> MB/s: dividir por 8 (unidades diferentes — deve ser indicado no UI).
  return mbps / 8;
}

function latencyPointsToSamples(points: number[], startedAtMs: number): EngineSamplePoint[] {
  // O motor devolve apenas os valores de ping; sem timestamps por ponto.
  // Usamos a ordem de recolha e não inventamos tempos precisos por amostra.
  return points.map((v, i) => ({
    t: new Date(startedAtMs + i).toISOString(),
    value: v,
  }));
}

function bandwidthPointsToSamples(points: BandwidthPoint[]): EngineSamplePoint[] {
  return points
    .filter((p) => Number.isFinite(p.bps) && p.bps >= 0)
    .map((p) => ({
      t: p.measTime.toISOString(),
      value: bpsToMbps(p.bps),
      bytes: p.transferSize > 0 ? p.transferSize : p.bytes,
    }));
}

function sumTransferBytes(points: BandwidthPoint[]): number {
  return points.reduce((acc, p) => acc + (Number.isFinite(p.transferSize) && p.transferSize > 0 ? p.transferSize : p.bytes), 0);
}

function jitterFromPoints(points: number[]): number | null {
  if (points.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.abs(points[i] - points[i - 1]);
  return sum / (points.length - 1);
}

export type NormalizeInput = {
  results: Results;
  profileId: string;
  profileVersion: number;
  engineName: string;
  engineVersion: string;
  startedAt: Date;
  finishedAt: Date;
  status: SpeedTestSession['status'];
  pageHiddenDuringTest: boolean;
  environment: { browser: string | null; os: string | null; connectionType: string | null };
  extraDiagnostics?: Diagnostic[];
};

export function normalizeResults(input: NormalizeInput): SpeedTestSession {
  const { results } = input;
  const startedAtMs = input.startedAt.getTime();

  const dlMbps = results.getDownloadBandwidth();
  const ulMbps = results.getUploadBandwidth();
  const unloadedLat = results.getUnloadedLatency();
  const unloadedJit = results.getUnloadedJitter();
  const dlLoadedLat = results.getDownLoadedLatency();
  const dlLoadedJit = results.getDownLoadedJitter();
  const ulLoadedLat = results.getUpLoadedLatency();
  const ulLoadedJit = results.getUpLoadedJitter();
  const packetLoss = results.getPacketLoss();
  const totalDurationMs = results.getTotalDurationMs();

  const unloadedPoints = results.getUnloadedLatencyPoints();
  const dlLoadedPoints = results.getDownLoadedLatencyPoints();
  const ulLoadedPoints = results.getUpLoadedLatencyPoints();
  const dlBandPoints = results.getDownloadBandwidthPoints();
  const ulBandPoints = results.getUploadBandwidthPoints();

  const metric = (v: number | null | undefined, unit: string) =>
    v === undefined || v === null ? unavailableMetric(unit) : measuredMetric(v, unit);

  const downloadMbpsVal = dlMbps !== undefined ? bpsToMbps(dlMbps) : undefined;
  const uploadMbpsVal = ulMbps !== undefined ? bpsToMbps(ulMbps) : undefined;

  // Jitter: usar o valor do motor quando existe; caso contrário derivar dos pontos.
  const unloadedJitterFinal =
    unloadedJit === undefined
      ? unloadedPoints.length >= 2
        ? jitterFromPoints(unloadedPoints)
        : undefined
      : unloadedJit;
  const dlJitterFinal =
    dlLoadedJit === undefined
      ? dlLoadedPoints.length >= 2
        ? jitterFromPoints(dlLoadedPoints)
        : undefined
      : dlLoadedJit;
  const ulJitterFinal =
    ulLoadedJit === undefined
      ? ulLoadedPoints.length >= 2
        ? jitterFromPoints(ulLoadedPoints)
        : undefined
      : ulLoadedJit;

  const metrics: SpeedTestSession['metrics'] = {
    downloadMbps: metric(downloadMbpsVal, 'Mbps'),
    uploadMbps: metric(uploadMbpsVal, 'Mbps'),
    unloadedLatencyMs: metric(unloadedLat, 'ms'),
    unloadedJitterMs: metric(unloadedJitterFinal ?? undefined, 'ms'),
    downloadLoadedLatencyMs: metric(dlLoadedLat, 'ms'),
    downloadLoadedJitterMs: metric(dlJitterFinal ?? undefined, 'ms'),
    uploadLoadedLatencyMs: metric(ulLoadedLat, 'ms'),
    uploadLoadedJitterMs: metric(ulJitterFinal ?? undefined, 'ms'),
    // Perda de pacotes só com TURN próprio configurado → unsupported nesta versão.
    packetLossRatio: { value: null, unit: 'ratio', source: 'engine', status: 'unsupported' },
  };

  const delta = (loaded?: number, idle?: number) =>
    loaded !== undefined && idle !== undefined
      ? measuredMetric(loaded - idle, 'ms', 'derived')
      : { value: null, unit: 'ms', source: 'derived' as const, status: 'unavailable' as const };

  const derived = {
    downloadLoadedLatencyDeltaMs: delta(dlLoadedLat, unloadedLat),
    uploadLoadedLatencyDeltaMs: delta(ulLoadedLat, unloadedLat),
  };

  const scores: Record<string, ExperienceScoreInfo | null> = {};
  const engineScores = results.getScores();
  for (const [key, s] of Object.entries(engineScores)) {
    scores[key] = { points: s.points, classificationIdx: s.classificationIdx, classificationName: s.classificationName };
  }

  const transferBytes = sumTransferBytes(dlBandPoints) + sumTransferBytes(ulBandPoints);

  const diagnostics: Diagnostic[] = [...(input.extraDiagnostics ?? [])];
  if (input.pageHiddenDuringTest) {
    diagnostics.push({ code: 'page-hidden-during-test', severity: 'warning', messageKey: 'diag.pageHidden' });
  }
  if (!input.environment.connectionType) {
    diagnostics.push({ code: 'network-info-unavailable', severity: 'info', messageKey: 'diag.networkInfoUnavailable' });
  }
  diagnostics.push({ code: 'packet-loss-not-configured', severity: 'info', messageKey: 'diag.packetLossNotConfigured' });

  const validCounts: SpeedTestSession['sampleCounts'] = {
    unloadedLatency: { valid: unloadedPoints.length, discarded: 0 },
    downloadLoadedLatency: { valid: dlLoadedPoints.length, discarded: 0 },
    uploadLoadedLatency: { valid: ulLoadedPoints.length, discarded: 0 },
    download: { valid: dlBandPoints.length, discarded: 0 },
    upload: { valid: ulBandPoints.length, discarded: 0 },
  };
  if (dlBandPoints.length === 0 && ulBandPoints.length === 0 && unloadedPoints.length === 0) {
    diagnostics.push({ code: 'no-samples', severity: 'error', messageKey: 'diag.noSamples' });
  } else if (dlBandPoints.length < 3 || ulBandPoints.length < 3) {
    diagnostics.push({ code: 'low-sample-count', severity: 'warning', messageKey: 'diag.lowSampleCount' });
  }

  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    productVersion: PRODUCT_VERSION,
    engine: {
      name: input.engineName,
      version: input.engineVersion,
      profileId: input.profileId,
      profileVersion: input.profileVersion,
    },
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: totalDurationMs ?? input.finishedAt.getTime() - startedAtMs,
    status: input.status,
    metrics,
    derived,
    scores,
    sampleCounts: validCounts,
    transferBytes: transferBytes > 0 ? transferBytes : null,
    samples: {
      unloadedLatencyMs: latencyPointsToSamples(unloadedPoints, startedAtMs),
      downloadLoadedLatencyMs: latencyPointsToSamples(dlLoadedPoints, startedAtMs),
      uploadLoadedLatencyMs: latencyPointsToSamples(ulLoadedPoints, startedAtMs),
      downloadMbps: bandwidthPointsToSamples(dlBandPoints),
      uploadMbps: bandwidthPointsToSamples(ulBandPoints),
    },
    environment: {
      browser: input.environment.browser,
      os: input.environment.os,
      connectionType: input.environment.connectionType,
      pageHiddenDuringTest: input.pageHiddenDuringTest,
    },
    diagnostics,
  };
}
