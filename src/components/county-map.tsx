"use client";

import { useEffect, useMemo, useState } from "react";

export type CountyDatum = {
  code: string;
  name: string;
  gx: number;
  gy: number;
  lossRatio: number;
  claims: number;
  incurred: number;
  earnedPremium: number;
  fraudScore: number;
  riskZone: string;
  population: number;
};

type Geo = {
  features: Array<{
    properties: { code: number; name: string };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  }>;
};

type Shape = { code: number; name: string; d: string; cx: number; cy: number; size: number };

const METRICS = {
  lossRatio: { label: "Loss ratio", unit: "%", key: (c: CountyDatum) => c.lossRatio, fmt: (v: number) => `${v.toFixed(1)}%` },
  fraudScore: { label: "Avg fraud score", unit: "%", key: (c: CountyDatum) => c.fraudScore, fmt: (v: number) => `${v.toFixed(1)}%` },
  claims: { label: "Claim volume", unit: "", key: (c: CountyDatum) => c.claims, fmt: (v: number) => v.toLocaleString("en-KE") },
} as const;

type MetricKey = keyof typeof METRICS;

function colorFor(t: number): string {
  // 0 = emerald (healthy) → 0.5 = amber → 1 = rose (adverse)
  const stops: Array<[number, [number, number, number]]> = [
    [0, [16, 185, 129]],
    [0.45, [234, 179, 8]],
    [0.72, [249, 115, 22]],
    [1, [244, 63, 94]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (x >= p0 && x <= p1) {
      const f = (x - p0) / (p1 - p0 || 1);
      const rgb = c0.map((c, j) => Math.round(c + (c1[j] - c) * f));
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }
  return "rgb(244,63,94)";
}

// Equirectangular projection fitted to Kenya's bounding box (1 degree = 100 units).
const MIN_LON = 33.8;
const MAX_LAT = 5.2;
const MIN_LAT = -4.8;
const MAX_LON = 42.0;
const K = Math.cos((0.2 * Math.PI) / 180);
const VB_W = Math.round((MAX_LON - MIN_LON) * K * 100);
const VB_H = Math.round((MAX_LAT - MIN_LAT) * 100);

function px([lon, lat]: number[]): [number, number] {
  return [(lon - MIN_LON) * K * 100, (MAX_LAT - lat) * 100];
}

function buildShape(f: Geo["features"][number]): Shape {
  const polys = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
  let d = "";
  let best = { area: -1, cx: 0, cy: 0, w: 0, h: 0 };
  for (const rings of polys) {
    rings.forEach((ring, idx) => {
      const pts = ring.map(px);
      d += "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z";
      if (idx === 0) {
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const w = Math.max(...xs) - Math.min(...xs);
        const h = Math.max(...ys) - Math.min(...ys);
        if (w * h > best.area) best = { area: w * h, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, w, h };
      }
    });
  }
  return { code: f.properties.code, name: f.properties.name, d, cx: best.cx, cy: best.cy, size: Math.min(best.w, best.h) };
}

export function CountyTileMap({ counties }: { counties: CountyDatum[] }) {
  const [metric, setMetric] = useState<MetricKey>("lossRatio");
  const [hover, setHover] = useState<CountyDatum | null>(null);
  const [selected, setSelected] = useState<CountyDatum | null>(null);
  const [shapes, setShapes] = useState<Shape[] | null>(null);
  const m = METRICS[metric];

  useEffect(() => {
    let alive = true;
    fetch("/kenya-counties.json")
      .then((r) => r.json())
      .then((g: Geo) => {
        if (alive) setShapes(g.features.map(buildShape));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const byCode = useMemo(() => new Map(counties.map((c) => [Number(c.code), c])), [counties]);

  const { min, max } = useMemo(() => {
    const vals = counties.map(m.key);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [counties, m]);

  const active = selected ?? hover;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(METRICS) as MetricKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            className={`mono rounded border px-2 py-1 text-[10px] tracking-wide uppercase transition-colors ${
              metric === k ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {METRICS[k].label}
          </button>
        ))}
        <span className="mono ml-auto text-[10px] text-slate-600">
          county choropleth · 47 counties · {m.fmt(min)} → {m.fmt(max)}
        </span>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          {!shapes ? (
            <p className="mono py-24 text-center text-[11px] text-slate-500">loading map…</p>
          ) : (
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="mx-auto h-auto max-h-[78vh] w-full" role="img" aria-label="Map of Kenya by county" onClick={() => setSelected(null)}>
              {shapes.map((s) => {
                const c = byCode.get(s.code);
                const v = c ? m.key(c) : 0;
                const t = max > min ? (v - min) / (max - min) : 0.5;
                const on = !!c && active?.code === c.code;
                return (
                  <path
                    key={s.code}
                    d={s.d}
                    fill={c && v !== 0 ? colorFor(t) : "#1e293b"}
                    stroke={on ? "#ffffff" : "#05070e"}
                    strokeWidth={on ? 3 : 1.2}
                    strokeLinejoin="round"
                    opacity={active && !on ? 0.55 : 1}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => c && setHover(c)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (c) setSelected(selected?.code === c.code ? null : c);
                    }}
                  >
                    <title>{c ? `${c.name}: ${m.fmt(v)}` : s.name}</title>
                  </path>
                );
              })}
              {shapes
                .filter((s) => s.size > 38)
                .map((s) => (
                  <text key={`t${s.code}`} x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={700} fill="#05070e" fillOpacity={0.75} pointerEvents="none" className="mono">
                    {String(s.code).padStart(3, "0")}
                  </text>
                ))}
            </svg>
          )}
        </div>

        <div className="w-full shrink-0 lg:w-[228px]">
          <div className="panel h-full p-3">
            {active ? (
              <>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[13px] font-semibold text-slate-100">{active.name}</h3>
                  <span className="mono text-[10px] text-slate-500">county {active.code}</span>
                </div>
                <p className="mono mt-0.5 text-[10px] tracking-wide text-slate-500 uppercase">
                  {active.riskZone} risk zone · pop {(active.population / 1e6).toFixed(2)}M
                </p>
                <dl className="mt-3 space-y-1.5">
                  {[
                    ["Earned premium", `KSh ${(active.earnedPremium / 1e6).toFixed(1)}M`],
                    ["Incurred claims", `KSh ${(active.incurred / 1e6).toFixed(1)}M`],
                    ["Loss ratio", `${active.lossRatio.toFixed(1)}%`],
                    ["Claim volume", active.claims.toLocaleString("en-KE")],
                    ["Avg fraud score", `${active.fraudScore.toFixed(1)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 border-b border-slate-800/60 pb-1.5">
                      <dt className="text-[11px] text-slate-400">{k}</dt>
                      <dd className="mono text-[11.5px] text-slate-100">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mono mt-3 text-[9.5px] leading-relaxed text-slate-500">
                  dim_location · county_code={active.code} · s3a://insurelake/gold/dim_location/
                </div>
              </>
            ) : (
              <div className="py-6 text-center">
                <p className="text-[11.5px] text-slate-400">Hover or tap a county</p>
                <p className="mono mt-1 text-[10px] text-slate-600">drill into county-level insurance risk</p>
              </div>
            )}
            <div className="mt-4 border-t border-slate-800 pt-3">
              <p className="mono mb-1.5 text-[9.5px] tracking-wider text-slate-500 uppercase">scale</p>
              <div className="h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg, rgb(16,185,129), rgb(234,179,8), rgb(249,115,22), rgb(244,63,94))" }} />
              <div className="mono mt-1 flex justify-between text-[9.5px] text-slate-500">
                <span>{m.fmt(min)}</span>
                <span>{m.fmt(max)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
