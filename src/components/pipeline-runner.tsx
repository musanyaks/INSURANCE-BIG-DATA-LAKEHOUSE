"use client";

import { useState } from "react";
import { Play } from "lucide-react";

type RunResult = {
  ok: boolean;
  run: { runId: string; dagId: string; taskName: string; layer: string; engine: string; status: string; mode: string; durationMs: number; recordsIn: number; recordsOut: number; recordsRejected: number; watermark: string };
  incremental: { watermark: string; newRecords: number; newBytes: number; rejected: number; note: string };
};

export function PipelineRunner({ dags }: { dags: Array<{ dag: string; layer: string; engine: string; mode: string }> }) {
  const [dagId, setDagId] = useState(dags[0]?.dag ?? "");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setLog((l) => [`[${new Date().toLocaleTimeString("en-KE", { hour12: false })}] airflow trigger_dag ${dagId} — logical_date=${new Date().toISOString().slice(0, 10)}`, ...l].slice(0, 12));
    try {
      const r = await fetch("/api/pipeline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dagId }) });
      const j = (await r.json()) as RunResult;
      setResult(j);
      setLog((l) => [
        `[${new Date().toLocaleTimeString("en-KE", { hour12: false })}] ${j.run.taskName}: watermark=${j.incremental.watermark} new=${j.incremental.newRecords} rejected=${j.incremental.rejected} duration=${j.run.durationMs}ms → ${j.run.status}`,
        ...l,
      ].slice(0, 12));
    } catch (e) {
      setLog((l) => [`error: ${e instanceof Error ? e.message : "run failed"}`, ...l].slice(0, 12));
    }
    setRunning(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[280px] flex-1">
          <span className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">airflow dag</span>
          <select value={dagId} onChange={(e) => setDagId(e.target.value)} className="mono mt-1 w-full rounded border border-slate-700 bg-slate-950/70 px-2 py-2 text-[11.5px] text-slate-200 outline-none focus:border-cyan-500/60">
            {dags.map((d) => (
              <option key={d.dag} value={d.dag}>
                {d.dag} · {d.layer} · {d.engine}
              </option>
            ))}
          </select>
        </label>
        <button onClick={run} disabled={running} className="mono flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-[11.5px] font-semibold tracking-wide text-slate-950 uppercase disabled:opacity-50">
          <Play size={13} /> {running ? "running…" : "trigger run"}
        </button>
      </div>

      {result && (
        <div className="rise grid gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 md:grid-cols-4">
          {[
            ["status", result.run.status],
            ["records in", result.run.recordsIn.toLocaleString("en-KE")],
            ["records out", result.run.recordsOut.toLocaleString("en-KE")],
            ["rejected / quarantined", result.run.recordsRejected.toLocaleString("en-KE")],
            ["duration", `${result.run.durationMs} ms`],
            ["watermark", result.incremental.watermark],
            ["new bytes", `${(result.incremental.newBytes / 1024).toFixed(1)} KB`],
            ["mode", result.run.mode],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">{k}</p>
              <p className="mono text-[11.5px] text-slate-100">{String(v)}</p>
            </div>
          ))}
          <p className="mono text-[10px] text-emerald-300/80 md:col-span-4">{result.incremental.note}</p>
        </div>
      )}

      {log.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <p className="mono mb-1 text-[9.5px] tracking-wider text-slate-500 uppercase">airflow task log</p>
          {log.map((l, i) => (
            <p key={i} className="mono truncate text-[10.5px] text-slate-400">
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
