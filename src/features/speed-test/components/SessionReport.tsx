'use client';
import type { SpeedTestSession } from '../engine/engineTypes';
import { mbpsToMBs } from '../domain/normalizeResults';
import { MetricCard } from './MetricCard';
import { TimeSeriesChart, LoadedVsIdleChart, SampleStatsTable } from './Charts';
import { ExperienceScores } from './ExperienceScores';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ShareReport } from './ShareReport';
import { useI18n } from '../i18n/useI18n';

export function SessionReport({ session, unitMb }: { session: SpeedTestSession; unitMb: boolean }) {
  const { t, fmtNum, fmtDate } = useI18n();
  const m = (v: number | null) => (v === null ? null : v);
  const speedOverride = unitMb ? { convert: mbpsToMBs, unit: 'MB/s' } : undefined;
  const idle = session.metrics.unloadedLatencyMs.status === 'measured' ? session.metrics.unloadedLatencyMs.value : null;
  const dlLoaded = session.metrics.downloadLoadedLatencyMs.status === 'measured' ? session.metrics.downloadLoadedLatencyMs.value : null;
  const ulLoaded = session.metrics.uploadLoadedLatencyMs.status === 'measured' ? session.metrics.uploadLoadedLatencyMs.value : null;

  return (
    <div>
      <p className="muted" role="status">
        {fmtDate(session.startedAt)} · {'·'} · {t(`profile.${session.engine.profileId}.name`)} · {`${t('share.engine')}: ${session.engine.name} ${session.engine.version}`}
      </p>
      <section aria-labelledby="metrics-title">
        <h2 id="metrics-title">{t('section.report')}</h2>
        <div className="grid">
          <MetricCard titleKey="metric.download" metric={session.metrics.downloadMbps} unitOverride={speedOverride} />
          <MetricCard titleKey="metric.upload" metric={session.metrics.uploadMbps} unitOverride={speedOverride} />
          <MetricCard titleKey="metric.latency" metric={session.metrics.unloadedLatencyMs} digits={0} />
          <MetricCard titleKey="metric.jitter" metric={session.metrics.unloadedJitterMs} digits={0} />
          <MetricCard titleKey='metric.loadedLatencyDown' metric={session.metrics.downloadLoadedLatencyMs} digits={0} />
          <MetricCard titleKey="metric.loadedDownloadJitter" metric={session.metrics.downloadLoadedJitterMs} digits={0} />
          <MetricCard titleKey="metric.loadedUploadLatency" metric={session.metrics.uploadLoadedLatencyMs} digits={0} />
          <MetricCard titleKey="metric.loadedUploadJitter" metric={session.metrics.uploadLoadedJitterMs} digits={0} />
          <MetricCard titleKey="metric.latencyDeltaDownload" metric={session.derived.downloadLoadedLatencyDeltaMs} digits={0} />
          <MetricCard titleKey="metric.latencyDeltaUpload" metric={session.derived.uploadLoadedLatencyDeltaMs} digits={0} />
          <MetricCard titleKey="metric.packetLoss" metric={session.metrics.packetLossRatio} />
        </div>
      </section>

      <ExperienceScores session={session} />

      <section aria-labelledby="charts-title">
        <h2 id="charts-title">{t('chart.trendTitle')}</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <TimeSeriesChart
            titleKey="chart.latencyTitle"
            unit="ms"
            series={[
              { labelKey: 'metric.latency', points: session.samples.unloadedLatencyMs, color: 'accent' },
              { labelKey: 'metric.loadedLatencyDown', points: session.samples.downloadLoadedLatencyMs, color: 'warn' },
              { labelKey: 'metric.loadedLatencyUp', points: session.samples.uploadLoadedLatencyMs, color: 'ok' },
            ]}
          />
          <TimeSeriesChart
            titleKey="chart.bandwidthTitle"
            unit={unitMb ? 'MB/s' : 'Mbps'}
            series={[
              { labelKey: 'metric.download', points: unitMb ? session.samples.downloadMbps.map((p) => ({ ...p, value: mbpsToMBs(p.value) })) : session.samples.downloadMbps, color: 'accent' },
              { labelKey: 'metric.upload', points: unitMb ? session.samples.uploadMbps.map((p) => ({ ...p, value: mbpsToMBs(p.value) })) : session.samples.uploadMbps, color: 'ok' },
            ]}
          />
          <LoadedVsIdleChart rows={[{ groupKey: 'chart.latencyGroup', idleMs: m(idle), loadedDlMs: m(dlLoaded), loadedUlMs: m(ulLoaded) }]} />
        </div>
      </section>

      <details className="card" open={false}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('view.technical')}</summary>
        <SampleStatsTable
          samplesByKind={{
            latency: session.samples.unloadedLatencyMs,
            loadedDownloadLatency: session.samples.downloadLoadedLatencyMs,
            loadedUploadLatency: session.samples.uploadLoadedLatencyMs,
            download: session.samples.downloadMbps,
            upload: session.samples.uploadMbps,
          }}
        />
        <div className="card">
          <h3>{t('section.raw')}</h3>
          <table>
            <tbody>
              {Object.entries(session.sampleCounts).map(([k, c]) => (
                <tr key={k}><th scope="row">{k}</th><td>{c.valid}</td><td>{c.discarded}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted">{t('stats.samples', { valid: '' })}</p>
        </div>
        {Object.keys(session.scores).length > 0 && (
          <div className="card">
            <h3>{t('usecase.limitation.engine')}</h3>
            <ul className="muted" style={{ paddingLeft: 18 }}>
              {Object.entries(session.scores).map(([k, v]) => (
                <li key={k}>{k}: {v === null ? '—' : typeof v === 'object' ? `${v.classificationName} (${v.points} pts)` : String(v)}</li>
              ))}
            </ul>
          </div>
        )}
      </details>

      <DiagnosticsPanel session={session} />
      <ShareReport session={session} />
    </div>
  );
}
