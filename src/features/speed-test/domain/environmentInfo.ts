/**
 * Recolha de contexto do browser — apenas informação fiável e não invasiva.
 * Nunca inventar ISP, tipo de rede ou localização (secção 3.6).
 */

export type BrowserEnvironment = {
  browser: string | null;
  os: string | null;
  connectionType: string | null;
};

type NavigatorWithConnection = Navigator & {
  connection?: { effectiveType?: string };
};

export function collectEnvironment(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): BrowserEnvironment {
  if (!nav) return { browser: null, os: null, connectionType: null };

  const ua = nav.userAgent || '';
  const browser = detectBrowser(ua);
  const os = detectOS(ua, nav.platform ?? '');

  let connectionType: string | null = null;
  const conn = (nav as NavigatorWithConnection).connection;
  if (conn && typeof conn.effectiveType === 'string' && conn.effectiveType) {
    connectionType = conn.effectiveType; // '4g' | '3g' | '2g' | 'slow-2g' — só se o browser fornecer.
  }

  return { browser, os, connectionType };
}

export function detectBrowser(ua: string): string | null {
  if (!ua) return null;
  // Ordem importa: Edge/Chrome declaram-se também como Safari/Chrome.
  if (/Edg\/([\d.]+)/.test(ua)) return `Edge ${RegExp.$1}`;
  if (/OPR\/([\d.]+)|Opera\/([\d.]+)/.test(ua)) return `Opera ${RegExp.$1 || RegExp.$2}`;
  if (/Firefox\/([\d.]+)/.test(ua)) return `Firefox ${RegExp.$1}`;
  if (/Chrome\/([\d.]+)/.test(ua)) return `Chrome ${RegExp.$1}`;
  if (/Version\/([\d.]+).*Safari/.test(ua)) return `Safari ${RegExp.$1}`;
  return null;
}

export function detectOS(ua: string, platform: string): string | null {
  if (!ua && !platform) return null;
  if (/Windows NT 10/.test(ua)) return 'Windows';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android ([\d.]+)/.test(ua)) return `Android ${RegExp.$1}`;
  if (/(iPhone|iPad|iPod)/.test(ua)) return 'iOS';
  if (/Mac OS X ([\d_.]+)/.test(ua)) return `macOS ${RegExp.$1.replace(/_/g, '.')}`;
  if (/Linux/.test(ua) || /Linux/.test(platform)) return 'Linux';
  return null;
}
