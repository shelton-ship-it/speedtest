/**
 * Interface de adaptador de motor — permite substituir/complementar o
 * fornecedor de medição sem reescrever a interface (regra arquitetural 2).
 */
import type { LiveMetrics, LivePhase, SpeedTestSession } from './engineTypes';

export type AdapterEvents = {
  onPhaseChange?: (phase: LivePhase, measurementIndex: number, totalMeasurements: number) => void;
  onProgress?: (live: LiveMetrics) => void;
  onFinish?: (session: SpeedTestSession) => void;
  /** onFinish com dados parciais quando cancelado/falhou mas há métricas válidas. */
  onPartial?: (session: SpeedTestSession) => void;
  onError?: (message: string, status?: number) => void;
};

export interface SpeedTestAdapter {
  readonly engineName: string;
  readonly engineVersion: string;
  /** Inicia a medição. Nunca é chamada automaticamente na construção do componente. */
  start(): void;
  /** Pausa se suportado; retorna false caso contrário. */
  pause(): boolean;
  /** Retoma se suportado; retorna false caso contrário. */
  resume(): boolean;
  /** Interrompe o que for possível. Resultados não devem ser apresentados como completos. */
  cancel(): void;
  /** Remove handlers e liberta recursos (chamado no unmount). */
  dispose(): void;
}
