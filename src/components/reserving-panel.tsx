"use client";

import { useState } from "react";
import { MultiLine, StackedBars } from "./charts";
import { Badge } from "./ui";

export type MethodResult = { origin: string; paidToDate: number; ultimate: number; ibnr: number; se: number | null; cv: number | null; apriori: number | null };

export type LobReserving = {
  lob: string;
  origins: string[];
  paid: Array<Array<number | null>>;
  incurred: Array<Array<number | null>>;
  ldf: number[];
  cdf: number[];
  methods: Record<string, MethodResult[]>;
  mackSe: number;
  mackCv: number;
};

const METHOD_COLORS: Record<string, string> = {
  chain_ladder: "#22d3ee",
  bornhuetter_ferguson: "#a78bfa",
  cape_cod: "#eab308",
  mack: "#f43f5e",
};

function heat(v: number | null, max: number): string {
  if (v === null) return "transparent";
  const t = Math.min(1, Math.max(0, Math.log10(Math.max(1, v)) / Math.log10(Math.max(10, max))));
  return `rgba(34, 211, 238, ${0.06 + t * 0.5})`;
}

function TriangleTable({ title, origins, cells, ldf, cdf, note }: { title: string; origins: string[]; cells: Array<Array<number | null>>; ldf?: number[]; cdf?: number[]; note: string }) {
  const max = Math.max(1, ...cells.flat().filter((v): v is number => v !== null));
  const cols = cells[0]?.length ?? 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="mono text-[10.5px] tracking-[0.14em] text-slate-400 uppercase">{title}</h4>
        <span className="mono text-[9.5px] text-slate-600">{note}</span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="mono sticky left-0 bg-[#0b1020] px-1.5 py-1 text-left font-medium text-slate-500">origin</th>
              {Array.from({ length: cols }, (_, k) => (
                <th key={k} className="mono px-1.5 py-1 text-right font-medium text-slate-600">
                  {k}
                </th>
              ))}
              <th className="mono px-1.5 py-1 text-right font-medium text-cyan-400">total</th>
            </tr>
          </thead>
          <tbody>
            {origins.map((o, i) => (
              <tr key={o}>
                <td className="mono sticky left-0 bg-[#0b1020] px-1.5 py-0.5 text-left text-slate-400">{o}</td>
                {Array.from({ length: cols }, (_, k) => {
                  const v = cells[i]?.[k] ?? null;
                  return (
                    <td key={k} className="triangle-cell mono border border-slate-800/40 px-1.5 py-0.5 text-right text-slate-200" style={{ background: heat(v, max) }}>
                      {v === null ? "" : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : Math.round(v)}
                    </td>
                  );
                })}
                <td className="mono px-1.5 py-0.5 text-right text-cyan-300">
                  {(() => {
                    const row = cells[i] ?? [];
                    const last = [...row].reverse().find((v) => v !== null && v !== 0);
                    return last ? (last >= 1e6 ? `${(last / 1e6).toFixed(1)}M` : `${(last / 1e3).toFixed(0)}k`) : "—";
                  })()}
                </td>
              </tr>
            ))}
            {ldf && (
              <tr>
                <td className="mono sticky left-0 bg-[#0b1020] px-1.5 py-1 text-left text-amber-300">LDF</td>
                {ldf.map((f, k) => (
                  <td key={k} className="mono border-t border-slate-700 px-1.5 py-1 text-right text-amber-300">
                    {f.toFixed(3)}
                  </td>
                ))}
                <td />
              </tr>
            )}
            {cdf && (
              <tr>
                <td className="mono sticky left-0 bg-[#0b1020] px-1.5 py-1 text-left text-violet-300">CDF</td>
                {cdf.map((f, k) => (
                  <td key={k} className="mono px-1.5 py-1 text-right text-violet-300">
                    {f.toFixed(3)}
                  </td>
                ))}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReservingPanel({ data }: { data: LobReserving[] }) {
  const [lob, setLob] = useState(data[0]?.lob ?? "Motor");
  const [measure, setMeasure] = useState<"paid" | "incurred">("paid");
  const d = data.find((x) => x.lob === lob) ?? data[0];
  if (!d) return null;

  const methodNames = Object.keys(d.methods);
  const comparison = d.origins.map((o, i) => {
    const row: Record<string, string | number> = { origin: o };
    for (const m of methodNames) row[m] = Math.round((d.methods[m][i]?.ibnr ?? 0) / 1e6);
    return row;
  });
  const ultimateTrend = d.origins.map((o, i) => {
    const row: Record<string, string | number> = { origin: o };
    for (const m of methodNames) row[m] = Math.round((d.methods[m][i]?.ultimate ?? 0) / 1e6);
    return row;
  });
  const totalIbnr = d.methods.chain_ladder.reduce((s, r) => s + r.ibnr, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {data.map((x) => (
          <button
            key={x.lob}
            onClick={() => setLob(x.lob)}
            className={`mono rounded border px-2.5 py-1 text-[10.5px] tracking-wide uppercase transition-colors ${lob === x.lob ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"}`}
          >
            {x.lob}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-slate-800" />
        {(["paid", "incurred"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMeasure(m)}
            className={`mono rounded border px-2 py-1 text-[10px] uppercase ${measure === m ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}
          >
            {m} triangle
          </button>
        ))}
        <span className="mono ml-auto text-[10px] text-slate-600">
          IBNR {d.lob}: KSh {(totalIbnr / 1e6).toFixed(1)}M · Mack σ KSh {(d.mackSe / 1e6).toFixed(1)}M · CV {(d.mackCv * 100).toFixed(1)}%
        </span>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <TriangleTable
          title={`${d.lob} — cumulative ${measure} development triangle (KSh)`}
          origins={d.origins}
          cells={measure === "paid" ? d.paid : d.incurred}
          ldf={d.ldf}
          cdf={d.cdf}
          note="volume-weighted link ratios · tail factor 1.000"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <h4 className="mono mb-2 text-[10.5px] tracking-[0.14em] text-slate-400 uppercase">IBNR by origin quarter & method (KSh M)</h4>
          <StackedBars
            data={comparison}
            xKey="origin"
            height={230}
            fmt={(v) => `${v}M`}
            bars={methodNames.map((m) => ({ key: m, name: m.replace("_", " "), color: METHOD_COLORS[m] ?? "#22d3ee" }))}
          />
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <h4 className="mono mb-2 text-[10.5px] tracking-[0.14em] text-slate-400 uppercase">Ultimate claims projection (KSh M)</h4>
          <MultiLine
            data={ultimateTrend}
            xKey="origin"
            height={230}
            yFmt={(v) => `${v}M`}
            lines={methodNames.map((m) => ({ key: m, name: m.replace("_", " "), color: METHOD_COLORS[m] ?? "#22d3ee" }))}
          />
        </div>
      </div>

      <div className="scroll-thin overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40">
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="bg-[#0b1020]">
              {["origin", "method", "paid to date", "ultimate", "IBNR", "Mack σ", "CV", "a-priori LR", "reserve adequacy"].map((h) => (
                <th key={h} className="mono border-b border-slate-800 px-2 py-1.5 text-left font-medium tracking-wider text-slate-500 uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {methodNames.flatMap((m) =>
              d.methods[m].map((r) => (
                <tr key={`${m}-${r.origin}`} className="odd:bg-white/[0.015] hover:bg-cyan-500/5">
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-slate-300">{r.origin}</td>
                  <td className="border-b border-slate-800/50 px-2 py-1">
                    <Badge tone={m === "chain_ladder" ? "cyan" : m === "mack" ? "rose" : m === "cape_cod" ? "gold" : "slate"}>{m.replace("_", " ")}</Badge>
                  </td>
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-slate-300">{Math.round(r.paidToDate).toLocaleString("en-KE")}</td>
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-slate-100">{Math.round(r.ultimate).toLocaleString("en-KE")}</td>
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-amber-300">{Math.round(r.ibnr).toLocaleString("en-KE")}</td>
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-slate-400">{r.se ? Math.round(r.se).toLocaleString("en-KE") : "—"}</td>
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-slate-400">{r.cv ? `${(r.cv * 100).toFixed(1)}%` : "—"}</td>
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-slate-400">{r.apriori ? `${(r.apriori * 100).toFixed(1)}%` : "—"}</td>
                  <td className="mono border-b border-slate-800/50 px-2 py-1 text-slate-400">{r.paidToDate > 0 ? `${((r.ibnr / r.paidToDate) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
