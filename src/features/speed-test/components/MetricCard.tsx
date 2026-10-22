'use client';
import type { MetricValue } from '../engine/engineTypes';
import { useI18n } from '../i18n/useI18n';

export function MetricCard({ titleKey, metric, unitOverride, digits = 1 }: {
  titleKey: string;
  metric: MetricValue | undefined;
  /** Ex.: converter Mbps -> MB/s quando o utilizador alterna unidades. */
  unitOverride?: { convert: (v: number) => number; unit: string };
  digits?: number;
}) {
  const { t, fmtNum } = useI18n();
  const status = metric?.status ?? 'unavailable';
  const raw = metric && status === 'measured' ? metric.value : null;
  const shown = raw !== null ? (unitOverride ? unitOverride.convert(raw) : raw) : null;
  const unit = unitOverride?.unit ?? metric?.unit ?? '';
  const sourceNote = metric?.source === 'derived' ? '' : null;
  return (
    <div className="card" role="group" aria-label={t(titleKey)}>
      <h3>{t(titleKey)}</h3>
      {shown !== null ? (
        <>
          <span className="metric-value">{fmtNum(shown, digits)}</span>{' '}
          <span className="metric-unit">{unit}</span>
        </>
      ) : (
        <span className="muted">
          {status === 'unsupported' ? t('unit.unsupported') : t('unit.unavailable')}
        </span>
      )}
      <div className="muted">
        {t('metric.source.' + (metric?.source ?? 'engine'))}
        {sourceNote ? ` · ${sourceNote}` : ''}
      </div>
    </div>
  );
}
