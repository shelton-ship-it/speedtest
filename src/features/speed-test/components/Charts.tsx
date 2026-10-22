'use client';
import { useMemo } from 'react';
import type { EngineSamplePoint } from '../engine/engineTypes';
import { computeStats, percentile } from '../domain/deriveMetrics';
import { useI18n } from '../i18n/useI18n';

type Series = { labelKey: string; points: EngineSamplePoint[]; color: 'accent' | 'ok' | 'warn' };

const COLOR: Record<Series['color'], string> = { accent: 'var(--accent)', ok: 'var(--ok)', warn: 'var(--warn)' };

/** Gráfico temporal SVG próprio (sem libs externas). Ausência de dados nunca é desenhada como zero. */
export function TimeSeriesChart({ titleKey, series, unit, height = 160 }: {
  titleKey: string;
  series: Series[];
  unit: string;
  height?: number;
}) {
  const { t, fmtNum } = useI18n();
  const W = 600;
  const H = height;
  const PAD = 34;

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => Number.isFinite(v));
    if (all.length === 0) return null;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const times = series.flatMap((s) => s.points.map((p) => Date.parse(p.t)));
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const tSpan = tMax - tMin || 1;
    const paths = series.map((s) => {
      if (s.points.length === 0) return { ...s, d: '', count: 0, outlierXy: [] as Array<[number, number]> };
      // Outliers IQR*1.5 sobre os valores (regra documentada em deriveMetrics).
      const values = s.points.map((p) => p.value).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      let loFence = -Infinity;
      let hiFence = Infinity;
      if (values.length >= 4) {
        const q1 = percentile(values, 0.25) as number;
        const q3 = percentile(values, 0.75) as number;
        const iqr = q3 - q1;
        loFence = q1 - 1.5 * iqr;
        hiFence = q3 + 1.5 * iqr;
      }
      const xy = s.points.map((p) => {
        const x = PAD + ((Date.parse(p.t) - tMin) / tSpan) * (W - PAD * 2);
        const y = H - PAD - ((p.value - min) / span) * (H - PAD * 2);
        return [x, y] as [number, number];
      });
      const d = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      const outlierXy = s.points
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => Number.isFinite(p.value) && (p.value < loFence || p.value > hiFence))
        .map(({ i }) => xy[i]);
      return { ...s, d, outlierXy, count: s.points.length };
    });
    return { min, max, paths };
  }, [series]);

  if (!model) {
    return (
      <div className="card">
        <h3>{t(titleKey)}</h3>
        <p className="muted">{t('diag.noSamples')}</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>{t(titleKey)} <span className="muted">({unit})</span></h3>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t(titleKey)} style={{ width: '100%', display: 'block' }}>
        <text x={4} y={14}>{fmtNum(model.max, 1)}</text>
        <text x={4} y={H - PAD + 12}>{fmtNum(model.min, 1)}</text>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" />
        {model.paths.map((p) => (
          <g key={p.labelKey}>
            <path d={p.d} stroke={COLOR[p.color]} strokeWidth={2} fill="none" />
            {p.outlierXy.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={3.5} fill="var(--bad)">
                <title>{'Outlier'}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="row muted">
        {model.paths.map((p) => (
          <span key={p.labelKey} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 12, height: 3, background: COLOR[p.color], display: 'inline-block', borderRadius: 2 }} />
            {t(p.labelKey)} · {p.count} {t('stats.samplesLabel')}
          </span>
        ))}
        <span>{t('chart.outliersNote', { count: '' })}</span>
      </div>
    </div>
  );
}

/** Comparação latência em repouso vs sob carga. */
export function LoadedVsIdleChart({ rows }: { rows: Array<{ groupKey: string; idleMs: number | null; loadedDlMs: number | null; loadedUlMs: number | null }> }) {
  const { t, fmtNum } = useI18n();
  const bars: Array<{ key: string; value: number; color: string }> = [];
  for (const r of rows) {
    if (r.idleMs !== null) bars.push({ key: `${r.groupKey}.idle`, value: r.idleMs, color: 'var(--accent)' });
    if (r.loadedDlMs !== null) bars.push({ key: `${r.groupKey}.dl`, value: r.loadedDlMs, color: 'var(--warn)' });
    if (r.loadedUlMs !== null) bars.push({ key: `${r.groupKey}.ul`, value: r.loadedUlMs, color: 'var(--ok)' });
  }
  const max = bars.length ? Math.max(...bars.map((b) => b.value)) : 1;
  return (
    <div className="card">
      <h3>{t('chart.loadedLatencyTitle')}</h3>
      {bars.length === 0 ? (
        <p className="muted">{t('diag.noSamples')}</p>
      ) : (
        rows.map((r) => (
          <div key={r.groupKey} style={{ marginBottom: 10 }}>
            <div className="muted">{t(r.groupKey)}</div>
            {([['metric.latency', r.idleMs, 'var(--accent)'], ['metric.loadedLatencyDown', r.loadedDlMs, 'var(--warn)'], ['metric.loadedLatencyUp', r.loadedUlMs, 'var(--ok)']] as const).map(([k, v, c]) =>
              v !== null ? (
                <div key={k} className="row" style={{ gap: 6 }}>
                  <span className="muted" style={{ minWidth: 150 }}>{t(k)}</span>
                  <div style={{ flex: 1, background: 'var(--panel-2)', borderRadius: 4, height: 12 }} aria-hidden>
                    <div style={{ width: `${(v / max) * 100}%`, height: '100%', borderRadius: 4, background: c }} />
                  </div>
                  <span>{fmtNum(v, 0)} ms</span>
                </div>
              ) : null,
            )}
          </div>
        ))
      )}
    </div>
  );
}

/** Estatísticas derivadas das amostras (mediana, percentis, CV, outliers). */
export function SampleStatsTable({ samplesByKind }: { samplesByKind: Record<string, EngineSamplePoint[]> }) {
  const { t, fmtNum } = useI18n();
  const entries = Object.entries(samplesByKind).filter(([, pts]) => pts.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="card">
      <h3>{t('section.diagnostics')}</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('stats.metricCol')}</th>
            <th scope="col">{t('stats.nCol')}</th>
            <th scope="col">{t('stats.median')}</th>
            <th scope="col">{t('stats.p95')}</th>
            <th scope="col">{t('stats.min') + '/' + t('stats.max')}</th>
            <th scope="col">{t('stats.cv')}</th>
            <th scope="col">{t('stats.outliers')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, pts]) => {
            const s = computeStats(pts);
            return (
              <tr key={key}>
                <th scope="row">{t(key)}</th>
                <td>{s.count}</td>
                <td>{fmtNum(s.median)}</td>
                <td>{fmtNum(s.p95)}</td>
                <td>{fmtNum(s.min)} – {fmtNum(s.max)}</td>
                <td>{s.cv !== null ? `${fmtNum(s.cv * 100, 0)}%` : '—'}</td>
                <td>{s.outliers.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">{t('stats.outliersKept')}</p>
    </div>
  );
}
