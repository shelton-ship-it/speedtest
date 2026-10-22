'use client';
import type { SpeedTestSession } from '../engine/engineTypes';
import { diagnoseConnection } from '../domain/diagnoseConnection';
import { useI18n } from '../i18n/useI18n';

export function DiagnosticsPanel({ session }: { session: SpeedTestSession }) {
  const { t, fmtNum, fmtBytes } = useI18n();
  const items = diagnoseConnection(session);
  const env = session.environment;
  return (
    <section aria-labelledby="diag-title">
      <h2 id="diag-title">{t('section.diagnostics')}</h2>
      {items.length === 0 ? (
        <p className="muted">{t('diag.obs.noIssues')}</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {items.map((d, i) => (
            <li key={i} className={d.severity === 'warning' ? '' : 'muted'}>
              <strong>{d.severity === 'warning' ? 'Observação' : 'Nota'}:</strong>{' '}
              {t(d.observationKey, d.params)}
              {d.hypothesisKeys.length > 0 && (
                <> <em>  {d.hypothesisKeys.map((k) => t(k)).join('; ')}</em></>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="card">
        <h3>{t('section.context')}</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t('env.browser')}: {env.browser ?? '—'}</li>
          <li>{t('env.os')}: {env.os ?? '—'}</li>
          <li>{t('env.connectionType')}: {env.connectionType ?? t('env.connectionUnknown')}</li>
          <li>{t('env.visibility')}: {env.pageHiddenDuringTest ? t('env.hidden') : t('env.visible')}</li>
          <li>{t('metric.duration')}: {fmtNum(session.durationMs !== null ? session.durationMs / 1000 : null, 1)} s</li>
          <li>{t('metric.transferred')}: {fmtBytes(session.transferBytes)}</li>
        </ul>
        <p className="muted" style={{ marginTop: 8 }}>{t('about.privacy')}</p>
      </div>
    </section>
  );
}
