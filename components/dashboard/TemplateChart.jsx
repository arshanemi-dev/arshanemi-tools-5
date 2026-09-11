'use client';

// Dependency-free charts for the template dashboard — inline SVG, theme-token
// colours, scroll-free (fills its container). Handles the four chart types:
// line / bar / area (one series per selected Graph Header, auto-split, over a
// shared time axis) and pie (>= 2 header slices). Data comes pre-computed from
// lib/profitLoss/resolveTemplate.

const PALETTE = [
  'var(--color-action)',
  'var(--color-accent)',
  'var(--color-cyan)',
  'var(--color-accent-light)',
  'var(--color-neg)',
  'var(--color-subtle)',
];

const W = 480;
const H = 200;
const PAD = { t: 12, r: 12, b: 26, l: 40 };

function niceNum(n) {
  const a = Math.abs(n);
  if (a >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n * 10) / 10}`;
}

// `series` = [{ title, points: [{t, value}] }] — one per Graph Header,
// auto-split (the same points/x-axis, one line/bar-group/area per header).
function TimeChart({ chartType, series }) {
  const allPoints = series.flatMap((s) => s.points || []);
  if (!allPoints.length) return <Empty />;
  const xKeys = [...new Set(series.flatMap((s) => (s.points || []).map((p) => p.t)))].sort();
  const values = allPoints.map((p) => p.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (xKeys.length === 1 ? iw / 2 : (i / (xKeys.length - 1)) * iw);
  const y = (v) => PAD.t + ih - ((v - min) / span) * ih;
  const zeroY = y(0);
  const nSeries = series.length;

  return (
    <div className="flex h-full flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full flex-1" preserveAspectRatio="none" role="img">
        {/* y gridlines */}
        {[0, 0.5, 1].map((f) => {
          const gy = PAD.t + ih * f;
          const val = min + span * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--color-divider)" strokeWidth="1" />
              <text x={PAD.l - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="var(--color-subtle)">{niceNum(val)}</text>
            </g>
          );
        })}
        <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY} stroke="var(--color-divider-light)" strokeWidth="1" />

        {series.map((s, si) => {
          const color = PALETTE[si % PALETTE.length];
          const byT = new Map((s.points || []).map((p) => [p.t, p.value]));
          const pts = xKeys.map((t, i) => ({ i, t, value: byT.get(t) ?? 0, has: byT.has(t) }));

          if (chartType === 'bar') {
            const group = Math.min(18, iw / xKeys.length / 2);
            const bw = Math.max(2, Math.min(28, iw / xKeys.length / nSeries - 4));
            return (
              <g key={s.title || si}>
                {pts.filter((p) => p.has).map((p) => {
                  const bx = x(p.i) - group + si * (bw + 2);
                  const top = Math.min(y(p.value), zeroY);
                  const h = Math.abs(y(p.value) - zeroY);
                  return <rect key={p.i} x={bx} y={top} width={bw} height={Math.max(1, h)} rx="2" fill={color} opacity="0.85" />;
                })}
              </g>
            );
          }
          return (
            <g key={s.title || si}>
              {chartType === 'area' && pts.some((p) => p.has) && (
                <polygon
                  points={`${x(0)},${zeroY} ${pts.filter((p) => p.has).map((p) => `${x(p.i)},${y(p.value)}`).join(' ')} ${x(pts.length - 1)},${zeroY}`}
                  fill={color}
                  opacity="0.12"
                />
              )}
              <polyline
                points={pts.filter((p) => p.has).map((p) => `${x(p.i)},${y(p.value)}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.filter((p) => p.has).map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.value)} r="2.5" fill={color} />)}
            </g>
          );
        })}

        {/* x labels — first / middle / last only, to stay legible */}
        {[0, Math.floor((xKeys.length - 1) / 2), xKeys.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx && xKeys[i])
          .map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--color-subtle)">
              {String(xKeys[i]).slice(5)}
            </text>
          ))}
      </svg>
      {nSeries > 1 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-[10.5px] text-muted">
          {series.map((s, si) => (
            <li key={s.title || si} className="flex items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: PALETTE[si % PALETTE.length] }} />
              <span className="truncate">{s.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PieChart({ slices }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (!total) return <Empty />;
  const cx = 90;
  const cy = 100;
  const r = 72;
  const arcs = [];
  let angle = -Math.PI / 2;
  for (let i = 0; i < slices.length; i += 1) {
    const s = slices[i];
    const frac = Math.max(0, s.value) / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const d = frac >= 0.999
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`
      : `M ${cx} ${cy} L ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${large} 1 ${p1[0]} ${p1[1]} Z`;
    arcs.push({ d, color: PALETTE[i % PALETTE.length], title: s.title, value: s.value, pct: Math.round(frac * 100) });
  }

  return (
    <div className="flex h-full items-center gap-4">
      <svg viewBox="0 0 180 200" className="h-full w-auto shrink-0" role="img">
        {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} stroke="var(--color-background)" strokeWidth="1.5" />)}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.color }} />
            <span className="truncate text-muted">{a.title}</span>
            <span className="ml-auto shrink-0 font-medium text-foreground">{a.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-xs text-subtle">No data for this range</div>;
}

export default function TemplateChart({ chartType = 'line', series = [] }) {
  if (chartType === 'pie') {
    return <PieChart slices={series.map((s) => ({ title: s.title, value: Number(s.value) || 0 }))} />;
  }
  return <TimeChart chartType={chartType} series={series} />;
}
