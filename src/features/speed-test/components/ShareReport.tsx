'use client';
import { useState } from 'react';
import type { SpeedTestSession } from '../engine/engineTypes';
import { exportJson, exportCsv, summaryText, download } from '../export/exportFormats';
import { useI18n } from '../i18n/useI18n';

export function ShareReport({ session }: { session: SpeedTestSession }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const stamp = session.startedAt.slice(0, 19).replace(/[:T]/g, '-');

  async function copySummary() {
    const text = summaryText(session, t);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied('idle'), 2500);
  }

  async function nativeShare() {
    const text = summaryText(session, t);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('app.title'), text });
      } catch {
        /* utilizador cancelou — não é erro */
      }
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <section aria-labelledby="share-title" className="no-print">
      <h2 id="share-title">{t('section.report')}</h2>
      <div className="row">
        <button onClick={() => download(`speedtest-${stamp}.json`, exportJson(session), 'application/json')}>{t('action.exportJson')}</button>
        <button onClick={() => download(`speedtest-${stamp}.csv`, exportCsv(session), 'text/csv')}>{t('action.exportCsv')}</button>
        <button onClick={copySummary}>{t('action.copySummary')}</button>
        {canShare ? (
          <button onClick={nativeShare}>{t('action.share')}</button>
        ) : (
          <span className="muted">{t('share.notSupported')}</span>
        )}
        <button onClick={() => window.print()}>{t('action.print')}</button>
      </div>
      {copied !== 'idle' && (
        <p role="status" className="muted">{copied === 'ok' ? t('share.copied') : t('share.copyFailed')}</p>
      )}
      <p className="muted">{t('share.disclaimer')} · {t('share.engine')}: {session.engine.name} {session.engine.version} · {t('share.profile')}: {session.engine.profileId}</p>
    </section>
  );
}
