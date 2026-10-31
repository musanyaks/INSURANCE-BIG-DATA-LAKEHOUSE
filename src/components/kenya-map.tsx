"use client";

import { useEffect, useMemo, useState } from "react";

type Geo = {
  features: Array<{
    properties: { code: number; name: string };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  }>;
};

export type CountyDatum = { code: number; name?: string; value: number; sub?: string };

const STOPS = ["#10b981", "#eab308", "#f97316", "#f43f5e"];

function hex(h: string) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function colorAt(t: number) {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex(STOPS[i]);
  const b = hex(STOPS[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}

const MIN_LON = 33.8;
const MAX_LON = 42.0;
const MIN_LAT = -4.8;
const MAX_LAT = 5.2;
const K = Math.cos((0.2 * Math.PI) / 180);
const W = (MAX_LON - MIN_LON) * K * 100;
const H = (MAX_LAT - MIN_LAT) * 100;

function project([lon, lat]: number[]) {
  return `${(((lon - MIN_LON) * K) * 100).toFixed(1)},${((MAX_LAT - lat) * 100).toFixed(1)}`;
}

function toPath(geom: Geo["features"][number]["geometry"]) {
  const polys = (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates) as number[][][][];
  return polys.map((rings) => rings.map((ring) => "M" + ring.map(project).join("L") + "Z").join("")).join("");
}

export function KenyaMap({
  data,
  unit = "%",
  label = "Loss ratio",
}: {
  data: CountyDatum[];
  unit?: string;
  label?: string;
}) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/kenya-counties.json")
      .then((r) => r.json())
      .then((j: Geo) => alive && setGeo(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const byCode = useMemo(() => new Map(data.map((d) => [d.code, d])), [data]);
  const values = data.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const paths = useMemo(() => (geo ? geo.features.map((f) => ({ code: f.properties.code, name: f.properties.name, d: toPath(f.geometry) })) : []), [geo]);
  const sel = active !== null ? byCode.get(active) : undefined;
  const selName = active !== null ? paths.find((p) => p.code === active)?.name : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="min-w-0">
        {!geo ? (
          <p className="mono py-20 text-center text-[11px] text-slate-500">loading map…</p>
        ) : (
          <svg viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} className="mx-auto h-auto max-h-[78vh] w-full" role="img" aria-label="Map of Kenya by county">
            {paths.map((p) => {
              const d = byCode.get(p.code);
              const t = d ? (d.value - min) / (max - min || 1) : 0;
              return (
                <path
                  key={p.code}
                  d={p.d}
                  fill={d ? colorAt(t) : "#1e293b"}
                  stroke="#05070e"
                  strokeWidth={active === p.code ? 3 : 1.2}
                  strokeLinejoin="round"
                  opacity={active === null || active === p.code ? 1 : 0.55}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setActive(p.code)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive(p.code)}
                >
                  <title>{p.name}</title>
                </path>
              );
            })}
          </svg>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        {sel || selName ? (
          <>
            <p className="mono text-[10px] tracking-wider text-slate-500 uppercase">County {String(active).padStart(3, "0")}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-100">{selName ?? sel?.name}</p>
            <p className="mono mt-3 text-[10px] tracking-wider text-slate-500 uppercase">{label}</p>
            <p className="mono text-2xl font-bold text-cyan-300">{sel ? `${sel.value.toLocaleString("en-KE", { maximumFractionDigits: 1 })}${unit}` : "—"}</p>
            {sel?.sub && <p className="mono mt-2 text-[11px] text-slate-400">{sel.sub}</p>}
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-slate-300">Hover or tap a county</p>
            <p className="mono mt-1 text-[10.5px] text-slate-600">drill into county-level insurance risk</p>
          </div>
        )}
        <div className="mt-5 border-t border-slate-800 pt-3">
          <p className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">Scale</p>
          <div className="mt-1.5 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${STOPS.join(",")})` }} />
          <div className="mono mt-1 flex justify-between text-[10px] text-slate-500">
            <span>
              {min.toFixed(1)}
              {unit}
            </span>
            <span>
              {max.toFixed(1)}
              {unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
