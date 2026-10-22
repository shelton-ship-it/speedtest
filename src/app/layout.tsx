import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Speed Test — Qualidade da Internet',
  description:
    'Teste de velocidade com latência sob carga, diagnóstico de experiência, histórico local e relatórios. Motor de medição Cloudflare.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>
        <a className="skip-link" href="#main">
          Saltar para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
