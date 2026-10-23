'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { TestController, PROFILES } from '../state/testController';
import { SessionReport } from './SessionReport';
import { MiniGlobe } from './MiniGlobe';
import { LiveThroughputChart, type LivePoint } from './LiveThroughputChart';
import { useI18n, I18nContext, makeI18n } from '../i18n/useI18n';
import type { Locale } from '../i18n/i18n';
import { historyRepository } from '../storage/indexedDb';
import { mbpsToMBs } from '../domain/normalizeResults';

const PHASE_LABEL: Record<string, string> = {
  idle: 'phase.idle', checking: 'phase.checking', ready: 'phase.ready',
  measuring_latency: 'phase.measuring_latency', measuring_download: 'phase.measuring_download',
  measuring_upload: 'phase.measuring_upload', measuring_packet_loss: 'phase.measuring_packet_loss',
  processing_results: 'phase.processing_results', completed: 'phase.completed',
  paused: 'phase.paused', cancelling: 'phase.cancelling', cancelled: 'phase.cancelled',
  partial: 'phase.partial', failed: 'phase.failed',
};

export function SpeedTestApp() {
  const [locale, setLocale] = useState<Locale>('pt');
  const [unitMb, setUnitMb] = useState(false);
  const [acknowledgedWarning, setAcknowledged] = useState<Set<string>>(new Set());
  const i18n = useMemo(() => makeI18n(locale), [locale]);
  const controllerRef = useRef<TestController | null>(null);
  if (!controllerRef.current) controllerRef.current = new TestController();
  const controller = controllerRef.current;

  const subscribe = useCallback((fn: () => void) => controller.subscribe(fn), [controller]);
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => () => controller.dispose(), [controller]);

  // Preferências persistidas (unidade/idioma/vista).
  useEffect(() => {
    void historyRepository.getPref<boolean>('unitMb').then((v) => v !== undefined && setUnitMb(v));
    void historyRepository.getPref<Locale>('locale').then((v) => v === 'en' && setLocale('en'));
  }, []);
  useEffect(() => { void historyRepository.setPref('unitMb', unitMb).catch(() => undefined); }, [unitMb]);
  useEffect(() => { void historyRepository.setPref('locale', locale).catch(() => undefined); }, [locale]);

  const { t, fmtNum, fmtBytes } = i18n;
  const busy = ['running', 'paused', 'cancelling', 'processing'].includes(snap.state);
  const live = snap.live;
  const profile = controller.currentProfile;
  const shown = (mbps: number | null | undefined) => (mbps === null || mbps === undefined ? null : unitMb ? mbpsToMBs(mbps) : mbps);
  const unitLabel = unitMb ? 'MB/s' : 'Mbps';

  // Buffer ao vivo para o gráfico Canvas (atualizado por ref — sem re-render por amostra).
  const livePointsRef = useRef<LivePoint[]>([]);
  useEffect(() => {
    if (snap.state === 'checking') livePointsRef.current = []; // novo teste: limpar
    const dl = shown(live?.downloadMbps ?? null);
    const ul = shown(live?.uploadMbps ?? null);
    if (live) {
      const arr = livePointsRef.current;
      const last = arr[arr.length - 1];
      if (last && Date.now() - last.t < 250 && (last.dl === dl || dl === null) && (last.ul === ul || ul === null)) {
        // coalescer atualizações muito próximas mantendo a última leitura conhecida
        arr[arr.length - 1] = { ...last, t: Date.now(), dl: dl ?? last.dl, ul: ul ?? last.ul };
      } else {
        arr.push({ t: Date.now(), dl, ul });
      }
      if (arr.length > 800) arr.splice(0, arr.length - 800);
    }
  }, [live, unitMb]); // eslint-disable-line react-hooks/exhaustive-deps

  const spinning = ['running', 'paused', 'cancelling', 'processing'].includes(snap.state);
  const phaseLabelKey = PHASE_LABEL[snap.livePhase] ?? 'phase.idle';

  return (
    <I18nContext.Provider value={i18n}>
      <header className="site">
        <h1>{t('app.title')}</h1>
        <div className="row no-print">
          <button onClick={() => setUnitMb((u) => !u)} aria-pressed={unitMb}>{`${t('unit.toggle')}: ${unitLabel}`}</button>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={'Idioma'}>
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </div>
      </header>
      <main id="main">
        <div className="layout-with-sidebar">
          <aside className="sidebar no-print" aria-label={t('globe.sidebarLabel')}>
            <MiniGlobe spinning={spinning} />
          </aside>
          <div className="content-col">
        <p className="muted">{t('app.subtitle')}</p>
        <p className="muted">{t('unit.note.mbpsVsMBs')}</p>
        <p className="muted">{t('about.engineNotice')}</p>

        <section aria-labelledby="control-title" className="no-print">
          <h2 id="control-title">{t('profile.label')}</h2>
          <div className="row" role="radiogroup" aria-label={t('profile.label')}>
            {PROFILES.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={snap.profileId === p.id}
                disabled={busy}
                onClick={() => controller.selectProfile(p.id)}
              >
                {t(p.nameKey)}
              </button>
            ))}
          </div>
          {snap.profileId === 'custom' && (
            <div className="row">
              <label htmlFor="custom-level">{t('profile.customLevel')}</label>
              <select id="custom-level" disabled={busy} value={snap.customLevel} onChange={(e) => controller.selectCustomLevel(e.target.value as 'light' | 'standard' | 'heavy')}>
                <option value="light">{t('profile.level.light')}</option>
                <option value="standard">{t('profile.level.standard')}</option>
                <option value="heavy">{t('profile.level.heavy')}</option>
              </select>
            </div>
          )}
          <p className="muted">{t(profile.descriptionKey)}</p>
          <p className="muted">{t('profile.budget', { req: profile.totalRequests, dl: fmtBytes(profile.maxDownloadBytes), ul: fmtBytes(profile.maxUploadBytes), dur: `${profile.expectedDurationSec[0]}–${profile.expectedDurationSec[1]} s` })}</p>
          {profile.requiresDataWarning && !acknowledgedWarning.has(profile.id) && (
            <div className="notice" role="alert">
              <p>{t('profile.intensiveWarning')}</p>
              <button
                data-testid="acknowledge-warning"
                disabled={busy}
                onClick={() => setAcknowledged((s) => new Set(s).add(profile.id))}
              >
                {t('action.acknowledgeWarning')}
              </button>
            </div>
          )}
          {controller.otherTabRunning && <p className="notice">{t('error.crossTab')}</p>}

          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="primary"
              onClick={() => controller.start()}
              disabled={busy || snap.state === 'checking' || (profile.requiresDataWarning && !acknowledgedWarning.has(profile.id))}
            >
              {snap.session || ['completed', 'partial', 'cancelled', 'failed'].includes(snap.state) ? t('action.retry') : t('action.start')}
            </button>
            <button onClick={() => controller.pause()} disabled={snap.state !== 'running' || !snap.supportsPause}>{t('action.pause')}</button>
            <button onClick={() => controller.resume()} disabled={snap.state !== 'paused'}>{t('action.resume')}</button>
            <button onClick={() => controller.cancel()} disabled={!['running', 'paused'].includes(snap.state)}>{t('action.cancel')}</button>
          </div>

          <p role="status" aria-live="polite" className="muted">{t(PHASE_LABEL[snap.livePhase] ?? 'phase.idle')}</p>

          {live && (
            <LiveThroughputChart
              pointsRef={livePointsRef}
              phase={snap.livePhase}
              phaseLabel={t(phaseLabelKey)}
              unit={unitLabel}
            />
          )}
          {live && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {([['metric.download', shown(live.downloadMbps)], ['metric.upload', shown(live.uploadMbps)], ['metric.latency', live.unloadedLatencyMs], ['metric.loadedLatencyDown', live.downloadLoadedLatencyMs], ['metric.loadedLatencyUp', live.uploadLoadedLatencyMs]] as const).map(([k, v]) => (
                <div className="card" key={k}>
                  <h3>{t(k)}</h3>
                  <span className="metric-value" style={{ fontSize: '1.4rem' }}>{v === null ? '—' : fmtNum(v, k.includes('Latency') ? 0 : 1)}</span>{' '}
                  <span className="metric-unit">{k.includes('Latency') ? 'ms' : unitLabel}</span>
                </div>
              ))}
            </div>
          )}
          {live?.phaseProgress && (
            <div aria-label={t('live.phase')} role="progressbar" aria-valuemin={0} aria-valuemax={live.phaseProgress.total} aria-valuenow={live.phaseProgress.done}>
              <progress max={live.phaseProgress.total} value={live.phaseProgress.done} />
              <span className="muted">{live.phaseProgress.done}/{live.phaseProgress.total} · {t('metric.transferred')}: {fmtBytes((live.transferBytesDownload ?? 0) + (live.transferBytesUpload ?? 0))}</span>
              {live.etaMs !== null && <span className="muted"> · {t('live.eta')}: ~{fmtNum(live.etaMs / 1000, 0)} s</span>}
            </div>
          )}
          {snap.errorKey && (
            <div className="errorbox" role="alert">
              {t(snap.errorKey)} <button onClick={() => controller.start()}>{t('action.retry')}</button>
            </div>
          )}
        </section>

        {snap.session && (snap.state === 'completed' || snap.state === 'partial' || snap.state === 'cancelled' || snap.state === 'failed') && (
          <>
            {snap.state === 'partial' && <p className="notice">{t('phase.partial')}</p>}
            {snap.state === 'cancelled' && <p className="notice">{t('phase.cancelled')}</p>}
            <SessionReport session={snap.session} unitMb={unitMb} />
          </>
        )}

        <HistorySection />
          </div>{/* .content-col */}
        </div>{/* .layout-with-sidebar */}
      </main>
      <footer className="site">
        {t('about.privacy')} {`v0.1.0`}
      </footer>
    </I18nContext.Provider>
  );
}

function HistorySection() {
  const { t, fmtNum, fmtDate, fmtBytes } = useI18n();
  const [sessions, setSessions] = useState<import('../engine/engineTypes').SpeedTestSession[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<import('../engine/engineTypes').SpeedTestSession | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(() => {
    void historyRepository.list().then(setSessions).catch(() => setSessions([]));
  }, []);
  useEffect(reload, [reload]);

  async function toggleCompare(id: string) {
    setSelected((sel) => sel.includes(id) ? sel.filter((s) => s !== id) : [...sel.slice(-1), id].slice(-3));
  }

  const compared = (sessions ?? []).filter((s) => selected.includes(s.id));

  return (
    <section aria-labelledby="history-title" className="no-print">
      <h2 id="history-title">{t('section.history')}</h2>
      <p className="muted">{t('history.localNote')}</p>
      {sessions === null ? (
        <p className="muted">{'…'}</p>
      ) : sessions.length === 0 ? (
        <p className="muted">{t('history.empty')}</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('share.date')}</th>
                <th scope="col">{t('metric.download')}</th>
                <th scope="col">{t('metric.upload')}</th>
                <th scope="col">{t('metric.latency')}</th>
                <th scope="col">{t('profile.label')}</th>
                <th scope="col">{'Estado'}</th>
                <th scope="col">{'Ações'}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.startedAt)}</td>
                  <td>{s.metrics.downloadMbps.status === 'measured' ? `${fmtNum(s.metrics.downloadMbps.value)} Mbps` : t('unit.unavailable')}</td>
                  <td>{s.metrics.uploadMbps.status === 'measured' ? `${fmtNum(s.metrics.uploadMbps.value)} Mbps` : t('unit.unavailable')}</td>
                  <td>{s.metrics.unloadedLatencyMs.status === 'measured' ? `${fmtNum(s.metrics.unloadedLatencyMs.value, 0)} ms` : t('unit.unavailable')}</td>
                  <td>{t('profile.' + s.engine.profileId + '.name')}</td>
                  <td>{'—'}</td>
                  <td className="row">
                    <button onClick={() => setDetail(s)}>{'Ver detalhes'}</button>
                    <button onClick={() => void toggleCompare(s.id)} aria-pressed={selected.includes(s.id)}>{t('history.compareHint')}</button>
                    <button onClick={async () => { await historyRepository.remove(s.id); if (detail?.id === s.id) setDetail(null); reload(); }}>{t('action.deleteSession')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {compared.length >= 2 && (
            <div className="card">
              <h3>{t('history.compare')}</h3>
              <table>
                <thead><tr><th scope="col">{t('share.date')}</th><th scope="col">{t('metric.download')}</th><th scope="col">{t('metric.upload')}</th><th scope="col">{t('metric.latency')}</th><th scope="col">{t('metric.jitter')}</th><th scope="col">{t('metric.duration')}</th></tr></thead>
                <tbody>
                  {compared.map((s) => (
                    <tr key={s.id}>
                      <td>{fmtDate(s.startedAt)}</td>
                      <td>{s.metrics.downloadMbps.status === 'measured' ? fmtNum(s.metrics.downloadMbps.value) : '—'}</td>
                      <td>{s.metrics.uploadMbps.status === 'measured' ? fmtNum(s.metrics.uploadMbps.value) : '—'}</td>
                      <td>{s.metrics.unloadedLatencyMs.status === 'measured' ? fmtNum(s.metrics.unloadedLatencyMs.value, 0) : '—'}</td>
                      <td>{s.metrics.unloadedJitterMs.status === 'measured' ? fmtNum(s.metrics.unloadedJitterMs.value, 0) : '—'}</td>
                      <td>{s.durationMs !== null ? fmtNum(s.durationMs / 1000, 1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={() => { void import('../export/exportFormats').then(({ exportSessionsBackup, download }) => download('speedtest-backup.json', exportSessionsBackup(sessions), 'application/json')); }}>{t('action.exportBackup')}</button>
            <label className="row">
              {t('action.importBackup')}
              <input type="file" accept="application/json" onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then(async (txt) => {
                  const { parseBackup } = await import('../export/exportFormats');
                  const { isValidSession } = await import('../storage/indexedDb');
                  const parsed = parseBackup(txt);
                  if (!parsed) { alert('Ficheiro inválido'); return; }
                  const items = parsed as import('../engine/engineTypes').SpeedTestSession[];
                  let n = 0;
                  for (const it of items) if (isValidSession(it)) { await historyRepository.save(it); n++; }
                  alert(t('history.imported', { count: n, rejected: 0 }));
                  reload();
                });
              }} />
            </label>
            {!confirmClear ? (
              <button onClick={() => setConfirmClear(true)}>{t('action.clearHistory')}</button>
            ) : (
              <span className="row">
                <strong>{t('history.confirmClear')}</strong>
                <button onClick={async () => { await historyRepository.clear(); setConfirmClear(false); reload(); }}>{'Sim, apagar'}</button>
                <button onClick={() => setConfirmClear(false)}>{'Não'}</button>
              </span>
            )}
          </div>
        </>
      )}
      {detail && (
        <div className="card" role="region" aria-label={t('section.report')}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{t('section.report')} — {fmtDate(detail.startedAt)} ({fmtBytes(detail.transferBytes)})</h3>
            <button onClick={() => setDetail(null)}>{'Fechar'}</button>
          </div>
          <SessionReport session={detail} unitMb={false} />
        </div>
      )}
    </section>
  );
}
