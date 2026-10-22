/**
 * Modelo interno normalizado de resultados do Speed Test.
 * Independente da estrutura interna do motor (regra arquitetural 1 e 2).
 */

export type MetricStatus = 'measured' | 'unavailable' | 'unsupported' | 'invalid';
export type MetricSource = 'engine' | 'derived';

export type MetricValue = {
  value: number | null;
  unit: string;
  source: MetricSource;
  status: MetricStatus;
};

export function unavailableMetric(unit: string): MetricValue {
  return { value: null, unit, source: 'engine', status: 'unavailable' };
}

export function measuredMetric(value: number, unit: string, source: MetricSource = 'engine'): MetricValue {
  if (!Number.isFinite(value) || value < 0) {
    return { value: null, unit, source, status: 'invalid' };
  }
  return { value, unit, source, status: 'measured' };
}

export type SessionStatus = 'completed' | 'partial' | 'failed' | 'cancelled';

export type EngineSamplePoint = {
  /** Timestamp ISO do ponto. */
  t: string;
  /** Valor em ms (latência) ou Mbps (bandwidth). */
  value: number;
  /** Bytes do payload quando aplicável (bandwidth). */
  bytes?: number;
};

export type ExperienceScoreInfo = {
  points: number;
  classificationIdx: number;
  classificationName: string;
};

export type DiagnosticCode =
  | 'page-hidden-during-test'
  | 'network-info-unavailable'
  | 'packet-loss-not-configured'
  | 'upload-failed'
  | 'download-failed'
  | 'engine-error'
  | 'timeout'
  | 'no-samples'
  | 'low-sample-count'
  | 'high-variability'
  | 'bufferbloat-suspected'
  | 'possible-vpn-proxy'
  | 'results-partial';

export type Diagnostic = {
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'error';
  messageKey: string;
  params?: Record<string, string | number>;
};

export type SpeedTestSession = {
  id: string;
  schemaVersion: number;
  productVersion: string;
  engine: {
    name: string;
    version: string;
    profileId: string;
    profileVersion: number;
  };
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: SessionStatus;
  metrics: {
    downloadMbps: MetricValue;
    uploadMbps: MetricValue;
    unloadedLatencyMs: MetricValue;
    unloadedJitterMs: MetricValue;
    downloadLoadedLatencyMs: MetricValue;
    downloadLoadedJitterMs: MetricValue;
    uploadLoadedLatencyMs: MetricValue;
    uploadLoadedJitterMs: MetricValue;
    packetLossRatio: MetricValue;
  };
  /** Derivados pelo produto (fonte 'derived'). */
  derived: {
    downloadLoadedLatencyDeltaMs: MetricValue;
    uploadLoadedLatencyDeltaMs: MetricValue;
  };
  scores: Record<string, ExperienceScoreInfo | null>;
  sampleCounts: Record<string, { valid: number; discarded: number }>;
  transferBytes: number | null;
  samples: {
    unloadedLatencyMs: EngineSamplePoint[];
    downloadLoadedLatencyMs: EngineSamplePoint[];
    uploadLoadedLatencyMs: EngineSamplePoint[];
    downloadMbps: EngineSamplePoint[];
    uploadMbps: EngineSamplePoint[];
  };
  environment: {
    browser: string | null;
    os: string | null;
    connectionType: string | null;
    pageHiddenDuringTest: boolean;
  };
  diagnostics: Diagnostic[];
};

/** Estado em tempo real exposto pelo controlador ao UI (não é persistido cru). */
export type LivePhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'measuring_latency'
  | 'measuring_download'
  | 'measuring_upload'
  | 'measuring_packet_loss'
  | 'processing_results'
  | 'completed'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'partial'
  | 'failed';

export type LiveMetrics = {
  downloadMbps: number | null;
  uploadMbps: number | null;
  unloadedLatencyMs: number | null;
  downloadLoadedLatencyMs: number | null;
  uploadLoadedLatencyMs: number | null;
  transferBytesDownload: number | null;
  transferBytesUpload: number | null;
  phaseProgress: { done: number; total: number } | null;
  elapsedMs: number;
  /** Estimativa de duração restante — sempre identificada como estimativa no UI. */
  etaMs: number | null;
};
