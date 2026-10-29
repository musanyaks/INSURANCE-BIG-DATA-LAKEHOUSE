"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Network, ShieldAlert, Siren, XCircle } from "lucide-react";

export type FraudAlert = {
  alertId: string;
  claimId: string;
  claimKey: string;
  score: number;
  level: string;
  amount: number;
  status: string;
  assignedTo: string | null;
  detectedAt: string;
  modelId: string;
  reasons: Array<{ feature: string; label: string; detail: string; contribution: number; value: number }>;
  features: Record<string, number>;
  networkLinks: Array<{ from: string; to: string; type: string; weight: number }>;
  latencyMs: number;
  detectionMode: string;
  county: string | null;
};

const LEVEL_STYLE: Record<string, string> = {
  CRITICAL: "border-rose-500/50 bg-rose-500/15 text-rose-200",
  HIGH: "border-orange-500/50 bg-orange-500/15 text-orange-200",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  LOW: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};
const LEVEL_DOT: Record<string, string> = { CRITICAL: "#fb7185", HIGH: "#fb923c", MEDIUM: "#fbbf24", LOW: "#34d399" };

function scoreColor(s: number) {
  return s >= 0.85 ? "#fb7185" : s >= 0.65 ? "#fb923c" : s >= 0.4 ? "#fbbf24" : "#34d399";
}

function NetworkGraph({ links, center }: { links: FraudAlert["networkLinks"]; center: string }) {
  const nodes = useMemo(() => {
    const set = new Map<string, { type: string; weight: number }>();
    for (const l of links) {
      const [fromType, toType] = l.type.split("→");
      if (!set.has(l.from)) set.set(l.from, { type: fromType, weight: l.weight });
      if (!set.has(l.to)) set.set(l.to, { type: toType, weight: l.weight });
    }
    if (!set.has(center)) set.set(center, { type: "claimant", weight: 1 });
    return [...set.entries()].map(([id, meta], i, arr) => {
      const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
      const r = id === center ? 0 : 96;
      return { id, ...meta, x: 150 + Math.cos(angle) * r, y: 110 + Math.sin(angle) * r };
    });
  }, [links, center]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const colorFor = (t: string) => (t.includes("provider") ? "#fb7185" : t.includes("vehicle") ? "#22d3ee" : t.includes("ring") ? "#a78bfa" : "#eab308");

  return (
    <svg viewBox="0 0 300 220" className="h-[220px] w-full">
      {links.map((l, i) => {
        const a = byId.get(l.from);
        const b = byId.get(l.to);
        if (!a || !b) return null;
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorFor(l.type)} strokeWidth={Math.min(3, 0.8 + l.weight / 6)} opacity={0.55} className="flow-line" />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} fontSize={7.5} fill="#64748b" textAnchor="middle" className="mono">
              {l.type}
            </text>
          </g>
        );
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.id === center ? 20 : 15 + Math.min(9, n.weight / 3)} fill="#0b1020" stroke={colorFor(n.type)} strokeWidth={1.6} />
          <text x={n.x} y={n.y + 3} fontSize={7.6} fill="#e2e8f0" textAnchor="middle" className="mono">
            {n.id.length > 9 ? n.id.slice(0, 9) : n.id}
          </text>
          <text x={n.x} y={n.y + 26} fontSize={7} fill="#64748b" textAnchor="middle" className="mono">
            {n.type}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function FraudConsole({ alerts, initialAlertId }: { alerts: FraudAlert[]; initialAlertId?: string }) {
  const [filter, setFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(initialAlertId ?? alerts[0]?.alertId ?? "");
  const [local, setLocal] = useState<Record<string, { status: string; assignedTo: string | null }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialAlertId && alerts.some((a) => a.alertId === initialAlertId)) setSelectedId(initialAlertId);
  }, [initialAlertId, alerts]);

  const filtered = alerts.filter((a) => (filter === "ALL" || a.level === filter) && (query === "" || a.claimId.toLowerCase().includes(query.toLowerCase()) || a.alertId.toLowerCase().includes(query.toLowerCase()) || (a.county ?? "").toLowerCase().includes(query.toLowerCase())));
  const selected = alerts.find((a) => a.alertId === selectedId) ?? alerts[0];
  const status = selected ? (local[selected.alertId]?.status ?? selected.status) : "";
  const assignee = selected ? (local[selected.alertId]?.assignedTo ?? selected.assignedTo) : null;

  const update = async (newStatus: string, newAssignee?: string) => {
    if (!selected) return;
    setBusy(true);
    setLocal((l) => ({ ...l, [selected.alertId]: { status: newStatus, assignedTo: newAssignee ?? l[selected.alertId]?.assignedTo ?? selected.assignedTo } }));
    try {
      await fetch("/api/fraud", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ alertId: selected.alertId, status: newStatus, assignedTo: newAssignee }) });
    } catch {
      /* keep optimistic state */
    }
    setBusy(false);
  };

  if (!selected) return <p className="py-8 text-center text-[12px] text-slate-500">No fraud alerts in the mart yet.</p>;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <div className="panel flex h-full flex-col">
          <div className="border-b border-slate-800/70 p-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-rose-400" />
              <h3 className="mono text-[11px] tracking-[0.14em] text-slate-300 uppercase">SIU alert queue</h3>
              <span className="mono ml-auto text-[10px] text-slate-500">{filtered.length} of {alerts.length}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((l) => (
                <button key={l} onClick={() => setFilter(l)} className={`mono rounded border px-1.5 py-0.5 text-[9.5px] uppercase ${filter === l ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
                  {l}
                </button>
              ))}
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search claim, alert or county…" className="mono mt-2 w-full rounded border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-500/60" />
          </div>
          <div className="scroll-thin max-h-[620px] flex-1 overflow-y-auto p-2">
            {filtered.map((a) => {
              const st = local[a.alertId]?.status ?? a.status;
              return (
                <button
                  key={a.alertId}
                  onClick={() => setSelectedId(a.alertId)}
                  className={`mb-1.5 w-full rounded-lg border p-2.5 text-left transition-colors ${a.alertId === selected.alertId ? "border-cyan-500/50 bg-cyan-500/10" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11.5px] text-slate-100">{a.claimId}</span>
                    <span className={`mono ml-auto rounded border px-1.5 py-0.5 text-[9.5px] uppercase ${LEVEL_STYLE[a.level]}`}>{a.level}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${a.score * 100}%`, background: scoreColor(a.score) }} />
                    </div>
                    <span className="mono text-[11px] font-semibold" style={{ color: scoreColor(a.score) }}>
                      {(a.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mono mt-1.5 flex items-center justify-between gap-2 text-[9.5px] text-slate-500">
                    <span className="truncate">{a.county ?? "—"} · KSh {a.amount.toLocaleString("en-KE")}</span>
                    <span className="truncate">{st}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 xl:col-span-8">
        <div className="panel p-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="text-center">
              <p className="mono text-[46px] leading-none font-bold" style={{ color: scoreColor(selected.score) }}>
                {(selected.score * 100).toFixed(1)}%
              </p>
              <p className="mono mt-1 text-[10px] tracking-wider text-slate-500 uppercase">fraud probability</p>
              <span className={`mono mt-2 inline-block rounded border px-2.5 py-1 text-[11px] tracking-[0.18em] uppercase ${LEVEL_STYLE[selected.level]}`}>{selected.level}</span>
            </div>
            <div className="min-w-[220px] flex-1">
              <div className="mono grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {[
                  ["alert", selected.alertId],
                  ["claim", selected.claimId],
                  ["county", selected.county ?? "—"],
                  ["amount at risk", `KSh ${selected.amount.toLocaleString("en-KE")}`],
                  ["model", selected.modelId],
                  ["detection", `${selected.detectionMode} · ${selected.latencyMs} ms`],
                  ["detected", new Date(selected.detectedAt).toISOString().slice(0, 19).replace("T", " ")],
                  ["assigned", assignee ?? "unassigned"],
                ].map(([k, v]) => (
                  <p key={k} className="truncate">
                    <span className="text-slate-600">{k}:</span> <span className="text-slate-200">{String(v)}</span>
                  </p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  { label: "Open investigation", status: "Investigation opened", icon: <Siren size={12} />, tone: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
                  { label: "Refer to SIU", status: "Referred to SIU", icon: <Network size={12} />, tone: "border-violet-500/40 bg-violet-500/10 text-violet-200" },
                  { label: "Confirm fraud", status: "Fraud confirmed", icon: <XCircle size={12} />, tone: "border-rose-500/40 bg-rose-500/10 text-rose-200" },
                  { label: "Clear — no action", status: "Cleared - no action", icon: <CheckCircle2 size={12} />, tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" },
                ].map((b) => (
                  <button key={b.status} disabled={busy || status === b.status} onClick={() => update(b.status)} className={`mono flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] uppercase transition-opacity disabled:opacity-40 ${b.tone}`}>
                    {b.icon} {b.label}
                  </button>
                ))}
                <span className="mono ml-auto self-center text-[10px] text-slate-500">status: <span className="text-slate-300">{status}</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="panel p-4">
            <h4 className="mono mb-2 text-[10.5px] tracking-[0.14em] text-rose-300 uppercase">Why this claim was flagged</h4>
            <div className="space-y-2">
              {selected.reasons.map((r) => (
                <div key={r.feature} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] text-slate-100">{r.label}</span>
                    <span className="mono shrink-0 text-[10px] text-rose-300">+{(r.contribution * 100).toFixed(0)}% log-odds</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">{r.detail}</p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${Math.min(100, r.contribution * 34)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="panel p-4">
              <h4 className="mono mb-1 text-[10.5px] tracking-[0.14em] text-violet-300 uppercase">Entity network</h4>
              <NetworkGraph links={selected.networkLinks} center={selected.claimId.startsWith("CLM") ? selected.networkLinks[0]?.from ?? selected.claimId : selected.claimId} />
              <p className="mono text-[9.5px] leading-relaxed text-slate-500">
                Graph features from fraud-graph-community (Louvain + PageRank): claimant, provider, vehicle and shared-document edges. Providers with degree &gt; 20 and rejection rate &gt; 20% are ring candidates.
              </p>
            </div>

            <div className="panel p-4">
              <h4 className="mono mb-2 text-[10.5px] tracking-[0.14em] text-cyan-300 uppercase">Feature snapshot (19)</h4>
              <div className="mono grid max-h-[210px] grid-cols-1 gap-x-4 gap-y-0.5 overflow-auto text-[10px] sm:grid-cols-2">
                {Object.entries(selected.features).map(([k, v]) => (
                  <p key={k} className="flex justify-between gap-2 border-b border-slate-800/50 py-0.5">
                    <span className="truncate text-slate-500">{k}</span>
                    <span className="shrink-0 text-slate-200">{typeof v === "number" ? (Math.abs(v) > 1000 ? Math.round(v).toLocaleString("en-KE") : Number(v).toFixed(3)) : String(v)}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
