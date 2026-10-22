import { describe, it, expect } from 'vitest';
import { bpsToMbps, mbpsToMBs, jitterFromPointsForTest } from './_testExports';
import { percentile, computeStats } from '@/features/speed-test/domain/deriveMetrics';
import { measuredMetric, unavailableMetric } from '@/features/speed-test/engine/engineTypes';

describe('conversões de unidades', () => {
  it('bps -> Mbps', () => {
    expect(bpsToMbps(1e6)).toBe(1);
    expect(bpsToMbps(94e6)).toBe(94);
    expect(bpsToMbps(0)).toBe(0);
  });
  it('Mbps -> MB/s (unidades diferentes: dividir por 8)', () => {
    expect(mbpsToMBs(80)).toBe(10);
    expect(mbpsToMBs(8)).toBe(1);
  });
});

describe('metricas normalizadas — ausencia != zero', () => {
  it('unavailableMetric preserva null e marca indisponivel', () => {
    const m = unavailableMetric('ms');
    expect(m.value).toBeNull();
    expect(m.status).toBe('unavailable');
  });
  it('measuredMetric aceita valores validos', () => {
    const m = measuredMetric(12.5, 'Mbps');
    expect(m).toEqual({ value: 12.5, unit: 'Mbps', source: 'engine', status: 'measured' });
  });
  it('measuredMetric rejeita negativos, infinitos e NaN como invalid (nunca como zero)', () => {
    for (const bad of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      const m = measuredMetric(bad, 'Mbps');
      expect(m.status).toBe('invalid');
      expect(m.value).toBeNull();
    }
  });
});

describe('estatisticas derivadas', () => {
  const pts = (values: number[]) => values.map((v, i) => ({ t: `2026-01-01T00:00:0${i}.000Z`, value: v }));

  it('percentile interpola corretamente', () => {
    const sorted = [10, 20, 30, 40];
    expect(percentile(sorted, 0.5)).toBeCloseTo(25);
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 1)).toBe(40);
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.95)).toBe(7);
  });

  it('computeStats mediana/p95/CV/outliers IQR sem apagar', () => {
    const s = computeStats(pts([10, 11, 12, 13, 14, 15, 100]));
    expect(s.count).toBe(7);
    expect(s.median).toBe(13);
    expect(s.outliers).toContain(100); // assinalado, nao removido do count
    expect(s.cv).not.toBeNull();
    expect(s.min).toBe(10);
    expect(s.max).toBe(100);
  });

  it('computeStats com amostras vazias devolve tudo null (nao zero)', () => {
    const s = computeStats([]);
    expect(s.count).toBe(0);
    expect(s.median).toBeNull();
    expect(s.mean).toBeNull();
    expect(s.cv).toBeNull();
  });

  it('filtra valores nao finitos', () => {
    const s = computeStats([{ t: 'x', value: 5 }, { t: 'y', value: Number.NaN }, { t: 'z', value: 7 }] as never);
    expect(s.count).toBe(2);
  });

  it('jitter derivado = media das diferencas absolutas consecutivas', () => {
    expect(jitterFromPointsForTest([10, 12, 15])).toBeCloseTo((2 + 3) / 2);
    expect(jitterFromPointsForTest([10])).toBeNull();
  });
});
