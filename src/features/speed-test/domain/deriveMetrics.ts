/**
 * Estatísticas derivadas sobre as amostras (mediana, percentis, dispersão,
 * valores atípicos assinalados sem serem apagados).
 */
import type { EngineSamplePoint } from '../engine/engineTypes';

export type SampleStats = {
  count: number;
  min: number | null;
  max: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  mean: number | null;
  /** Desvio padrão (amostral). */
  stddev: number | null;
  /** Coeficiente de variação (stddev/mean); null se mean === 0. */
  cv: number | null;
  outliers: number[];
};

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function computeStats(samples: EngineSamplePoint[]): SampleStats {
  const values = samples.map((s) => s.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) {
    return { count: 0, min: null, max: null, median: null, p25: null, p75: null, p95: null, mean: null, stddev: null, cv: null, outliers: [] };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
    : 0;
  const stddev = Math.sqrt(variance);

  // Outliers via regra documentada IQR*1.5 (não são apagados, apenas identificados).
  const q1 = percentile(sorted, 0.25) as number;
  const q3 = percentile(sorted, 0.75) as number;
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const outliers = values.filter((v) => v < loFence || v > hiFence);

  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: percentile(sorted, 0.5),
    p25: q1,
    p75: q3,
    p95: percentile(sorted, 0.95),
    mean,
    stddev: values.length > 1 ? stddev : null,
    cv: mean !== 0 && values.length > 1 ? stddev / mean : null,
    outliers,
  };
}
