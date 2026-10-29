"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Cpu, Radio, ShieldAlert, Zap } from "lucide-react";

export type Scenario = "routine" | "suspicious" | "fraud_ring" | "duplicate" | "staged_accident" | "first_premium";

type TraceStage = { id: string; stage: string; system: string; detail: string; durationMs: number; status: string; output: Record<string, string | number | null> };

type IntakeResult = {
  claimId: string;
  bronzeEventId: string;
  kafka: { topic: string; partition: number; offset: number };
  score: number;
  level: string;
  reasons: Array<{ feature: string; label: string; detail: string; contribution: number; value: number }>;
  features: Record<string, number>;
  alertId: string | null;
  trace: TraceStage[];
  totalMs: number;
  ibnrImpact: number;
  ultimate: number;
  claim: Record<string, string | number | null>;
  policy: Record<string, string | number | null>;
};

const SCENARIOS: Array<{ key: Scenario; label: string; hint: string; tone: string }> = [
  { key: "routine", label: "Routine motor claim", hint: "Genuine own-damage FNOL from the mobile app", tone: "emerald" },
  { key: "suspicious", label: "Large late-reported claim", hint: "Amount 3.4× the segment baseline, reported next day", tone: "amber" },
  { key: "fraud_ring", label: "Provider-linked ring", hint: "Rogue provider with prior flagged claimants", tone: "rose" },
  { key: "duplicate", label: "Duplicate documentation", hint: "Same invoices as an already settled claim", tone: "rose" },
  { key: "staged_accident", label: "Staged accident", hint: "Telematics show no harsh event at incident time", tone: "orange" },
  { key: "first_premium", label: "First-premium claim", hint: "Claim on day 0 of policy inception", tone: "amber" },
];

const TONES: Record<string, string> = {
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
  rose: "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20",
};

const LEVEL_TONE: Record<string, string> = {
  CRITICAL: "border-rose-500/50 bg-rose-500/15 text-rose-200",
  HIGH: "border-orange-500/50 bg-orange-500/15 text-orange-200",
  MEDIUM: "border-amber-500/50 bg-amber-500/15 text-amber-200",
  LOW: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
};

export function StreamConsole() {
  const [scenario, setScenario] = useState<Scenario>("fraud_ring");
  const [amount, setAmount] = useState<string>("");
  const [county, setCounty] = useState<string>("");
  const [via, setVia] = useState<string>("Mobile app");
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [history, setHistory] = useState<Array<{ claimId: string; score: number; level: string; totalMs: number; at: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const fire = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setRevealed(0);
    try {
      const r = await fetch("/api/stream/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario, amount: amount ? Number(amount) : undefined, countyCode: county || undefined, reportedVia: via }),
      });
      const j = (await r.json()) as IntakeResult & { error?: string };
      if (j.error) {
        setError(j.error);
        setRunning(false);
        return;
      }
      setResult(j);
      setHistory((h) => [{ claimId: j.claimId, score: j.score, level: j.level, totalMs: j.totalMs, at: new Date().toLocaleTimeString("en-KE", { hour12: false }) }, ...h].slice(0, 6));
      // reveal the trace stage-by-stage, paced on the real measured durations
      const total = j.trace.reduce((s, t) => s + Math.max(120, t.durationMs), 0);
      const budget = Math.min(4200, Math.max(1600, total));
      let acc = 0;
      j.trace.forEach((t, i) => {
        acc += (Math.max(120, t.durationMs) / total) * budget;
        setTimeout(() => setRevealed(i + 1), acc);
      });
      setTimeout(() => setRunning(false), acc + 120);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
      setRunning(false);
    }
  };

  const done = result && revealed >= (result?.trace.length ?? 0);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="space-y-3 xl:col-span-4">
        <div className="panel p-4">
          <h3 className="mono flex items-center gap-2 text-[11px] tracking-[0.16em] text-cyan-300 uppercase">
            <Radio size={13} /> 1 · claim event generator
          </h3>
          <p className="mt-1.5 text-[11.5px] text-slate-400">Fire a first-notice-of-loss into the production intake path. The event traverses every layer for real — no mocks.</p>
          <div className="mt-3 space-y-1.5">
            {SCENARIOS.map((s) => (
              <button
                key={s.key}
                onClick={() => setScenario(s.key)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${scenario === s.key ? TONES[s.tone] : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}
              >
                <span className="block text-[12px] font-medium">{s.label}</span>
                <span className="mono block text-[10px] opacity-75">{s.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">claim amount (KSh)</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="auto" className="mono mt-1 w-full rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-[11.5px] text-slate-200 outline-none focus:border-cyan-500/60" />
            </label>
            <label className="block">
              <span className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">county code</span>
              <input value={county} onChange={(e) => setCounty(e.target.value.slice(0, 3))} placeholder="auto" className="mono mt-1 w-full rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-[11.5px] text-slate-200 outline-none focus:border-cyan-500/60" />
            </label>
            <label className="col-span-2 block">
              <span className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">reported via</span>
              <select value={via} onChange={(e) => setVia(e.target.value)} className="mono mt-1 w-full rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-[11.5px] text-slate-200 outline-none focus:border-cyan-500/60">
                {["Mobile app", "USSD *310#", "Call centre", "Branch", "WhatsApp", "Broker portal"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={fire} disabled={running} className="mono mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-2.5 text-[12px] font-semibold tracking-wide text-slate-950 uppercase transition-opacity disabled:opacity-50">
            <Zap size={14} /> {running ? "streaming…" : "fire claim into the platform"}
          </button>
          {error && <p className="mono mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[10.5px] text-rose-200">{error}</p>}
        </div>

        {history.length > 0 && (
          <div className="panel p-3">
            <h3 className="mono mb-2 text-[10px] tracking-[0.16em] text-slate-500 uppercase">session runs</h3>
            <div className="space-y-1">
              {history.map((h) => (
                <div key={h.claimId + h.at} className="mono flex items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-2 py-1 text-[10.5px]">
                  <span className="text-slate-500">{h.at}</span>
                  <span className="text-slate-300">{h.claimId}</span>
                  <span className={`ml-auto rounded border px-1.5 py-0.5 ${LEVEL_TONE[h.level]}`}>{(h.score * 100).toFixed(1)}% {h.level}</span>
                  <span className="text-slate-500">{h.totalMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 xl:col-span-5">
        <div className="panel p-4">
          <h3 className="mono flex items-center gap-2 text-[11px] tracking-[0.16em] text-cyan-300 uppercase">
            <Cpu size={13} /> 2 · end-to-end pipeline trace
          </h3>
          {!result && <p className="mt-6 text-center text-[11.5px] text-slate-500">Fire a claim to watch it traverse API → Kafka → Bronze → Silver → features → ML → Gold → BI.</p>}
          {result && (
            <ol className="mt-3 space-y-1.5">
              {result.trace.slice(0, revealed).map((t, i) => (
                <li key={t.id} className="rise rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`mono grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9.5px] ${t.status === "warn" ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : t.status === "error" ? "border-rose-500/50 bg-rose-500/15 text-rose-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-medium text-slate-100">{t.stage}</span>
                    <span className="mono ml-auto text-[10px] text-slate-500">{t.durationMs} ms</span>
                  </div>
                  <p className="mono mt-1 pl-7 text-[10px] text-cyan-400/80">{t.system}</p>
                  <p className="mt-0.5 pl-7 text-[11px] text-slate-400">{t.detail}</p>
                  {Object.keys(t.output).length > 0 && (
                    <div className="mono mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 pl-7 text-[10px] text-slate-500 sm:grid-cols-2">
                      {Object.entries(t.output).map(([k, v]) => (
                        <span key={k} className="truncate">
                          <span className="text-slate-600">{k}:</span> <span className="text-slate-300">{String(v ?? "—")}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {revealed < result.trace.length && (
                <li className="mono flex items-center gap-2 pl-1 text-[10.5px] text-cyan-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 blip" /> processing stage {revealed + 1} of {result.trace.length}…
                </li>
              )}
            </ol>
          )}
        </div>
      </div>

      <div className="space-y-3 xl:col-span-3">
        <div className={`panel relative overflow-hidden p-4 ${done && result && result.score >= 0.65 ? "border-rose-500/40" : ""}`}>
          <h3 className="mono flex items-center gap-2 text-[11px] tracking-[0.16em] text-rose-300 uppercase">
            <ShieldAlert size={13} /> 3 · verdict
          </h3>
          {!result || !done ? (
            <p className="mt-6 text-center text-[11.5px] text-slate-500">Awaiting model score…</p>
          ) : (
            <>
              <div className="mt-3 text-center">
                <p className="mono text-[42px] leading-none font-bold" style={{ color: result.score >= 0.85 ? "#fb7185" : result.score >= 0.65 ? "#fb923c" : result.score >= 0.4 ? "#fbbf24" : "#34d399" }}>
                  {(result.score * 100).toFixed(1)}%
                </p>
                <p className="mono mt-1 text-[11px] text-slate-400">fraud probability</p>
                <span className={`mono mt-2 inline-block rounded border px-2.5 py-1 text-[11px] tracking-[0.18em] uppercase ${LEVEL_TONE[result.level]}`}>{result.level}</span>
              </div>
              <div className="mono mt-3 space-y-1 border-t border-slate-800 pt-3 text-[10.5px] text-slate-400">
                <p>claim: <span className="text-slate-200">{result.claimId}</span></p>
                <p>alert: <span className="text-slate-200">{result.alertId ?? "not raised"}</span></p>
                <p>kafka: <span className="text-slate-200">{result.kafka.topic} p{result.kafka.partition} @ {result.kafka.offset}</span></p>
                <p>bronze: <span className="text-slate-200">{result.bronzeEventId}</span></p>
                <p>end-to-end: <span className="text-cyan-300">{result.totalMs} ms</span></p>
                <p>IBNR impact: <span className="text-amber-300">KSh {result.ibnrImpact.toLocaleString("en-KE")}</span></p>
              </div>
              <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
                <p className="mono text-[9.5px] tracking-wider text-slate-500 uppercase">why — additive model contributions</p>
                {result.reasons.map((r) => (
                  <div key={r.feature} className="rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-slate-200">{r.label}</span>
                      <span className="mono shrink-0 text-[10px] text-rose-300">+{(r.contribution * 100).toFixed(0)}%</span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{r.detail}</p>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${Math.min(100, r.contribution * 34)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {result.alertId && (
                <Link href={`/fraud?alert=${result.alertId}`} className="mono mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-200 hover:bg-cyan-500/20">
                  open investigation <ArrowRight size={12} />
                </Link>
              )}
            </>
          )}
        </div>

        {result && (
          <div className="panel p-3">
            <p className="mono mb-2 text-[9.5px] tracking-wider text-slate-500 uppercase">event payload (bronze)</p>
            <pre className="mono scroll-thin max-h-[220px] overflow-auto rounded bg-slate-950/70 p-2 text-[10px] leading-relaxed text-slate-300">{JSON.stringify(result.claim, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
