/**
 * Diagnóstico contextual: hipóteses baseadas em observações, sem declarar
 * causalidade certa. Separa claramente "observado" de "possível causa".
 */
import type { SpeedTestSession } from '../engine/engineTypes';
import { computeStats } from './deriveMetrics';

export type DiagnosisItem = {
  /** Observação direta dos dados medidos. */
  observationKey: string;
  params?: Record<string, string | number>;
  /** Hipóteses — nunca apresentadas como certezas. */
  hypothesisKeys: string[];
  severity: 'info' | 'warning';
};

const BUFFERBLOAT_DELTA_MS = 100;
const HIGH_VARIABILITY_CV = 0.5;

export function diagnoseConnection(session: SpeedTestSession): DiagnosisItem[] {
  const items: DiagnosisItem[] = [];

  const dlDelta = session.derived.downloadLoadedLatencyDeltaMs.status === 'measured'
    ? session.derived.downloadLoadedLatencyDeltaMs.value
    : null;
  const ulDelta = session.derived.uploadLoadedLatencyDeltaMs.status === 'measured'
    ? session.derived.uploadLoadedLatencyDeltaMs.value
    : null;

  if (dlDelta !== null && dlDelta > BUFFERBLOAT_DELTA_MS) {
    items.push({
      observationKey: 'diag.obs.loadedLatencyDown',
      params: { delta: Math.round(dlDelta) },
      hypothesisKeys: ['diag.hyp.bufferbloat', 'diag.hyp.wifiOrCongestion'],
      severity: 'warning',
    });
  }
  if (ulDelta !== null && ulDelta > BUFFERBLOAT_DELTA_MS) {
    items.push({
      observationKey: 'diag.obs.loadedLatencyUp',
      params: { delta: Math.round(ulDelta) },
      hypothesisKeys: ['diag.hyp.bufferbloat', 'diag.hyp.qos'],
      severity: 'warning',
    });
  }

  const dlStats = computeStats(session.samples.downloadMbps);
  if (dlStats.cv !== null && dlStats.cv > HIGH_VARIABILITY_CV && dlStats.count >= 4) {
    items.push({
      observationKey: 'diag.obs.downloadVariability',
      params: { cv: Math.round(dlStats.cv * 100) },
      hypothesisKeys: ['diag.hyp.wifiInstability', 'diag.hyp.concurrentTraffic'],
      severity: 'warning',
    });
  }

  const latStats = computeStats(session.samples.unloadedLatencyMs);
  if (latStats.outliers.length > 0 && latStats.count >= 6) {
    items.push({
      observationKey: 'diag.obs.latencyOutliers',
      params: { count: latStats.outliers.length, total: latStats.count },
      hypothesisKeys: ['diag.hyp.interferenceOrQueuing'],
      severity: 'info',
    });
  }

  if (session.environment.connectionType === 'cellular') {
    items.push({
      observationKey: 'diag.obs.cellular',
      hypothesisKeys: ['diag.hyp.cellularVariability'],
      severity: 'info',
    });
  }

  if (session.environment.pageHiddenDuringTest) {
    items.push({
      observationKey: 'diag.obs.pageHidden',
      hypothesisKeys: ['diag.hyp.throttling'],
      severity: 'warning',
    });
  }

  if (items.length === 0) {
    items.push({
      observationKey: 'diag.obs.noIssues',
      hypothesisKeys: ['diag.hyp.generalCaveats'],
      severity: 'info',
    });
  }

  // Nota geral sobre fontes de variação (nunca causalidade certa).
  items.push({
    observationKey: 'diag.obs.contextNote',
    hypothesisKeys: ['diag.hyp.vpnProxyWifi'],
    severity: 'info',
  });

  return items;
}
