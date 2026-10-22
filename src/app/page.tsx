import dynamic from 'next/dynamic';

// Toda a aplicação de teste é cliente: usa IndexedDB, BroadcastChannel e o motor no browser.
const SpeedTestApp = dynamic(() => import('../features/speed-test/components/TestDashboard').then((m) => m.SpeedTestApp), {
  loading: () => <p aria-busy="true">A carregar o Speed Test…</p>,
});

export default function Home() {
  return <SpeedTestApp />;
}
