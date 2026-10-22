import 'fake-indexeddb/auto';

// crypto.randomUUID (Node em jsdom) — garantir disponibilidade.
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error polyfill mínimo apenas para testes
  globalThis.crypto = {};
}
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  let counter = 0;
  // @ts-expect-error injeção determinística para testes
  globalThis.crypto.randomUUID = () => `test-uuid-${++counter}`;
}

// BroadcastChannel não existe no jsdom — stub local (mensagens vão para o próprio canal).
if (typeof globalThis.BroadcastChannel === 'undefined') {
  class FakeBroadcastChannel {
    name: string;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    constructor(name: string) { this.name = name; }
    postMessage(data: unknown) {
      setTimeout(() => this.onmessage?.({ data }), 0);
    }
    close() { this.onmessage = null; }
  }
  // @ts-expect-error stub para ambiente de teste
  globalThis.BroadcastChannel = FakeBroadcastChannel;
}
