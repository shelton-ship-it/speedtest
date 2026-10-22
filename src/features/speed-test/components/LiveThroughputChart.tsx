'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Gráfico de throughput em tempo real (Canvas 2D via requestAnimationFrame).
 * Mais rápido e responsivo que re-render SVG a cada amostra: o desenho acontece
 * fora do ciclo de render do React; apenas o "buffer" de pontos é atualizado por ref.
 * - Eixo Y auto-escala com suavização; ausência de dados nunca é desenhada como zero.
 * - Fase atual destacada na legenda; linhas verticais marcam mudanças de fase.
 * - Reduzido quando prefers-reduced-motion (desenha só quando chegam dados novos).
 */

export type LivePoint = { t: number; dl: number | null; ul: number | null };
export type LivePhaseMark = { t: number; label: string };

const WINDOW_MS = 60_000; // janela temporal visível

export function LiveThroughputChart({
  pointsRef,
  phase,
  phaseLabel,
  unit,
  height = 180,
}: {
  /** Buffer mutável partilhado pelo dashboard (evita re-render por amostra). */
  pointsRef: React.MutableRefObject<LivePoint[]>;
  phase: string;
  phaseLabel: string;
  unit: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const maxSeenRef = useRef(1);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 600;
      setWidth(Math.max(240, Math.round(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const canvas: HTMLCanvasElement = cv;
    const g = canvas.getContext('2d');
    if (!g) return;
    const ctx: CanvasRenderingContext2D = g;
    let raf = 0;
    let last = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      if (reduced && now - last < 1000) return; // modo reduzido: redesenhar ~1/s
      last = now;

      const W = width, H = height;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cs = getComputedStyle(document.documentElement);
      const accent = cs.getPropertyValue('--accent').trim() || '#4ea1ff';
      const ok = cs.getPropertyValue('--ok').trim() || '#3ecf8e';
      const border = cs.getPropertyValue('--border').trim() || '#2a3340';
      const muted = cs.getPropertyValue('--muted').trim() || '#9aa7b5';

      ctx.clearRect(0, 0, W, H);
      const pts = pointsRef.current.filter((p) => now - p.t <= WINDOW_MS);
      const PAD_L = 44, PAD_R = 8, PAD_T = 10, PAD_B = 20;
      const plotW = W - PAD_L - PAD_R;
      const plotH = H - PAD_T - PAD_B;

      // escala Y: máximo observado na janela, suavizado
      let winMax = 1;
      for (const p of pts) {
        if (p.dl !== null && Number.isFinite(p.dl)) winMax = Math.max(winMax, p.dl);
        if (p.ul !== null && Number.isFinite(p.ul)) winMax = Math.max(winMax, p.ul);
      }
      const target = winMax * 1.15;
      maxSeenRef.current += (target - maxSeenRef.current) * (target > maxSeenRef.current ? 0.5 : 0.05);
      const yMax = Math.max(1, maxSeenRef.current);

      const tEnd = now;
      const x = (t: number) => PAD_L + ((t - (tEnd - WINDOW_MS)) / WINDOW_MS) * plotW;
      const y = (v: number) => PAD_T + plotH - (Math.min(v, yMax) / yMax) * plotH;

      // grelha horizontal + rótulos
      ctx.strokeStyle = border;
      ctx.fillStyle = muted;
      ctx.lineWidth = 1;
      ctx.font = '11px system-ui, sans-serif';
      for (let g = 0; g <= 4; g++) {
        const v = (yMax / 4) * g;
        const yy = y(v);
        ctx.beginPath();
        ctx.moveTo(PAD_L, yy);
        ctx.lineTo(W - PAD_R, yy);
        ctx.globalAlpha = g === 0 ? 0.9 : 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(v >= 100 ? v.toFixed(0) : v.toFixed(1), 4, yy + 3);
      }

      if (pts.length >= 2) {
        const line = (key: 'dl' | 'ul', color: string) => {
          ctx.beginPath();
          let started = false;
          for (const p of pts) {
            const v = p[key];
            if (v === null || !Number.isFinite(v)) { started = false; continue; } // gap, não zero
            const px = x(p.t), py = y(v);
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          ctx.stroke();
        };
        line('dl', accent);
        line('ul', ok);
        // último valor pontuado
        const lastPt = [...pts].reverse().find((p) => p.dl !== null || p.ul !== null);
        if (lastPt) {
          if (lastPt.dl !== null) { ctx.beginPath(); ctx.arc(x(lastPt.t), y(lastPt.dl), 3, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill(); }
          if (lastPt.ul !== null) { ctx.beginPath(); ctx.arc(x(lastPt.t), y(lastPt.ul), 3, 0, Math.PI * 2); ctx.fillStyle = ok; ctx.fill(); }
        }
      } else {
        ctx.fillStyle = muted;
        ctx.fillText('…', PAD_L + plotW / 2, PAD_T + plotH / 2);
      }
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height, reduced, pointsRef]);

  return (
    <div ref={boxRef} className="card live-chart-card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>
          {'Download/Upload'} <span className="muted">({unit})</span>
        </h3>
        <span className="muted">{phaseLabel}</span>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Amostras de throughput em tempo real — ${phaseLabel}`}
        style={{ width: '100%', height, display: 'block', marginTop: 6 }}
      />
      <div className="row muted" style={{ fontSize: '0.8rem' }}>
        <LegendDot color="var(--accent)" label="Download" />
        <LegendDot color="var(--ok)" label="Upload" />
        <span>{`janela: ${WINDOW_MS / 1000}s`}</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={{ width: 12, height: 3, background: color, display: 'inline-block', borderRadius: 2 }} />
      {label}
    </span>
  );
}
