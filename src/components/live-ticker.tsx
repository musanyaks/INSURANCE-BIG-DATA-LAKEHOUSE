"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

type Ticker = {
  throughput: Array<{ topic: string; eps: number; lag: number; p95: number; offset: number }>;
  events: Array<{ eventId: string; topic: string; source: string; ts: string; bytes: number; mode: string; claimId: string | null; amount: string | null }>;
  alerts: Array<{ alertId: string; claimId: string; score: number; level: string; amount: number; status: string; detectedAt: string; mode: string }>;
  ts: string;
};

const levelTone: Record<string, string> = {
  CRITICAL: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  HIGH: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  MEDIUM: "text-amber-200 border-amber-500/40 bg-amber-500/10",
  LOW: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
};

export function LiveEventTicker() {
  const [data, setData] = useState<Ticker | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/stream/metrics", { cache: "no-store" });
        const j = (await r.json()) as Ticker;
        if (alive) setData(j);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const totalEps = (data?.throughput ?? []).reduce((s, t) => s + t.eps, 0);

  return (
    <div className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-slate-200 uppercase">
          <Radio size={13} className="text-cyan-400 blip" /> Live lakehouse event stream
        </h2>
        <span className="mono text-[10.5px] text-slate-500">
          {totalEps.toFixed(0)} events/s across {data?.throughput.length ?? 0} topics
        </span>
      </header>
      <div className="scroll-thin max-h-[330px] overflow-y-auto">
        {(data?.events ?? []).map((e, i) => (
          <div key={e.eventId + i} className="rise flex items-center gap-3 border-b border-slate-800/50 px-4 py-1.5 text-[11px] hover:bg-cyan-500/5">
            <span className="mono w-[62px] shrink-0 text-slate-600">{e.ts.slice(11, 19)}</span>
            <span className="mono w-[150px] shrink-0 truncate text-cyan-400/90">{e.topic}</span>
            <span className="mono min-w-0 flex-1 truncate text-slate-400">
              {e.eventId} · {e.source} · {e.bytes}B
              {e.claimId ? ` · ${e.claimId}` : ""}
              {e.amount ? ` · KSh ${Number(e.amount).toLocaleString("en-KE")}` : ""}
            </span>
            <span className={`mono shrink-0 rounded border px-1.5 py-0.5 text-[9.5px] uppercase ${e.mode === "streaming" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : e.mode === "cdc" ? "border-violet-500/30 bg-violet-500/10 text-violet-300" : "border-slate-600/50 bg-slate-700/20 text-slate-400"}`}>
              {e.mode}
            </span>
          </div>
        ))}
        {!data && <p className="px-4 py-6 text-center text-[11px] text-slate-500">Connecting to Kafka consumer…</p>}
      </div>
      {data && data.alerts.length > 0 && (
        <div className="border-t border-slate-800/70 bg-rose-500/[0.03] px-4 py-2">
          <p className="mono mb-1.5 text-[9.5px] tracking-[0.18em] text-rose-300/80 uppercase">insurance.fraud_alerts</p>
          <div className="flex flex-wrap gap-1.5">
            {data.alerts.slice(0, 5).map((a) => (
              <Link key={a.alertId} href={`/fraud?alert=${a.alertId}`} className={`mono rounded border px-1.5 py-0.5 text-[10px] ${levelTone[a.level] ?? levelTone.LOW}`}>
                {a.claimId} · {(a.score * 100).toFixed(1)}%
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
