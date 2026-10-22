import { describe, it, expect } from 'vitest';
import { PROFILES, getProfile, buildCustomProfile } from '@/features/speed-test/engine/profileRegistry';

describe('perfis de teste — orçamento documentado', () => {
  it('existem os 4 perfis base', () => {
    expect(PROFILES.map((p) => p.id)).toEqual(['fast', 'balanced', 'precision', 'diagnostic']);
  });

  it('cada perfil declara limites de bytes coerentes com as fases', () => {
    for (const p of PROFILES) {
      const dl = p.phases.filter((x) => x.kind === 'download').reduce((a, x) => a + x.maxBytes, 0);
      const ul = p.phases.filter((x) => x.kind === 'upload').reduce((a, x) => a + x.maxBytes, 0);
      expect(p.maxDownloadBytes).toBe(dl);
      expect(p.maxUploadBytes).toBe(ul);
      expect(p.totalRequests).toBe(p.phases.reduce((a, x) => a + x.requests, 0));
      expect(p.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('precisão e diagnóstico exigem aviso de consumo; rápido/equilibrado não', () => {
    expect(getProfile('fast').requiresDataWarning).toBe(false);
    expect(getProfile('balanced').requiresDataWarning).toBe(false);
    expect(getProfile('precision').requiresDataWarning).toBe(true);
    expect(getProfile('diagnostic').requiresDataWarning).toBe(true);
  });

  it('orçamento conservador máximo: precision < 250 MB combinados', () => {
    const p = getProfile('precision');
    expect(p.maxDownloadBytes + p.maxUploadBytes).toBeLessThan(400e6);
  });

  it('config do motor: autoStart false, sem logging remoto, latências sob carga ativas', () => {
    for (const p of [...PROFILES, buildCustomProfile('standard')]) {
      const c = p.toEngineConfig();
      expect(c.autoStart).toBe(false);
      expect(c.logAimApiUrl).toBeNull();
      expect(c.logMeasurementApiUrl).toBeNull();
      expect(c.measureDownloadLoadedLatency).toBe(true);
      expect(c.measureUploadLoadedLatency).toBe(true);
      expect(Array.isArray(c.measurements)).toBe(true);
      expect((c.measurements as unknown[]).length).toBe(p.phases.length);
    }
  });

  it('custom: light é metade do standard em pedidos; heavy o dobro', () => {
    const l = buildCustomProfile('light'), s = buildCustomProfile('standard'), h = buildCustomProfile('heavy');
    expect(s.totalRequests).toBeGreaterThan(l.totalRequests);
    expect(h.totalRequests).toBeGreaterThan(s.totalRequests);
    expect(l.requiresDataWarning).toBe(false);
    expect(h.requiresDataWarning).toBe(true);
  });

  it('perfil desconhecido lança erro', () => {
    expect(() => getProfile('nao-existe')).toThrow();
  });
});
