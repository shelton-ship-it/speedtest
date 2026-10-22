/**
 * Classificação de experiência por caso de uso.
 * Regras versionadas (v1), documentadas e baseadas em métricas observadas.
 * IMPORTANTE: são estimativas de adequação da ligação — o teste não mede
 * diretamente o desempenho de jogos, serviços de streaming ou aplicações.
 */
import type { SpeedTestSession } from '../engine/engineTypes';

export const CLASSIFY_RULES_VERSION = 1;

export type Rating = 'great' | 'good' | 'limited' | 'poor' | 'unknown';

export type UseCaseId = 'gaming' | 'streaming' | 'videoCalls' | 'browsing' | 'fileTransfers' | 'remoteWork';

export type UseCaseAssessment = {
  useCase: UseCaseId;
  rating: Rating;
  /** true quando a classificação vem das pontuações AIM do motor. */
  fromEngine: boolean;
  /** Chaves das métricas determinantes usadas. */
  determiningMetrics: string[];
  explanationKey: string;
  limitationKey: string;
  recommendationKeys: string[];
};

type Thresholds = { great: number; good: number; limited: number };

const DL: Thresholds = { great: 100, good: 25, limited: 10 };
const UL: Thresholds = { great: 20, good: 5, limited: 1 };
const LAT: Thresholds = { great: 30, good: 80, limited: 150 }; // menor é melhor
const JIT: Thresholds = { great: 10, good: 30, limited: 60 }; // menor é melhor
const LOADED_DELTA: Thresholds = { great: 20, good: 60, limited: 150 }; // menor é melhor

function rateHigherBetter(v: number | null, t: Thresholds): Rating {
  if (v === null) return 'unknown';
  if (v >= t.great) return 'great';
  if (v >= t.good) return 'good';
  if (v >= t.limited) return 'limited';
  return 'poor';
}

function rateLowerBetter(v: number | null, t: Thresholds): Rating {
  if (v === null) return 'unknown';
  if (v <= t.great) return 'great';
  if (v <= t.good) return 'good';
  if (v <= t.limited) return 'limited';
  return 'poor';
}

function worst(ratings: Rating[]): Rating {
  const order: Rating[] = ['poor', 'limited', 'good', 'great'];
  for (const o of order) if (ratings.includes(o)) return o;
  return 'unknown';
}

const ENGINE_RATING: Record<string, Rating> = {
  great: 'great',
  good: 'good',
  average: 'limited',
  poor: 'poor',
  bad: 'poor',
};

function val(m: SpeedTestSession['metrics']['downloadMbps']): number | null {
  return m.status === 'measured' ? m.value : null;
}

export function classifyExperience(session: SpeedTestSession): UseCaseAssessment[] {
  const dl = val(session.metrics.downloadMbps);
  const ul = val(session.metrics.uploadMbps);
  const lat = val(session.metrics.unloadedLatencyMs);
  const jit = val(session.metrics.unloadedJitterMs);
  const dlDelta = val(session.derived.downloadLoadedLatencyDeltaMs);
  const ulDelta = val(session.derived.uploadLoadedLatencyDeltaMs);

  const assessments: UseCaseAssessment[] = [];

  const pushDerived = (
    useCase: UseCaseId,
    ratings: [Rating, ...Rating[]],
    determiningMetrics: string[],
    recommendationKeys: string[],
  ) => {
    assessments.push({
      useCase,
      rating: worst(ratings),
      fromEngine: false,
      determiningMetrics,
      explanationKey: `usecase.${useCase}.explain`,
      limitationKey: `usecase.${useCase}.limitation`,
      recommendationKeys,
    });
  };

  const recFor = (r: Rating, metric: 'download' | 'upload' | 'latency'): string[] =>
    r === 'great' || r === 'unknown' ? [] : [`rec.improve.${metric}`];

  // Gaming: prioriza latência, jitter e delta sob carga; download secundário.
  const gamingFromEngine = engineRatingFor(session, 'gaming');
  if (gamingFromEngine) {
    assessments.push({
      useCase: 'gaming',
      rating: gamingFromEngine.rating,
      fromEngine: true,
      determiningMetrics: gamingFromEngine.metrics,
      explanationKey: 'usecase.gaming.explain',
      limitationKey: 'usecase.gaming.limitation.engine',
      recommendationKeys: [],
    });
  } else {
    pushDerived(
      'gaming',
      [rateLowerBetter(lat, LAT), rateLowerBetter(jit, JIT), rateLowerBetter(dlDelta, LOADED_DELTA), rateHigherBetter(dl, { great: 50, good: 15, limited: 5 })],
      ['unloadedLatencyMs', 'unloadedJitterMs', 'downloadLoadedLatencyDeltaMs', 'downloadMbps'],
      [...recFor(rateLowerBetter(lat, LAT), 'latency'), ...recFor(rateLowerBetter(dlDelta, LOADED_DELTA), 'latency')],
    );
  }

  // Streaming: download dominante; estabilidade conta.
  const streamingFromEngine = engineRatingFor(session, 'streaming');
  const streamRatings = [rateHigherBetter(dl, { great: 50, good: 15, limited: 5 }), rateLowerBetter(jit, JIT)];
  if (streamingFromEngine) {
    assessments.push({
      useCase: 'streaming',
      rating: streamingFromEngine.rating,
      fromEngine: true,
      determiningMetrics: streamingFromEngine.metrics,
      explanationKey: 'usecase.streaming.explain',
      limitationKey: 'usecase.streaming.limitation.engine',
      recommendationKeys: [],
    });
  } else {
    pushDerived('streaming', streamRatings as [Rating, ...Rating[]], ['downloadMbps', 'unloadedJitterMs'], recFor(streamRatings[0], 'download'));
  }

  // Videochamadas: simétrico — upload + latência + delta sob carga de upload.
  const rtcFromEngine = engineRatingFor(session, 'rtc');
  if (rtcFromEngine) {
    assessments.push({
      useCase: 'videoCalls',
      rating: rtcFromEngine.rating,
      fromEngine: true,
      determiningMetrics: rtcFromEngine.metrics,
      explanationKey: 'usecase.videoCalls.explain',
      limitationKey: 'usecase.videoCalls.limitation.engine',
      recommendationKeys: [],
    });
  } else {
    pushDerived(
      'videoCalls',
      [rateHigherBetter(ul, { great: 10, good: 3, limited: 1 }), rateLowerBetter(lat, LAT), rateLowerBetter(ulDelta, LOADED_DELTA)],
      ['uploadMbps', 'unloadedLatencyMs', 'uploadLoadedLatencyDeltaMs'],
      [...recFor(rateHigherBetter(ul, UL), 'upload'), ...recFor(rateLowerBetter(ulDelta, LOADED_DELTA), 'latency')],
    );
  }

  pushDerived('browsing', [rateHigherBetter(dl, { great: 25, good: 5, limited: 1 }), rateLowerBetter(lat, { great: 100, good: 200, limited: 400 })], ['downloadMbps', 'unloadedLatencyMs'], recFor(rateHigherBetter(dl, DL), 'download'));
  pushDerived('fileTransfers', [rateHigherBetter(dl, DL), rateHigherBetter(ul, UL)], ['downloadMbps', 'uploadMbps'], [...recFor(rateHigherBetter(dl, DL), 'download'), ...recFor(rateHigherBetter(ul, UL), 'upload')]);
  pushDerived('remoteWork', [rateHigherBetter(ul, { great: 10, good: 3, limited: 1 }), rateLowerBetter(lat, LAT), rateLowerBetter(dlDelta, LOADED_DELTA)], ['uploadMbps', 'unloadedLatencyMs', 'downloadLoadedLatencyDeltaMs'], recFor(rateHigherBetter(ul, UL), 'upload'));

  return assessments;
}

function engineRatingFor(session: SpeedTestSession, key: string): { rating: Rating; metrics: string[] } | null {
  const s = session.scores[key];
  if (!s) return null;
  const rating = ENGINE_RATING[s.classificationName] ?? 'unknown';
  return { rating, metrics: [`engine.score.${key}`] };
}
