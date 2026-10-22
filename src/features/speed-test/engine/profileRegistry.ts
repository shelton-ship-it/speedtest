/**
 * Perfis de teste versionados, mapeados 1:1 sobre a opção `measurements`
 * do motor @cloudflare/speedtest v1.14.2 (API validada em docs/engine-api-1.14.2.d.ts).
 *
 * Cada perfil documenta o limite superior configurado de bytes e o número de
 * pedidos por fase. O volume real pode ser menor: o motor termina rondas de um
 * tipo de bandwidth assim que `bandwidthFinishRequestDuration` (1000 ms por
 * pedido) é atingido — os limites abaixo são conservadores (pior caso).
 */
import type { ConfigOptions } from '@cloudflare/speedtest';

export type ProfilePhaseKind = 'latency' | 'download' | 'upload' | 'packetLoss';

export type ProfilePhaseDoc = {
  kind: ProfilePhaseKind;
  /** numPackets para latência; count para bandwidth. */
  requests: number;
  /** bytes por pedido (bandwidth); null para latência/packetLoss. */
  bytesPerRequest: number | null;
  /** Limite superior estimado de bytes desta fase (requests * bytesPerRequest). */
  maxBytes: number;
};

export type TestProfile = {
  id: string;
  version: number;
  nameKey: string;
  descriptionKey: string;
  /** true se o perfil exige aviso de consumo de dados antes de iniciar. */
  requiresDataWarning: boolean;
  maxDownloadBytes: number;
  maxUploadBytes: number;
  totalRequests: number;
  phases: ProfilePhaseDoc[];
  /** Tempo máximo recomendado para a interface considerar o teste pendurado (ms). */
  uiTimeoutMs: number;
  /** Duração pretendida típica (estimativa), em segundos. */
  expectedDurationSec: [number, number];
  toEngineConfig(): ConfigOptions;
};

const KB = 1e3;
const MB = 1e6;

function doc(
  kind: ProfilePhaseKind,
  requests: number,
  bytesPerRequest: number | null,
): ProfilePhaseDoc {
  return {
    kind,
    requests,
    bytesPerRequest,
    maxBytes: bytesPerRequest === null ? 0 : requests * bytesPerRequest,
  };
}

function sumBytes(phases: ProfilePhaseDoc[], kind: 'download' | 'upload'): number {
  return phases.filter((p) => p.kind === kind).reduce((acc, p) => acc + p.maxBytes, 0);
}

/** Latências sob carga medidas em paralelo com as fases de bandwidth. */
const loadedLatencyFlags = {
  measureDownloadLoadedLatency: true,
  measureUploadLoadedLatency: true,
} satisfies ConfigOptions;

function buildPhasedProfile(opts: {
  id: string;
  version: number;
  nameKey: string;
  descriptionKey: string;
  requiresDataWarning: boolean;
  phases: ProfilePhaseDoc[];
  uiTimeoutMs: number;
  expectedDurationSec: [number, number];
}): TestProfile {
  const measurements = opts.phases.map((p) => {
    switch (p.kind) {
      case 'latency':
        return { type: 'latency' as const, numPackets: p.requests };
      case 'download':
      case 'upload':
        return {
          type: p.kind as 'download' | 'upload',
          bytes: p.bytesPerRequest as number,
          count: p.requests,
        };
      case 'packetLoss':
        return {
          type: 'packetLoss' as const,
          numPackets: p.requests,
          batchSize: 10,
          batchWaitTime: 10,
          responsesWaitTime: 3000,
        };
    }
  });

  const maxDownloadBytes = sumBytes(opts.phases, 'download');
  const maxUploadBytes = sumBytes(opts.phases, 'upload');
  const totalRequests = opts.phases.reduce((acc, p) => acc + p.requests, 0);

  return {
    id: opts.id,
    version: opts.version,
    nameKey: opts.nameKey,
    descriptionKey: opts.descriptionKey,
    requiresDataWarning: opts.requiresDataWarning,
    maxDownloadBytes,
    maxUploadBytes,
    totalRequests,
    phases: opts.phases,
    uiTimeoutMs: opts.uiTimeoutMs,
    expectedDurationSec: opts.expectedDurationSec,
    toEngineConfig(): ConfigOptions {
      return {
        autoStart: false,
        ...loadedLatencyFlags,
        measurements,
        // Não enviar resultados para o endpoint de logging da Cloudflare por defeito:
        // recolha remota é opcional e minimizada (regra 8 / secção 8 do documento).
        logAimApiUrl: null,
        logMeasurementApiUrl: null,
      };
    },
  };
}

export const PROFILES: TestProfile[] = [
  buildPhasedProfile({
    id: 'fast',
    version: 1,
    nameKey: 'profile.fast.name',
    descriptionKey: 'profile.fast.description',
    requiresDataWarning: false,
    phases: [
      doc('latency', 10, null),
      doc('download', 5, 1 * MB),
      doc('upload', 4, 1 * MB),
    ],
    uiTimeoutMs: 90_000,
    expectedDurationSec: [10, 25],
  }),
  buildPhasedProfile({
    id: 'balanced',
    version: 1,
    nameKey: 'profile.balanced.name',
    descriptionKey: 'profile.balanced.description',
    requiresDataWarning: false,
    phases: [
      doc('latency', 20, null),
      doc('download', 4, 100 * KB),
      doc('download', 8, 1 * MB),
      doc('upload', 6, 1 * MB),
      doc('download', 5, 10 * MB),
      doc('upload', 4, 10 * MB),
    ],
    uiTimeoutMs: 180_000,
    expectedDurationSec: [20, 60],
  }),
  buildPhasedProfile({
    id: 'precision',
    version: 1,
    nameKey: 'profile.precision.name',
    descriptionKey: 'profile.precision.description',
    requiresDataWarning: true,
    phases: [
      doc('latency', 40, null),
      doc('download', 6, 100 * KB),
      doc('download', 12, 1 * MB),
      doc('upload', 10, 1 * MB),
      doc('download', 10, 10 * MB),
      doc('upload', 8, 10 * MB),
      doc('download', 4, 25 * MB),
      doc('upload', 3, 25 * MB),
    ],
    uiTimeoutMs: 300_000,
    expectedDurationSec: [45, 150],
  }),
  buildPhasedProfile({
    id: 'diagnostic',
    version: 1,
    nameKey: 'profile.diagnostic.name',
    descriptionKey: 'profile.diagnostic.description',
    requiresDataWarning: true,
    phases: [
      doc('latency', 50, null),
      doc('download', 8, 100 * KB),
      doc('download', 14, 1 * MB),
      doc('upload', 12, 1 * MB),
      doc('download', 12, 10 * MB),
      doc('upload', 10, 10 * MB),
      doc('latency', 20, null),
    ],
    uiTimeoutMs: 300_000,
    expectedDurationSec: [60, 180],
  }),
];

export function getProfile(id: string): TestProfile {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`Perfil desconhecido: ${id}`);
  return p;
}

/**
 * Perfil personalizado: o utilizador escolhe um nível de amostragem.
 * Os limites de bytes continuam explícitos e verificáveis.
 */
export function buildCustomProfile(level: 'light' | 'standard' | 'heavy'): TestProfile {
  const scale = level === 'light' ? 0.5 : level === 'heavy' ? 2 : 1;
  const n = (base: number) => Math.max(2, Math.round(base * scale));
  return buildPhasedProfile({
    id: `custom-${level}`,
    version: 1,
    nameKey: 'profile.custom.name',
    descriptionKey: 'profile.custom.description',
    requiresDataWarning: level !== 'light',
    phases: [
      doc('latency', n(20), null),
      doc('download', n(4), 100 * KB),
      doc('download', n(8), 1 * MB),
      doc('upload', n(6), 1 * MB),
      doc('download', n(5), 10 * MB),
      doc('upload', n(4), 10 * MB),
    ],
    uiTimeoutMs: level === 'heavy' ? 420_000 : 240_000,
    expectedDurationSec: level === 'light' ? [15, 40] : level === 'heavy' ? [60, 200] : [25, 70],
  });
}
