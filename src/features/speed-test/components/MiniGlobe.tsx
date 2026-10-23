'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { LAND_POLYGONS } from '../data/land110m';

/**
 * Globo 3D real (Canvas 2D com projeção ortográfica 3D completa — sem dependências externas).
 * - Rotação em dois eixos (yaw + pitch) via matriz de rotação 3D, com profundidade por vértice,
 *   iluminação de Lambert e ordenação pelo algoritmo do pintor (faces mais distantes primeiro).
 * - Iluminação direcional com terminador dia/noite, halo atmosférico e brilho especular.
 * - Sem interação de arrasto: a rotação é automática (idle lento / rápida durante o teste),
 *   tal como no original — o gesto de hover no marcador foi preservado.
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

/** Vetor unitário 3D a partir de lat/lon (convenção geográfica). */
function toVec(lat: number, lon: number): [number, number, number] {
  const la = lat * DEG, lo = lon * DEG;
  const c = Math.cos(la);
  return [c * Math.sin(lo), Math.sin(la), c * Math.cos(lo)];
}

/** Matriz de rotação 3D (composta com ordem ZYX-like) aplicada a um vetor. */
function rot(m: number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** Constrói a matriz de rotação do globo a partir de yaw (em torno de Y) e pitch (em torno de X). */
function rotationMatrix(yaw: number, pitch: number): number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Ry(yaw) * Rx(pitch)
  return [
    cy, sp * sy, -cp * sy,
    0, cp, sp,
    sy, -sp * cy, cp * cy,
  ];
}

/**
 * Projeção ortográfica 3D completa: aplica a matriz de rotação, devolve coordenadas de ecrã,
 * profundidade (z da câmara) e coeficiente de iluminação de Lambert para o vetor de luz dado.
 */
function project3(
  v: [number, number, number],
  m: number[],
  light: [number, number, number],
  r: number,
): { x: number; y: number; z: number; lit: number } {
  const [x, y, z] = rot(m, v[0], v[1], v[2]);
  const dot = x * light[0] + y * light[1] + z * light[2];
  const lit = Math.max(0, dot);
  return { x: x * r, y: -y * r, z, lit };
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

  // Pré-converte os polígonos de terra para vetores 3D unitários (uma vez).
  const landVecs = useMemo(
    () => LAND_POLYGONS.map((poly) => poly.map(([lo, la]) => toVec(la, lo))),
    [],
  );

  // Animação (requestAnimationFrame — rápida e fluida; pausa quando fora do viewport).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let yaw = -0.4;
    let pitch = 0.35; // vista ligeiramente de cima
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
    const cx = SIZE / 2, cy = SIZE / 2, R = SIZE / 2 - 14;

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

        const M = rotationMatrix(yaw, pitch);
        // Luz direcional fixa na cena (câmara): esquerda-frente-cima → hemisfério direito fica
        // na sombra, criando um terminador dia/noite visível enquanto o globo gira.
        const lx = -0.5, ly = 0.55, lz = 0.67;
        const ll = Math.hypot(lx, ly, lz);
        const light: [number, number, number] = [lx / ll, ly / ll, lz / ll];

        ctx!.clearRect(0, 0, SIZE, SIZE);

        // halo atmosférico (brilho atrás da esfera — efeito 3D de atmosfera)
        const halo = ctx!.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25);
        halo.addColorStop(0, accent + '55');
        halo.addColorStop(1, accent + '00');
        ctx!.beginPath();
        ctx!.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
        ctx!.fillStyle = halo;
        ctx!.fill();

        // esfera base com sombreamento 3D (gradiente deslocado na direção da luz)
        const grad = ctx!.createRadialGradient(
          cx + light[0] * R * 0.55, cy - light[1] * R * 0.55, R * 0.1,
          cx, cy, R,
        );
        grad.addColorStop(0, panel2);
        grad.addColorStop(0.75, border);
        grad.addColorStop(1, '#0b0f14');
        ctx!.beginPath();
        ctx!.arc(cx, cy, R, 0, Math.PI * 2);
        ctx!.fillStyle = grad;
        ctx!.fill();

        // recorte pela esfera para desenhar conteúdo 3D
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
        ctx!.clip();

        // continentes (Natural Earth 110m) — face frontal apenas, com profundidade média
        type Face = { depth: number; pts: Array<{ x: number; y: number; lit: number }> };
        const faces: Face[] = [];
        for (const poly of landVecs) {
          let sumZ = 0, nFront = 0;
          const pts: Array<{ x: number; y: number; lit: number }> = [];
          for (const v of poly) {
            const p = project3(v, M, light, R);
            if (p.z > 0) nFront++;
            sumZ += p.z;
            pts.push(p);
          }
          if (nFront < 2) continue;
          faces.push({ depth: sumZ / pts.length, pts });
        }
        // ordenação pelo algoritmo do pintor: desenha primeiro o que está mais longe
        faces.sort((a, b) => a.depth - b.depth);
        for (const f of faces) {
          ctx!.beginPath();
          for (let i = 0; i < f.pts.length; i++) {
            const p = f.pts[i];
            if (i === 0) ctx!.moveTo(cx + p.x, cy + p.y);
            else ctx!.lineTo(cx + p.x, cy + p.y);
          }
          ctx!.closePath();
          // brilho médio dos vértices → face mais clara voltada para a luz, mais escura no terminador
          let litSum = 0;
          for (const p of f.pts) litSum += p.lit;
          const litAvg = litSum / f.pts.length;
          const depthShade = Math.max(0.15, 0.35 + 0.65 * ((f.depth + 1) / 2));
          ctx!.globalAlpha = 0.10 + 0.30 * litAvg * depthShade;
          ctx!.fillStyle = accent;
          ctx!.fill();
          ctx!.globalAlpha = 0.25 + 0.45 * litAvg;
          ctx!.strokeStyle = accent;
          ctx!.lineWidth = 0.8;
          ctx!.stroke();
        }

        // grelha 3D (meridianos/paralelos) — segmentos com z>0, atenuados pela profundidade
        ctx!.strokeStyle = accent;
        ctx!.lineWidth = 0.6;
        for (let mIdx = 0; mIdx < 6; mIdx++) {
          const lon0 = mIdx * 30;
          let prev: { x: number; y: number; z: number } | null = null;
          for (let la = -90; la <= 90; la += 5) {
            const p = project3(toVec(la, lon0), M, light, R);
            if (p.z > 0 && prev && prev.z > 0) {
              ctx!.globalAlpha = 0.06 + 0.10 * ((p.z + prev.z) / 2);
              ctx!.beginPath();
              ctx!.moveTo(cx + prev.x, cy + prev.y);
              ctx!.lineTo(cx + p.x, cy + p.y);
              ctx!.stroke();
            }
            prev = p;
          }
        }
        for (let la = -60; la <= 60; la += 30) {
          let prev: { x: number; y: number; z: number } | null = null;
          for (let lo = -180; lo <= 180; lo += 5) {
            const p = project3(toVec(la, lo), M, light, R);
            if (p.z > 0 && prev && prev.z > 0) {
              ctx!.globalAlpha = 0.06 + 0.10 * ((p.z + prev.z) / 2);
              ctx!.beginPath();
              ctx!.moveTo(cx + prev.x, cy + prev.y);
              ctx!.lineTo(cx + p.x, cy + p.y);
              ctx!.stroke();
            }
            prev = p;
          }
        }
        ctx!.globalAlpha = 1;

        // nós globais decorativos (esferas em miniatura com sombra/half-tone 3D)
        const nodeXy = GLOBAL_NODES.map(([la, lo], i) => {
          const p = project3(toVec(la, lo), M, light, R);
          return { i, ...p };
        });
        for (const n of nodeXy) {
          if (n.z <= 0) continue;
          const rr = 1.2 + 1.2 * n.z; // tamanho aparente cresce com a proximidade da câmera
          ctx!.beginPath();
          ctx!.arc(cx + n.x, cy + n.y, rr, 0, Math.PI * 2);
          ctx!.fillStyle = accent;
          ctx!.globalAlpha = 0.35 + 0.55 * n.z * (0.3 + 0.7 * n.lit);
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }

        // pulsos durante o teste (ligam o utilizador a nós visíveis — puramente decorativo)
        if (spinRef.current && !reduced && now - lastPulse > 420) {
          lastPulse = now;
          const front = nodeXy.filter((n) => n.z > 0);
          if (front.length) pulses.push({ node: front[Math.floor(Math.random() * front.length)].i, start: now });
        }
        if (loc !== 'loading' && loc !== 'unavailable') {
          const me = project3(toVec(loc.lat, loc.lon), M, light, R);
          for (let k = pulses.length - 1; k >= 0; k--) {
            const pu = pulses[k];
            const age = (now - pu.start) / 1400;
            if (age > 1) { pulses.splice(k, 1); continue; }
            const n = nodeXy[pu.node];
            if (me.z <= 0 || n.z <= 0) continue;
            const steps = 14;
            ctx!.beginPath();
            for (let sIdx = 0; sIdx <= steps; sIdx++) {
              const f = sIdx / steps;
              const lift = Math.sin(f * Math.PI) * 22 * (0.5 + 0.5 * ((me.z + n.z) / 2)); // arco maior na frente
              const lx2 = me.x + (n.x - me.x) * f;
              const ly2 = me.y + (n.y - me.y) * f - lift;
              if (sIdx === 0) ctx!.moveTo(cx + lx2, cy + ly2); else ctx!.lineTo(cx + lx2, cy + ly2);
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
          if (me.z > 0) {
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

        ctx!.restore();

        // terminador dia/noite: sobreposição escura no hemisfério oposto à luz
        const night = ctx!.createRadialGradient(
          cx - light[0] * R * 1.4, cy + light[1] * R * 1.4, R * 0.2,
          cx - light[0] * R * 0.6, cy + light[1] * R * 0.6, R * 1.5,
        );
        night.addColorStop(0, 'rgba(4,7,12,0.55)');
        night.addColorStop(0.55, 'rgba(4,7,12,0.22)');
        night.addColorStop(1, 'rgba(4,7,12,0)');
        ctx!.beginPath();
        ctx!.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
        ctx!.fillStyle = night;
        ctx!.fill();

        // brilho especular (realce de "esfera de vidro")
        const spec = ctx!.createRadialGradient(
          cx + light[0] * R * 0.5, cy - light[1] * R * 0.5, 0,
          cx + light[0] * R * 0.5, cy - light[1] * R * 0.5, R * 0.5,
        );
        spec.addColorStop(0, 'rgba(255,255,255,0.16)');
        spec.addColorStop(1, 'rgba(255,255,255,0)');
        ctx!.beginPath();
        ctx!.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
        ctx!.fillStyle = spec;
        ctx!.fill();

        // limbo (arco iluminado na borda virada para a luz)
        ctx!.beginPath();
        ctx!.arc(cx, cy, R, 0, Math.PI * 2);
        ctx!.strokeStyle = accent;
        ctx!.globalAlpha = 0.5;
        ctx!.lineWidth = 1;
        ctx!.stroke();
        ctx!.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [reduced, hover, loc, landVecs]);

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
