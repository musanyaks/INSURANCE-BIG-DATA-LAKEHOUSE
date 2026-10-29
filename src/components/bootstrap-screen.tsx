"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Radio } from "lucide-react";

type Progress = { running: boolean; done: boolean; stage: string; pct: number; message: string; error: string | null; stats: Record<string, string | number> | null };

const STAGES = [
  { key: "provision", label: "Provision Iceberg tables", detail: "bronze / silver / gold namespaces on S3 (MinIO)" },
  { key: "generate", label: "Simulate Kenyan source systems", detail: "policy admin, M-PESA Daraja, IoT gateway, CRM CDC, KNBS/KMD external" },
  { key: "ingest", label: "Stream into Bronze", detail: "Kafka topics → Spark Structured Streaming → append-only Iceberg" },
  { key: "silver", label: "Cleanse into Silver", detail: "dedupe · type coercion · FK validation · entity resolution · quarantine" },
  { key: "ml", label: "Train & register models", detail: "fraud GLM + isolation forest ensemble, churn, Tweedie pricing" },
  { key: "gold", label: "Build Gold marts", detail: "fact_claims · fact_premiums · fact_payments · fact_fraud_events" },
  { key: "actuarial", label: "Run actuarial models", detail: "development triangles · chain ladder · Mack · BF · Cape Cod" },
  { key: "governance", label: "Publish governance", detail: "Great Expectations · lineage · catalog · SCD history · schema evolution" },
  { key: "complete", label: "Control centre ready", detail: "Trino serving marts to the executive dashboard" },
];

export function BootstrapScreen() {
  const router = useRouter();
  const [p, setP] = useState<Progress>({ running: false, done: false, stage: "idle", pct: 0, message: "Starting", error: null, stats: null });
  const started = useRef(false);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/bootstrap", { cache: "no-store" });
      const j = (await r.json()) as Progress;
      setP(j);
      if (j.done) {
        setTimeout(() => router.refresh(), 900);
        return true;
      }
    } catch {
      /* retry */
    }
    return false;
  }, [router]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const boot = async () => {
      if (!started.current) {
        started.current = true;
        await fetch("/api/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }).catch(() => null);
      }
      const done = await poll();
      if (!done) timer = setInterval(async () => {
        const finished = await poll();
        if (finished) clearInterval(timer);
      }, 900);
    };
    boot();
    return () => clearInterval(timer);
  }, [poll]);

  const currentIdx = Math.max(0, STAGES.findIndex((s) => s.key === p.stage));

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center bg-[#05070e] px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/25">
            <Boxes size={23} />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">
              INSURE<span className="text-cyan-400">LAKE</span>
            </h1>
            <p className="mono text-[10.5px] tracking-[0.18em] text-slate-500 uppercase">Enterprise Insurance Big Data Lakehouse · provisioning</p>
          </div>
        </div>

        <div className="panel relative overflow-hidden p-5">
          <div className="sweep pointer-events-none absolute inset-0 opacity-40" />
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 text-[12.5px] text-slate-300">
              <Radio size={14} className="text-cyan-400 blip" />
              {p.error ? <span className="text-rose-300">{p.error}</span> : p.message}
            </p>
            <span className="mono text-2xl font-semibold text-cyan-300">{p.pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-500" style={{ width: `${p.pct}%` }} />
          </div>

          <ol className="mt-5 space-y-2">
            {STAGES.map((s, i) => {
              const state = i < currentIdx || p.done ? "done" : i === currentIdx ? "active" : "todo";
              return (
                <li key={s.key} className="flex items-start gap-3">
                  <span
                    className={`mono mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${
                      state === "done"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : state === "active"
                          ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 blip"
                          : "border-slate-700 bg-slate-800/40 text-slate-600"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[12.5px] ${state === "todo" ? "text-slate-600" : "text-slate-200"}`}>{s.label}</span>
                    <span className="mono block truncate text-[10.5px] text-slate-500">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          {p.stats && (
            <div className="mono mt-5 grid grid-cols-2 gap-2 border-t border-slate-800 pt-4 text-[11px] text-slate-400 sm:grid-cols-4">
              {Object.entries(p.stats)
                .filter(([k]) => k !== "seededAt")
                .map(([k, v]) => (
                  <span key={k} className="truncate">
                    <span className="text-slate-600">{k.replace(/_/g, " ")}:</span> {typeof v === "number" ? v.toLocaleString("en-KE") : v}
                  </span>
                ))}
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-600">
          Seeding 36 months of Kenyan motor, health, life, micro & agriculture insurance data — policies, M-PESA payments, claims, telematics, providers and agents.
        </p>
      </div>
    </div>
  );
}
