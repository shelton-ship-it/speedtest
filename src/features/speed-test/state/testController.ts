/**
 * Máquina de estados explícita + controlador do teste.
 * Regras: uma sessão ativa por controlador; início duplicado bloqueado;
 * erro não converte métricas ausentes em zero; cancelamento preserva parciais.
 */
import type { SpeedTestAdapter, AdapterEvents } from '../engine/SpeedTestAdapter';
import type { LiveMetrics, LivePhase, SpeedTestSession } from '../engine/engineTypes';
import type { TestProfile } from '../engine/profileRegistry';
import { getProfile, buildCustomProfile, PROFILES } from '../engine/profileRegistry';
import { historyRepository } from '../storage/indexedDb';

export type TestState =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'running'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed';

const RUNNING_SUBPHASES: LivePhase[] = ['measuring_latency', 'measuring_download', 'measuring_upload', 'measuring_packet_loss'];

export type ControllerSnapshot = {
  state: TestState;
  /** Subfase real reportada pelo motor (para a UI não fingir sequências falsas). */
  livePhase: LivePhase;
  live: LiveMetrics | null;
  session: SpeedTestSession | null;
  errorKey: string | null;
  profileId: string;
  customLevel: 'light' | 'standard' | 'heavy';
  supportsPause: boolean;
};

type Listener = () => void;

/** Fábrica de adaptadores — permite injetar um motor falso em testes E2E locais. */
export type AdapterOptions = {
  profile: TestProfile;
  events: AdapterEvents;
};
export type AdapterFactory = (opts: AdapterOptions) => SpeedTestAdapter | Promise<SpeedTestAdapter>;

/** Motor de produção (Cloudflare). Pode ser substituído por injeção no construtor. */
const productionAdapterFactory: AdapterFactory = async (opts) => {
  const { CloudflareSpeedTestAdapter } = await import('../engine/CloudflareSpeedTestAdapter');
  return new CloudflareSpeedTestAdapter(opts);
};

export class TestController {
  private adapter: SpeedTestAdapter | null = null;
  private snapshot: ControllerSnapshot;
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private crossTabRunning = false;
  private adapterFactory: AdapterFactory;

  constructor(adapterFactory?: AdapterFactory) {
    this.adapterFactory = adapterFactory ?? productionAdapterFactory;
    this.snapshot = {
      state: 'idle',
      livePhase: 'idle',
      live: null,
      session: null,
      errorKey: null,
      profileId: 'balanced',
      customLevel: 'standard',
      supportsPause: true,
    };
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('speedtest-tab-coordination');
        this.channel.onmessage = (e) => {
          const msg = e.data as { type: string };
          if (msg?.type === 'test-started') {
            this.crossTabRunning = true;
          } else if (msg?.type === 'test-finished') {
            this.crossTabRunning = false;
          }
        };
      } catch {
        /* sinalização local é opcional — nunca depende dela para integridade */
      }
    }
  }

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<ControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  get currentProfile(): TestProfile {
    if (this.snapshot.profileId === 'custom') return buildCustomProfile(this.snapshot.customLevel);
    return getProfile(this.snapshot.profileId);
  }

  isBusy(): boolean {
    return ['running', 'paused', 'cancelling', 'processing'].includes(this.snapshot.state);
  }

  /** Sinalização entre separadores (informativa; não bloqueia por si só se indefinida). */
  get otherTabRunning(): boolean {
    return this.crossTabRunning && !this.isBusy();
  }

  selectProfile(id: string): void {
    if (this.isBusy()) return;
    this.set({ profileId: id });
  }

  selectCustomLevel(level: 'light' | 'standard' | 'heavy'): void {
    if (this.isBusy()) return;
    this.set({ customLevel: level, profileId: 'custom' });
  }

  /** Verificação de suporte antes de iniciar (sem iniciar medições intensivas). */
  canRun(): { ok: boolean; reasonKey?: string } {
    if (typeof fetch !== 'function') return { ok: false, reasonKey: 'error.unsupported' };
    if (!('ReadableStream' in globalThis)) return { ok: false, reasonKey: 'error.unsupported' };
    return { ok: true };
  }

  start(): void {
    // Prevenir cliques repetidos / testes concorrentes na mesma página.
    if (this.adapter || this.isBusy()) return;
    const check = this.canRun();
    if (!check.ok) {
      this.set({ state: 'failed', errorKey: check.reasonKey ?? 'error.unsupported' });
      return;
    }

    this.set({ state: 'checking', errorKey: null, session: null, live: null, livePhase: 'checking' });
    this.channel?.postMessage({ type: 'test-started' });

    const profile = this.currentProfile;
    // Fábrica de adaptadores: produção usa import dinâmico do motor Cloudflare
    // (mantém-no fora do caminho crítico de render inicial); testes E2E locais
    // injetam um motor falso determinístico via construtor.
    void Promise.resolve(this.adapterFactory({
      profile,
      events: {
        onPhaseChange: (phase) => {
          this.set({
            state: this.snapshot.state === 'paused' ? 'paused' : 'running',
            livePhase: phase,
          });
        },
        onProgress: (live) => {
          this.set({ live });
        },
        onFinish: (session) => {
          this.teardownAdapter();
          this.channel?.postMessage({ type: 'test-finished' });
          this.set({ state: 'processing', livePhase: 'processing_results' });
          void this.finalize(session, 'completed');
        },
        onPartial: (session) => {
          const wasCancelling = this.snapshot.state === 'cancelling';
          this.teardownAdapter();
          this.channel?.postMessage({ type: 'test-finished' });
          const st: TestState = wasCancelling ? 'cancelled' : this.snapshot.state === 'failed' ? 'failed' : 'partial';
          this.set({ state: st, livePhase: wasCancelling ? 'cancelled' : 'partial', session });
          if (session.status !== 'cancelled') void historyRepository.save(session).catch(() => undefined);
        },
        onError: (_message, _status) => {
          this.set({ state: 'failed', livePhase: 'failed', errorKey: mapErrorKey(_message) });
        },
      },
    }))
      .then((adapter) => {
        if (this.snapshot.state !== 'checking') { adapter.dispose(); return; } // estado mudou entretanto
        this.adapter = adapter;
        this.set({ state: 'ready', livePhase: 'ready' });
        // Início imediato após ação explícita do utilizador que chamou start().
        this.set({ state: 'running', livePhase: 'measuring_latency' });
        adapter.start();
      })
      .catch(() => {
        this.set({ state: 'failed', errorKey: 'error.generic' });
      });
  }

  pause(): void {
    if (this.snapshot.state !== 'running' || !this.adapter) return;
    if (this.adapter.pause()) this.set({ state: 'paused' });
  }

  resume(): void {
    if (this.snapshot.state !== 'paused' || !this.adapter) return;
    if (this.adapter.resume()) this.set({ state: 'running' });
  }

  cancel(): void {
    if (!this.adapter || !['running', 'paused'].includes(this.snapshot.state)) return;
    this.set({ state: 'cancelling', livePhase: 'cancelling' });
    this.adapter.cancel();
  }

  dispose(): void {
    this.teardownAdapter();
    this.channel?.close();
    this.channel = null;
  }

  private teardownAdapter(): void {
    if (this.adapter) {
      this.adapter.dispose();
      this.adapter = null;
    }
  }

  private async finalize(session: SpeedTestSession, state: TestState): Promise<void> {
    try {
      await historyRepository.save(session);
    } catch {
      /* histórico indisponível (ex.: IndexedDB bloqueado) — não invalida os resultados */
    }
    this.set({ state, livePhase: 'completed', session });
  }
}

function mapErrorKey(message: string): string {
  const m = String(message ?? '').toLowerCase();
  if (m === 'timeout') return 'error.timeout';
  if (m.includes('upload')) return 'error.uploadFailed';
  if (m.includes('download')) return 'error.downloadFailed';
  if (m.includes('cors') || m.includes('header')) return 'error.cors';
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to fetch')) return 'error.network';
  return 'error.generic';
}

export { PROFILES };
