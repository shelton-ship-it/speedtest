'use client';
import type { SpeedTestSession } from '../engine/engineTypes';
import { classifyExperience, CLASSIFY_RULES_VERSION } from '../domain/classifyExperience';
import { useI18n } from '../i18n/useI18n';

export function ExperienceScores({ session }: { session: SpeedTestSession }) {
  const { t } = useI18n();
  const assessments = classifyExperience(session);
  return (
    <section aria-labelledby="exp-title">
      <h2 id="exp-title">{t('section.experience')}</h2>
      <p className="muted">{t('usecase.browsing.limitation')} (regras v{CLASSIFY_RULES_VERSION})</p>
      <div className="grid">
        {assessments.map((a) => (
          <div className="card" key={a.useCase}>
            <h3>{t(a.useCase)}</h3>
            <span className={`badge ${a.rating}`}>
              {t('rating.' + a.rating)}{a.fromEngine ? ` · ${t('score.source.engine')}` : ` · ${t('score.source.product')}`}
            </span>
            <p style={{ fontSize: '0.9rem' }}>{t(a.explanationKey)}</p>
            <p className="muted">{t(a.limitationKey)}</p>
            {a.recommendationKeys.length > 0 && (
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                {a.recommendationKeys.map((rk) => <li key={rk}>{t(rk)}</li>)}
              </ul>
            )}
            <p className="muted">{t('stats.metricCol')}: {a.determiningMetrics.map((m) => m).join(', ') || '—'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
