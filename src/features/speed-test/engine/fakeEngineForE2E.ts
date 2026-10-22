/**
 * Motor FALSO para testes E2E locais (Playwright) — NUNCA usado em produção.
 * Ativa-se apenas quando a página é aberta com ?e2eFakeEngine=1, que define
 * window.__SPEEDTEST_E2E_FAKE__ antes do arranque da aplicação.
 * Produz uma sessão determinística através do MESMO pipeline de normalização
 * (normalizeResults) do motor real, exercitando UI, domínio e IndexedDB sem
 * tocar na rede. Não é mock fora de testes automatizados (restrição do doc).
 */
import type { Results } from '@cloudflare/speedtest';
import type { SpeedTestAdapter, AdapterEvents } from './SpeedTestAdapter';
import type { TestProfile } from './profileRegistry';
import { normalizeResults } from '../domain/normalizeResults';
import { collectEnvironment } from '../domain/environmentInfo';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeResults(): Results {
  const dlPoints = [85_000_000, 92_000_000, 88_000_000, 90_000_000]; // bps por amostra
  const ulPoints = [40_000_000, 42_000_000, 38_000_000];
  const latPoints = [11, 12, 10, 13, 11, 12];
  const def: Record<string, () => unknown> = {
    getDownloadBandwidth: () => 88_750_000,
    getUploadBandwidth: () => 40_000_000,
    getUnloadedLatency: () => 11.8,
    getUnloadedJitter: () => undefined,
    getUnloadedLatencyPoints: () => latPoints,
    getDownLoadedLatency: () => 34.2,
    getDownLoadedJitter: () => 6.1,
    getDownLoadedLatencyPoints: () => [30, 35, 33, 38],
    getUpLoadedLatency: () => 58.4,
    getUpLoadedJitter: () => 9.7,
    getUpLoadedLatencyPoints: () => [55, 60, 62],
    getDownloadBandwidthPoints: () => dlPoints.map((value, i) => ({ value, bytes: 1_000_000, transferSize: 1_000_000 + i, timeSinceFirstMeasurement: i * 1000 })),
    getUploadBandwidthPoints: () => ulPoints.map((value, i) => ({ value, bytes: 500_000, transferSize: 500_000 + i, timeSinceFirstMeasurement: i * 1000 })),
    getPacketLoss: () => undefined,
    getPacketLossDetails: () => undefined,
    getTotalDurationMs: () => 12_000,
    getScores: () => ({ download: 'fast', upload: 'fast', latency: 'good' }),
    getSummary: () => ({}),
  };
  return def as unknown as Results;
}

export class FakeE2EAdapter implements SpeedTestAdapter {
  readonly engineName = 'fake-e2e-engine';
  readonly engineVersion = '0.0.0-test';
  private events: AdapterEvents;
  private profile: TestProfile;
  private startedAt: Date | null = null;
  private cancelled = false;
  private disposed = false;

  constructor(opts: { profile: TestProfile; events: AdapterEvents }) {
    this.profile = opts.profile;
    this.events = opts.events;
  }

  start(): void {
    this.startedAt = new Date();
    void this.run();
  }

  private async run(): Promise<void> {
    const phases = this.profile.phases.map((p) => p.type);
    const uniq = [...new Set(phases)];
    for (let i = 0; i < uniq.length && !this.cancelled && !this.disposed; i++) {
      const t = uniq[i];
      const phase = t === 'latency' ? 'measuring_latency' : t === 'download' ? 'measuring_download' : 'measuring_upload';
      this.events.onPhaseChange?.(phase, i, uniq.length);
      this.events.onProgress?.({
        downloadMbps: t === 'upload' ? 88.75 : t === 'download' ? 60 + i * 10 : null,
        uploadMbps: t === 'upload' ? 40 : null,
        unloadedLatencyMs: t === 'latency' ? 11.8 : 11.8,
        downloadLoadedLatencyMs: t === 'download' ? 34.2 : null,
        uploadLoadedLatencyMs: t === 'upload' ? 58.4 : null,
        transferBytesDownload: t !== 'upload' ? (i + 1) * 2_000_000 : null,
        transferBytesUpload: t === 'upload' ? 1_500_000 : null,
        phaseProgress: { done: i + 1, total: uniq.length },
        elapsedMs: (i + 1) * 3000,
        etaMs: (uniq.length - i - 1) * 3000,
      });
      await sleep(400);
    }
    if (this.cancelled || this.disposed) return;
    const session = normalizeResults({
      results: fakeResults(),
      profileId: this.profile.id,
      profileVersion: this.profile.version,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      startedAt: this.startedAt ?? new Date(),
      finishedAt: new Date(),
      status: 'completed',
      pageHiddenDuringTest: false,
      environment: collectEnvironment(),
    });
    // sobrescreve id para permitir repetição determinística em testes
    this.events.onFinish?.({ ...session, id: `e2e-${Date.now()}` });
  }

  pause(): boolean { return true; }
  resume(): boolean { return true; }
  cancel(): void {
    this.cancelled = true;
    const session = normalizeResults({
      results: fakeResults(),
      profileId: this.profile.id,
      profileVersion: this.profile.version,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      startedAt: this.startedAt ?? new Date(),
      finishedAt: new Date(),
      status: 'cancelled',
      pageHiddenDuringTest: false,
      environment: collectEnvironment(),
    });
    this.events.onPartial?.(session);
  }
  dispose(): void { this.disposed = true; }
}
