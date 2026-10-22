/**
 * Exportação JSON/CSV e resumo textual. Todos os campos mantêm unidade e estado.
 */
import type { SpeedTestSession, MetricValue } from '../engine/engineTypes';

export function exportJson(session: SpeedTestSession): string {
  return JSON.stringify(session, null, 2);
}

export function exportSessionsBackup(sessions: SpeedTestSession[]): string {
  return JSON.stringify({ kind: 'speedtest-backup', schemaVersion: session_schemaVersionOf(sessions), exportedAt: new Date().toISOString(), sessions }, null, 2);
}

function session_schemaVersionOf(sessions: SpeedTestSession[]): number {
  return sessions[0]?.schemaVersion ?? 1;
}

export function parseBackup(json: string): unknown[] | null {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.sessions)) return data.sessions;
    return null;
  } catch {
    return null;
  }
}

function fmtMetric(m: MetricValue): string {
  if (m.status !== 'measured' || m.value === null) return `${m.status}`;
  return `${m.value}`;
}

export function exportCsv(session: SpeedTestSession): string {
  const lines: string[] = [];
  lines.push('section,key,value,unit,status,source');
  for (const [key, m] of Object.entries(session.metrics)) {
    lines.push(`metric,${key},${fmtMetric(m)},${m.unit},${m.status},${m.source}`);
  }
  for (const [key, m] of Object.entries(session.derived)) {
    lines.push(`derived,${key},${fmtMetric(m)},${m.unit},${m.status},${m.source}`);
  }
  for (const [key, s] of Object.entries(session.scores)) {
    if (s) lines.push(`score,${key},${s.points},points,measured,engine (${s.classificationName})`);
  }
  lines.push('meta,startedAt,' + session.startedAt + ',ISO,,product');
  lines.push('meta,finishedAt,' + (session.finishedAt ?? '') + ',ISO,,product');
  lines.push('meta,durationMs,' + (session.durationMs ?? '') + ',ms,,engine');
  lines.push('meta,transferBytes,' + (session.transferBytes ?? '') + ',bytes,derived,product');
  lines.push('meta,profile,' + session.engine.profileId + ',id,,product');
  lines.push('meta,engine,' + session.engine.name + '@' + session.engine.version + ',,,product');
  for (const [kind, points] of Object.entries(session.samples)) {
    for (const p of points) {
      lines.push(`sample,${kind},${p.value},${kind.endsWith('Mbps') ? 'Mbps' : 'ms'},measured,engine`);
    }
  }
  return lines.join('\n') + '\n';
}

export function summaryText(session: SpeedTestSession, t: (key: string) => string): string {
  const dl = session.metrics.downloadMbps;
  const ul = session.metrics.uploadMbps;
  const lat = session.metrics.unloadedLatencyMs;
  const jit = session.metrics.unloadedJitterMs;
  const dld = session.derived.downloadLoadedLatencyDeltaMs;
  const date = new Date(session.startedAt).toLocaleString();
  const parts: string[] = [
    t('share.title'),
    `${t('metric.download')}: ${dl.status === 'measured' ? `${dl.value} Mbps` : dl.status}`,
    `${t('metric.upload')}: ${ul.status === 'measured' ? `${ul.value} Mbps` : ul.status}`,
    `${t('metric.latency')}: ${lat.status === 'measured' ? `${lat.value} ms` : lat.status}`,
    `${t('metric.jitter')}: ${jit.status === 'measured' ? `${jit.value} ms` : jit.status}`,
    `${t('metric.loadedLatencyDelta')}: ${dld.status === 'measured' ? `${dld.value} ms` : dld.status}`,
    `${t('share.date')}: ${date}`,
    `${t('share.profile')}: ${session.engine.profileId} v${session.engine.profileVersion}`,
    `${t('share.engine')}: ${session.engine.name}@${session.engine.version}`,
    `${t('share.product')}: v${session.productVersion}`,
    t('share.disclaimer'),
  ];
  return parts.join('\n');
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
