'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const COLORS = ['#4f46e5', '#06b6d4', '#818cf8', '#f59e0b', '#ef4444', '#10b981', '#a855f7', '#64748b'];
const DEMO_X = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6'];

// A small, deterministic (no re-render jitter) stand-in dataset so a Graph's
// chart type + picked headers preview live in the builder — the real
// dashboard plots actual resolved values (lib/profitLoss/resolveTemplate).
function seededSeries(seed, n) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(30 + (h % 1000) / 10);
  }
  return out;
}

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10.5 } } } },
  scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } },
};

export default function GraphPreviewChart({ chartType = 'line', headers = [] }) {
  const data = useMemo(() => {
    const names = headers.map((h) => h.name).filter(Boolean);
    if (chartType === 'pie') {
      return {
        labels: names.length ? names : ['Pick headers'],
        datasets: [{
          data: names.length ? names.map((n) => seededSeries(n, 1)[0]) : [1],
          backgroundColor: (names.length ? names : ['—']).map((_, i) => COLORS[i % COLORS.length]),
          borderWidth: 0,
        }],
      };
    }
    return {
      labels: DEMO_X,
      datasets: (names.length ? names : ['Pick headers']).map((n, i) => ({
        label: n,
        data: seededSeries(n, DEMO_X.length),
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: chartType === 'area' ? `${COLORS[i % COLORS.length]}26` : COLORS[i % COLORS.length],
        fill: chartType === 'area',
        tension: 0.35,
        pointRadius: 2.5,
        borderRadius: chartType === 'bar' ? 4 : undefined,
      })),
    };
  }, [chartType, headers]);

  if (chartType === 'pie') return <Pie data={data} options={commonOptions} />;
  if (chartType === 'bar') return <Bar data={data} options={commonOptions} />;
  return <Line data={data} options={commonOptions} />;
}
