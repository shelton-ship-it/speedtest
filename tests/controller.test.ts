import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/features/speed-test/engine/CloudflareSpeedTestAdapter', () => {
  class MockAdapter {
    engineName = '@cloudflare/speedtest';
    engineVersion = '1.14.2';
    static lastEvents: Record<string, (arg?: unknown) => void> | null = null;
    started = false; paused = false; cancelled = false; disposed = false;
    opts: { events: Record<string, (arg?: unknown) => void> };
    constructor(opts: { events: Record<string, (arg?: unknown) => void> }) {
      this.opts = opts;
      MockAdapter.lastEvents = opts.events;
    }
    start() { this.started = true; }
    pause() { if (!this.started || this.cancelled) return false; this.paused = true; return true; }
    resume() { this.paused = false; return true; }
    cancel() {
      this.cancelled = true;
      const partial = makeSession('cancelled');
      this.opts.events.onPartial?.(partial);
    }
    dispose() { this.disposed = true; }
  }
  (globalThis as unknown as { MockAdapter: typeof MockAdapter }).MockAdapter = MockAdapter;
  return { CloudflareSpeedTestAdapter: MockAdapter };
});

import type { SpeedTestSession } from '@/features/speed-test/engine/engineTypes';

function makeSession(status: SpeedTestSession['status']): SpeedTestSession {
  return {
    id: `sess-${status}`, schemaVersion: 1, productVersion: '0', engine: { name: 'e', version: '1', profileId: 'balanced', profileVersion: 1 },
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 1000, status,
    metrics: Object.fromEntries(['downloadMbps','uploadMbps','unloadedLatencyMs','unloadedJitterMs','downloadLoadedLatencyMs','downloadLoadedJitterMs','uploadLoadedLatencyMs','uploadLoadedJitterMs','packetLossRatio'].map(k => [k, { value: null, unit: 'x', source: 'engine', status: 'unavailable' }])) as SpeedTestSession['metrics'],
    derived: { downloadLoadedLatencyDeltaMs: { value: null, unit: 'ms', source: 'derived', status: 'unavailable' }, uploadLoadedLatencyDeltaMs: { value: null, unit: 'ms', source: 'derived', status: 'unavailable' } },
    scores: {}, sampleCounts: {}, transferBytes: null,
    samples: { unloadedLatencyMs: [], downloadLoadedLatencyMs: [], uploadLoadedLatencyMs: [], downloadMbps: [], uploadMbps: [] },
    environment: { browser: null, os: null, connectionType: null, pageHiddenDuringTest: false }, diagnostics: [],
  };
}

async function flushDynamicImport() {
  // deixar o import dinâmico do controlador resolver
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
}

describe('TestController — máquina de estados', () => {
  let mod: typeof import('@/features/speed-test/state/testController');
  beforeEach(async () => {
    vi.resetModules();
    mod = await import('@/features/speed-test/state/testController');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('não inicia sem ação explícita e bloqueia início duplicado', async () => {
    const c = new mod.TestController();
    expect(c.getSnapshot().state).toBe('idle');
    expect(c.isBusy()).toBe(false);
    c.start();
    await flushDynamicImport();
    expect(c.getSnapshot().state).toBe('running');
    const before = c.getSnapshot();
    c.start(); c.start(); // cliques repetidos ignorados
    await flushDynamicImport();
    expect(c.getSnapshot().state).toBe(before.state);
    c.dispose();
  });

  it('pausa e retoma quando o motor suporta', async () => {
    const c = new mod.TestController();
    c.start();
    await flushDynamicImport();
    c.pause();
    expect(c.getSnapshot().state).toBe('paused');
    c.resume();
    expect(c.getSnapshot().state).toBe('running');
    c.dispose();
  });

  it('cancelar produz estado cancelled com sessão parcial explícita', async () => {
    const c = new mod.TestController();
    c.start();
    await flushDynamicImport();
    c.cancel();
    expect(c.getSnapshot().state).toBe('cancelled');
    expect(c.getSnapshot().session?.status).toBe('cancelled');
    c.dispose();
  });

  it('erro não converte métricas ausentes em zero nem apaga mensagem', async () => {
    const c = new mod.TestController();
    c.start();
    await flushDynamicImport();
    const MockAdapter = (globalThis as unknown as { MockAdapter: { lastEvents: Record<string, (a?: unknown) => void> | null } }).MockAdapter;
    MockAdapter.lastEvents!.onError!('Failed to fetch');
    expect(c.getSnapshot().state).toBe('failed');
    expect(c.getSnapshot().errorKey).toBe('error.network');
    c.dispose();
  });

  it('onFinish leva a processing → completed e grava histórico', async () => {
    const c = new mod.TestController();
    c.start();
    await flushDynamicImport();
    const MockAdapter = (globalThis as unknown as { MockAdapter: { lastEvents: Record<string, (a?: unknown) => void> | null } }).MockAdapter;
    MockAdapter.lastEvents!.onFinish!(makeSession('completed'));
    expect(c.getSnapshot().state).toBe('processing');
    await new Promise((r) => setTimeout(r, 10));
    expect(c.getSnapshot().state).toBe('completed');
    const { historyRepository } = await import('@/features/speed-test/storage/indexedDb');
    const list = await historyRepository.list();
    expect(list.map((s) => s.id)).toContain('sess-completed');
    await historyRepository.clear();
    c.dispose();
  });

  it('selectProfile é ignorado durante execução', async () => {
    const c = new mod.TestController();
    c.selectProfile('fast');
    expect(c.getSnapshot().profileId).toBe('fast');
    c.start();
    await flushDynamicImport();
    c.selectProfile('precision');
    expect(c.getSnapshot().profileId).toBe('fast');
    c.dispose();
  });
});
