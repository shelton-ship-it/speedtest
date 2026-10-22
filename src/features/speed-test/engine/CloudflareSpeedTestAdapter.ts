/**
 * Adaptador Cloudflare — única camada que conhece a API do motor
 * @cloudflare/speedtest v1.14.2. A UI depende apenas de SpeedTestAdapter.
 *
 * Capacidades efetivamente verificadas na versão fixada (docs/engine-api-1.14.2.d.ts):
 * - Classe default: SpeedTestEngine (extends MeasurementEngine)
 * - autoStart, measurements, measureDownload/UploadLoadedLatency, logAimApiUrl
 * - pause(), play(), restart()  → pausa/retoma são suportadas
 * - Não existe API pública de "cancelar"; cancel = pausar + descartar ao reiniciar.
 * - Results: getters listados no documento de implementação, todos presentes.
 */
import SpeedTestModule from '@cloudflare/speedtest';
import type { Results } from '@cloudflare/speedtest';
import type { AdapterEvents, SpeedTestAdapter } from './SpeedTestAdapter';
import type { LiveMetrics, LivePhase } from './engineTypes';
import type { TestProfile } from './profileRegistry';
import { normalizeResults } from '../domain/normalizeResults';
import { collectEnvironment } from '../domain/environmentInfo';

export const ENGINE_NAME = '@cloudflare/speedtest';
export const ENGINE_VERSION = '1.14.2';

const PHASE_BY_TYPE: Record<string, LivePhase> = {
  latency: 'measuring_latency',
  download: 'measuring_download',
  upload: 'measuring_upload',
  packetLoss: 'measuring_packet_loss',
};

export type CloudflareAdapterOptions = {
  profile: TestProfile;
  events: AdapterEvents;
  /** Endpoint base para testes locais/integração com outro destino. Exposto só por config, não à UI comum. */
  downloadApiUrl?: string;
  uploadApiUrl?: string;
};

export class CloudflareSpeedTestAdapter implements SpeedTestAdapter {
  readonly engineName = ENGINE_NAME;
  readonly engineVersion = ENGINE_VERSION;

  private engine: InstanceType<typeof SpeedTestModule> | null = null;
  private opts: CloudflareAdapterOptions;
  private startedAt: Date | null = null;
  private cancelled = false;
  private finished = false;
  private uiTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private tickId: ReturnType<typeof setInterval> | null = null;
  private pageHiddenDuringTest = false;
  private visibilityHandler: (() => void) | null = null;
  private disposed = false;

  constructor(opts: CloudflareAdapterOptions) {
    this.opts = opts;
  }

  start(): void {
    if (this.engine || this.disposed) return; // uma sessão ativa por instância; bloquear duplicado
    const { profile, events } = this.opts;

    this.startedAt = new Date();
    this.cancelled = false;
    this.finished = false;
    this.pageHiddenDuringTest = false;

    const config = profile.toEngineConfig();
    if (this.opts.downloadApiUrl) config.downloadApiUrl = this.opts.downloadApiUrl;
    if (this.opts.uploadApiUrl) config.uploadApiUrl = this.opts.uploadApiUrl;

    this.engine = new SpeedTestModule(config);

    this.engine.onPhaseChange = (payload) => {
      if (!this.engine) return;
      this.currentPhaseIndex = payload.measurementId;
      const phase = PHASE_BY_TYPE[payload.measurement.type] ?? 'measuring_latency';
      events.onPhaseChange?.(phase, payload.measurementId, profile.phases.length);
      this.emitProgress();
    };

    this.engine.onResultsChange = () => {
      this.emitProgress();
    };

    this.engine.onFinish = (results: Results) => {
      if (this.cancelled || this.disposed) return;
      this.finished = true;
      this.clearTimers();
      const session = this.buildSession(results, 'completed');
      events.onFinish?.(session);
    };

    // onError é um setter encadeado no SpeedTestEngine: definir depois do onFinish
    // preserva o registo interno de logging e substitui apenas onde necessário.
    this.engine.onError = (message: string, status?: number) => {
      if (this.cancelled || this.disposed) return;
      this.clearTimers();
      events.onError?.(message, status);
      // Preservar resultados parciais se forem úteis e válidos.
      const results = this.engine?.results;
      if (results && hasUsefulData(results)) {
        events.onPartial?.(this.buildSession(results, 'partial'));
      }
    };

    // Timeout da interface: se o motor não terminar dentro do limite do perfil.
    this.uiTimeoutId = setTimeout(() => {
      if (!this.finished && !this.cancelled && !this.disposed) {
        this.pauseInternal();
        const results = this.engine?.results;
        this.clearTimers();
        events.onError?.('timeout');
        if (results && hasUsefulData(results)) {
          events.onPartial?.(this.buildSession(results, 'partial'));
        }
      }
    }, profile.uiTimeoutMs);

    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'hidden') this.pageHiddenDuringTest = true;
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // Atualização periódica do elapsed/ETA mesmo sem eventos do motor.
    this.tickId = setInterval(() => this.emitProgress(), 500);

    this.engine.play();
    events.onPhaseChange?.('measuring_latency', 0, profile.phases.length);
  }

  pause(): boolean {
    if (!this.engine || this.finished || this.cancelled) return false;
    this.engine.pause();
    return true;
  }

  resume(): boolean {
    if (!this.engine || this.finished || this.cancelled) return false;
    this.engine.play();
    return true;
  }

  cancel(): void {
    if (!this.engine || this.finished) return;
    this.pauseInternal();
    this.cancelled = true;
    this.clearTimers();
    // Resultados parciais com estado explícito 'cancelled' — nunca apresentados como completos.
    this.opts.events.onPartial?.(this.buildSession(this.engine.results, 'cancelled'));
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    // Remover handlers e libertar recursos.
    if (this.engine) {
      try {
        this.engine.pause();
      } catch {
        /* estado pode já não permitir pausa */
      }
      this.engine.onPhaseChange = undefined as unknown as typeof this.engine.onPhaseChange;
      this.engine = null;
    }
  }

  private pauseInternal(): void {
    try {
      this.engine?.pause();
    } catch {
      /* ignorar */
    }
  }

  private clearTimers(): void {
    if (this.uiTimeoutId !== null) clearTimeout(this.uiTimeoutId);
    if (this.tickId !== null) clearInterval(this.tickId);
    this.uiTimeoutId = null;
    this.tickId = null;
  }

  private emitProgress(): void {
    if (!this.engine || !this.startedAt) return;
    const r = this.engine.results;
    const dlPoints = r.getDownloadBandwidthPoints();
    const ulPoints = r.getUploadBandwidthPoints();
    const now = Date.now();
    const elapsedMs = now - this.startedAt.getTime();

    const bytesOf = (points: { transferSize: number; bytes: number }[]) =>
      points.reduce((acc, p) => acc + (p.transferSize > 0 ? p.transferSize : p.bytes), 0);

    let etaMs: number | null = null;
    if (elapsedMs > 3000) {
      const done = this.currentPhaseIndex ?? 0;
      const total = this.opts.profile.phases.length;
      if (done < total) etaMs = Math.round((elapsedMs / Math.max(done, 1)) * (total - done));
    }

    const live: LiveMetrics = {
      downloadMbps: round(r.getDownloadBandwidth() !== undefined ? r.getDownloadBandwidth()! / 1e6 : null, 2),
      uploadMbps: round(r.getUploadBandwidth() !== undefined ? r.getUploadBandwidth()! / 1e6 : null, 2),
      unloadedLatencyMs: round(r.getUnloadedLatency() ?? null, 1),
      downloadLoadedLatencyMs: round(r.getDownLoadedLatency() ?? null, 1),
      uploadLoadedLatencyMs: round(r.getUpLoadedLatency() ?? null, 1),
      transferBytesDownload: dlPoints.length ? bytesOf(dlPoints) : null,
      transferBytesUpload: ulPoints.length ? bytesOf(ulPoints) : null,
      phaseProgress: this.currentPhaseIndex !== null ? { done: this.currentPhaseIndex, total: this.opts.profile.phases.length } : null,
      elapsedMs,
      etaMs,
    };
    this.opts.events.onProgress?.(live);
  }

  private currentPhaseIndex: number | null = null;

  private buildSession(results: Results, status: 'completed' | 'partial' | 'cancelled'): ReturnType<typeof normalizeResults> {
    const env = collectEnvironment();
    return normalizeResults({
      results,
      profileId: this.opts.profile.id,
      profileVersion: this.opts.profile.version,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      startedAt: this.startedAt ?? new Date(),
      finishedAt: new Date(),
      status,
      pageHiddenDuringTest: this.pageHiddenDuringTest,
      environment: env,
    });
  }
}

// onPhaseChange guarda o índice atual da fase.
// (patch via wrapper de evento feito no próprio start())
function round(v: number | null, digits: number): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function hasUsefulData(results: Results): boolean {
  return (
    results.getDownloadBandwidthPoints().length > 0 ||
    results.getUploadBandwidthPoints().length > 0 ||
    results.getUnloadedLatencyPoints().length > 0
  );
}
