"use client";

import { useMemo, useState } from "react";

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

export function CountyTileMap({ counties }: { counties: CountyDatum[] }) {
  const [metric, setMetric] = useState<MetricKey>("lossRatio");
  const [hover, setHover] = useState<CountyDatum | null>(null);
  const [selected, setSelected] = useState<CountyDatum | null>(null);
  const m = METRICS[metric];

  const { cols, rows, min, max } = useMemo(() => {
    const vals = counties.map(m.key);
    return {
      cols: Math.max(...counties.map((c) => c.gx)) + 1,
      rows: Math.max(...counties.map((c) => c.gy)) + 1,
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
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
        <span className="mono ml-auto text-[10px] text-slate-600">tile-grid choropleth · 47 counties · {m.fmt(min)} → {m.fmt(max)}</span>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            {counties.map((c) => {
              const v = m.key(c);
              const t = max > min ? (v - min) / (max - min) : 0.5;
              const on = active?.code === c.code;
              return (
                <button
                  key={c.code}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected(c)}
                  style={{
                    gridColumnStart: c.gx + 1,
                    gridRowStart: c.gy + 1,
                    background: colorFor(t),
                    opacity: active && !on ? 0.55 : 1,
                  }}
                  className={`mono relative flex aspect-square flex-col items-center justify-center rounded-[5px] text-slate-950 transition-all ${on ? "scale-[1.09] ring-2 ring-white/80" : "hover:scale-[1.06]"} ${v === 0 ? "bg-slate-800 text-slate-500" : ""}`}
                  title={`${c.name}: ${m.fmt(v)}`}
                >
                  <span className="text-[9px] leading-none font-bold opacity-80">{c.code}</span>
                  <span className="mt-0.5 max-w-full truncate px-0.5 text-[8.5px] leading-none font-semibold">{c.name.slice(0, 9)}</span>
                </button>
              );
            })}
          </div>
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
                <p className="text-[11.5px] text-slate-400">Hover or tap a county tile</p>
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
