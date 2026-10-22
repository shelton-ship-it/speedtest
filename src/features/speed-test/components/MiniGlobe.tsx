'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { LAND_POLYGONS } from '../data/land110m';

/**
 * Mini globo 3D (Canvas 2D, sem dependências externas).
 * - Estado idle: roda lentamente; mostra um círculo na localização aproximada do utilizador
 *   (obtida via geo IP público — Cloudflare `__loc`; se indisponível, não inventa local).
 * - Hover no círculo → tooltip com cidade/país/região e nota de que é uma estimativa por IP.
 * - Durante o teste (`spinning`): acelera e liga pulsos animados a "pontos globais"
 *   (decoração inspirada em serviços de VPN — NÃO representa medições reais; nunca afeta resultados).
 * - Ao terminar, regressa suavemente ao estado normal.
 * Respeita prefers-reduced-motion (desenha estático) e tem alternativa textual acessível.
 */

type Loc = { city: string | null; country: string | null; region: string | null; lat: number; lon: number };

const DEG = Math.PI / 180;

/** Pontos decorativos de datacenters públicos da Cloudflare (lat/lon). Apenas visual. */
const GLOBAL_NODES: Array<[number, number]> = [
  [51.507, -0.128],   // Londres
  [48.857, 2.352],    // Paris
  [50.11, 8.68],      // Frankfurt
  [40.417, -3.703],   // Madrid
  [41.9, 12.5],       // Roma
  [52.23, 21.01],     // Varsóvia
  [40.71, -74.0],     // Nova Iorque
  [37.77, -122.42],   // São Francisco
  [33.94, -118.4],    // Los Angeles
  [25.76, -80.19],    // Miami
  [-23.55, -46.63],   // São Paulo
  [19.43, -99.13],    // Cidade do México
  [43.65, -79.38],    // Toronto
  [35.68, 139.69],    // Tóquio
  [37.57, 126.98],    // Seul
  [1.35, 103.82],     // Singapura
  [25.2, 55.27],      // Dubai
  [-33.87, 151.21],   // Sydney
  [28.61, 77.21],     // Deli
  [55.75, 37.62],     // Moscovo
  [30.04, 31.24],     // Cairo
  [-26.2, 28.05],     // Joanesburgo
  [59.33, 18.07],     // Estocolmo
  [41.01, 28.98],     // Istambul
];

/** Projeção ortográfica simples: lon→yaw, com o eixo ligeiramente inclinado. */
function project(lat: number, lon: number, yaw: number, r: number): { x: number; y: number; front: boolean } {
  const la = lat * DEG;
  const dLon = (lon * DEG) - yaw;
  const x = Math.cos(la) * Math.sin(dLon);
  const y = Math.sin(la);
  const z = Math.cos(la) * Math.cos(dLon);
  const tilt = 0.35; // vista ligeiramente de cima
  const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
  return { x: x * r, y: -y2 * r, front: z2 > 0 };
}

export function MiniGlobe({ spinning }: { spinning: boolean }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [loc, setLoc] = useState<Loc | 'unavailable' | 'loading'>('loading');
  const [hover, setHover] = useState(false);
  const spinRef = useRef(spinning);
  spinRef.current = spinning;

  // Geo IP público (o mesmo endpoint de localização da Cloudflare usado apenas para o marcador).
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    fetch('https://speed.cloudflare.com/__loc', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new String(r.status))))
      .then((j: { city?: { name?: string }; country?: { name?: string }; region?: { name?: string }; lat?: number; lon?: number }) => {
        if (cancelled) return;
        if (typeof j?.lat === 'number' && typeof j?.lon === 'number') {
          setLoc({
            city: j.city?.name ?? null,
            country: j.country?.name ?? null,
            region: j.region?.name ?? null,
            lat: j.lat,
            lon: j.lon,
          });
        } else setLoc('unavailable');
      })
      .catch(() => { if (!cancelled) setLoc('unavailable'); })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; ctrl.abort(); };
  }, []);

  const reduced = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Animação (requestAnimationFrame — rápida e fluida; pausa quando fora do viewport).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let yaw = -0.4;
    let speed = 0.003;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);

    const pulses: Array<{ node: number; start: number }> = [];
    let lastPulse = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const SIZE = 200;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const cx = SIZE / 2, cy = SIZE / 2, R = SIZE / 2 - 10;

    function draw(now: number) {
      const dt = Math.min(50, now - last);
      last = now;
      // alvo de velocidade: gira rápido durante o teste (simulação decorativa), devagar ao repouso
      const target = spinRef.current ? 0.05 : 0.003;
      speed += (target - speed) * Math.min(1, dt / 350);
      if (!reduced) yaw += speed * (dt / 16.7);

      if (visible) {
        const cs = getComputedStyle(document.documentElement);
        const accent = cs.getPropertyValue('--accent').trim() || '#4ea1ff';
        const border = cs.getPropertyValue('--border').trim() || '#2a3340';
        const panel2 = cs.getPropertyValue('--panel-2').trim() || '#1f2630';
        const ok = cs.getPropertyValue('--ok').trim() || '#3ecf8e';

        ctx!.clearRect(0, 0, SIZE, SIZE);
        // esfera
        const grad = ctx!.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R);
        grad.addColorStop(0, panel2);
        grad.addColorStop(1, border);
        ctx!.beginPath();
        ctx!.arc(cx, cy, R, 0, Math.PI * 2);
        ctx!.fillStyle = grad;
        ctx!.fill();
        ctx!.strokeStyle = accent;
        ctx!.globalAlpha = 0.5;
        ctx!.lineWidth = 1;
        ctx!.stroke();
        ctx!.globalAlpha = 1;

        // continentes (Natural Earth 110m) — recortados pela esfera, frente apenas
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
        ctx!.clip();
        for (const poly of LAND_POLYGONS) {
          let started = false;
          let anyFront = false;
          for (const [lo, la] of poly) {
            const p = project(la, lo, yaw, R);
            if (p.front) anyFront = true;
          }
          if (!anyFront) continue;
          ctx!.beginPath();
          for (const [lo, la] of poly) {
            const p = project(la, lo, yaw, R);
            if (!started) { ctx!.moveTo(cx + p.x, cy + p.y); started = true; }
            else ctx!.lineTo(cx + p.x, cy + p.y);
          }
          ctx!.closePath();
          ctx!.fillStyle = accent;
          ctx!.globalAlpha = 0.14;
          ctx!.fill();
          ctx!.strokeStyle = accent;
          ctx!.globalAlpha = 0.5;
          ctx!.lineWidth = 0.8;
          ctx!.stroke();
          ctx!.globalAlpha = 1;
        }
        ctx!.restore();

        // grelha (meridianos/paralelos)
        ctx!.strokeStyle = accent;
        ctx!.globalAlpha = 0.10;
        for (let m = 0; m < 6; m++) {
          const phase = ((yaw * 0.5 + (m * Math.PI) / 6) % Math.PI + Math.PI) % Math.PI;
          const rx = Math.abs(Math.cos(phase)) * R;
          ctx!.beginPath();
          ctx!.ellipse(cx, cy, Math.max(0.5, rx), R, 0, 0, Math.PI * 2);
          ctx!.stroke();
        }
        for (let p = -60; p <= 60; p += 30) {
          const pr = Math.cos(p * DEG) * R;
          const py = -Math.sin(p * DEG) * R * Math.cos(0.35);
          ctx!.beginPath();
          ctx!.ellipse(cx, cy + py, pr, pr * 0.18, 0, 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.globalAlpha = 1;

        // nós globais decorativos
        const nodeXy = GLOBAL_NODES.map(([la, lo], i) => ({ i, ...project(la, lo, yaw, R) }));
        for (const n of nodeXy) {
          if (!n.front) continue;
          ctx!.beginPath();
          ctx!.arc(cx + n.x, cy + n.y, 1.6, 0, Math.PI * 2);
          ctx!.fillStyle = accent;
          ctx!.globalAlpha = 0.85;
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }

        // pulsos durante o teste (ligam o utilizador a nós visíveis — puramente decorativo)
        if (spinRef.current && !reduced && now - lastPulse > 420) {
          lastPulse = now;
          const front = nodeXy.filter((n) => n.front);
          if (front.length) pulses.push({ node: front[Math.floor(Math.random() * front.length)].i, start: now });
        }
        if (loc !== 'loading' && loc !== 'unavailable') {
          const me = project(loc.lat, loc.lon, yaw, R);
          for (let k = pulses.length - 1; k >= 0; k--) {
            const pu = pulses[k];
            const age = (now - pu.start) / 1400;
            if (age > 1) { pulses.splice(k, 1); continue; }
            const n = nodeXy[pu.node];
            if (!me.front || !n.front) continue;
            const steps = 14;
            ctx!.beginPath();
            for (let sIdx = 0; sIdx <= steps; sIdx++) {
              const f = sIdx / steps;
              const lx = me.x + (n.x - me.x) * f;
              const ly = me.y + (n.y - me.y) * f - Math.sin(f * Math.PI) * 22; // arco
              if (sIdx === 0) ctx!.moveTo(cx + lx, cy + ly); else ctx!.lineTo(cx + lx, cy + ly);
            }
            ctx!.setLineDash([3, 5]);
            ctx!.lineDashOffset = -age * 60;
            ctx!.strokeStyle = ok;
            ctx!.globalAlpha = 0.28 + 0.4 * Math.sin(Math.min(1, age) * Math.PI);
            ctx!.lineWidth = 1.2;
            ctx!.stroke();
            ctx!.setLineDash([]);
            ctx!.globalAlpha = 1;
          }
          // marcador do utilizador (círculo com hover)
          if (me.front) {
            const px = cx + me.x, py = cy + me.y;
            (canvas as HTMLCanvasElement & { _marker?: { x: number; y: number } })._marker = { x: px, y: py };
            const pulseR = spinRef.current && !reduced ? 6 + 3 * Math.sin(now / 180) : 6;
            ctx!.beginPath();
            ctx!.arc(px, py, pulseR + 4, 0, Math.PI * 2);
            ctx!.fillStyle = ok;
            ctx!.globalAlpha = hover ? 0.35 : 0.18;
            ctx!.fill();
            ctx!.globalAlpha = 1;
            ctx!.beginPath();
            ctx!.arc(px, py, 4, 0, Math.PI * 2);
            ctx!.fillStyle = ok;
            ctx!.fill();
            ctx!.strokeStyle = '#fff';
            ctx!.lineWidth = 1;
            ctx!.stroke();
          } else {
            (canvas as HTMLCanvasElement & { _marker?: { x: number; y: number } })._marker = undefined;
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [reduced, hover, loc]);

  const marker = (canvasRef.current as (HTMLCanvasElement & { _marker?: { x: number; y: number } }) | null)?._marker;
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = 200 / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;
    const near = !!marker && Math.hypot(mx - marker.x, my - marker.y) <= 14;
    setHover((h) => (h === near ? h : near));
  }

  const locLabel =
    loc === 'loading' ? t('globe.locating')
      : loc === 'unavailable' ? t('globe.locationUnavailable')
        : [loc.city, loc.region, loc.country].filter(Boolean).join(', ');

  return (
    <div ref={wrapRef} className="globe-wrap">
      <div className="globe-canvas-box">
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          style={{ width: '100%', display: 'block', cursor: hover ? 'help' : 'default' }}
          role="img"
          aria-label={t('globe.aria', { status: spinning ? t('globe.status.testing') : t('globe.status.idle'), loc: locLabel })}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(false)}
        />
        {hover && typeof loc === 'object' && (
          <div className="globe-tooltip" role="tooltip">
            <strong>{locLabel}</strong>
            <br />
            {`${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`}
            <br />
            <span className="muted">{t('globe.ipNote')}</span>
          </div>
        )}
      </div>
      <p className="muted globe-caption">{locLabel}</p>
      <p className="muted globe-note" aria-hidden={false}>{t('globe.simulationNote')}</p>
    </div>
  );
}
