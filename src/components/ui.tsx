import type { ReactNode } from "react";
import {
  Activity,
  Database,
  Gauge,
  GitBranch,
  Layers,
  LayoutDashboard,
  LineChart,
  Radio,
  ShieldAlert,
  Workflow,
} from "lucide-react";

export const NAV = [
  { href: "/", label: "Executive Control", icon: LayoutDashboard, group: "Decide" },
  { href: "/lakehouse", label: "Lakehouse Explorer", icon: Layers, group: "Data" },
  { href: "/pipelines", label: "Orchestration", icon: Workflow, group: "Data" },
  { href: "/streaming", label: "Real-time Streaming", icon: Radio, group: "Data" },
  { href: "/actuarial", label: "Actuarial Intelligence", icon: LineChart, group: "Intelligence" },
  { href: "/fraud", label: "Fraud Console", icon: ShieldAlert, group: "Intelligence" },
  { href: "/models", label: "Model Registry", icon: Activity, group: "Intelligence" },
  { href: "/governance", label: "Governance & Lineage", icon: GitBranch, group: "Trust" },
  { href: "/architecture", label: "Architecture", icon: Database, group: "Trust" },
];

export function Panel({ children, className = "", title, subtitle, right, accent }: { children: ReactNode; className?: string; title?: string; subtitle?: string; right?: ReactNode; accent?: string }) {
  return (
    <section className={`panel panel-hover relative overflow-hidden ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800/70 px-4 py-3">
          <div>
            {title && (
              <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-slate-100 uppercase">
                {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, delta, tone = "cyan", icon }: { label: string; value: string; sub?: string; delta?: { value: string; up: boolean }; tone?: "cyan" | "gold" | "rose" | "emerald" | "slate"; icon?: ReactNode }) {
  const tones: Record<string, string> = {
    cyan: "text-cyan-300 border-cyan-500/25 from-cyan-500/10",
    gold: "text-amber-300 border-amber-500/25 from-amber-500/10",
    rose: "text-rose-300 border-rose-500/25 from-rose-500/10",
    emerald: "text-emerald-300 border-emerald-500/25 from-emerald-500/10",
    slate: "text-slate-200 border-slate-600/40 from-slate-500/10",
  };
  return (
    <div className={`panel panel-hover relative bg-gradient-to-br to-transparent p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium tracking-[0.14em] text-slate-400 uppercase">{label}</span>
        {icon && <span className="opacity-60">{icon}</span>}
      </div>
      <div className="mono mt-2 text-[26px] leading-none font-semibold text-slate-50">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {delta && (
          <span className={`mono rounded border px-1.5 py-0.5 ${delta.up ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
            {delta.up ? "▲" : "▼"} {delta.value}
          </span>
        )}
        {sub && <span className="text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "cyan" | "gold" | "rose" | "emerald" | "bronze" | "silver" }) {
  const tones: Record<string, string> = {
    slate: "border-slate-600/50 bg-slate-500/10 text-slate-300",
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    gold: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    bronze: "border-orange-700/50 bg-orange-800/20 text-orange-300",
    silver: "border-slate-400/40 bg-slate-400/10 text-slate-200",
  };
  return <span className={`mono inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tracking-wide whitespace-nowrap uppercase ${tones[tone]}`}>{children}</span>;
}

export function LayerTag({ layer }: { layer: string }) {
  const map: Record<string, { tone: "bronze" | "silver" | "gold" | "cyan" | "slate"; label: string }> = {
    bronze: { tone: "bronze", label: "🥉 bronze" },
    silver: { tone: "silver", label: "🥈 silver" },
    gold: { tone: "gold", label: "🥇 gold" },
    ml: { tone: "cyan", label: "ml" },
    actuarial: { tone: "gold", label: "actuarial" },
    governance: { tone: "emerald" as never, label: "governance" },
    bi: { tone: "cyan", label: "bi" },
    stream: { tone: "cyan", label: "stream" },
    source: { tone: "slate", label: "source" },
    lake: { tone: "bronze", label: "lake" },
  };
  const m = map[layer] ?? { tone: "slate" as const, label: layer };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function DataTable<T extends Record<string, unknown>>({ rows, columns, dense = true, maxHeight, render }: { rows: T[]; columns?: string[]; dense?: boolean; maxHeight?: number; render?: (row: T, i: number) => ReactNode }) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  if (!rows.length) return <p className="py-6 text-center text-xs text-slate-500">No rows</p>;
  return (
    <div className="scroll-thin overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className={`w-full border-collapse text-left ${dense ? "text-[11px]" : "text-xs"}`}>
        <thead className="sticky top-0 z-10 bg-[#0b1020]/95 backdrop-blur">
          <tr>
            {cols.map((c) => (
              <th key={c} className="mono border-b border-slate-800 px-2 py-2 font-medium tracking-wider text-slate-500 uppercase">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {render
            ? rows.map((r, i) => <tr key={i}>{render(r, i)}</tr>)
            : rows.map((r, i) => (
                <tr key={i} className="odd:bg-white/[0.015] hover:bg-cyan-500/5">
                  {cols.map((c) => (
                    <td key={c} className="mono border-b border-slate-800/60 px-2 py-1.5 whitespace-nowrap text-slate-300">
                      {fmt(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

export function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v % 1 === 0 ? v.toLocaleString("en-KE") : v.toLocaleString("en-KE", { maximumFractionDigits: 2 });
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v);
}

export function Bar({ value, max, tone = "cyan", label, right }: { value: number; max: number; tone?: string; label?: string; right?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tones: Record<string, string> = {
    cyan: "bg-cyan-400/70",
    gold: "bg-amber-400/70",
    rose: "bg-rose-400/70",
    emerald: "bg-emerald-400/70",
    bronze: "bg-orange-500/70",
    slate: "bg-slate-400/60",
  };
  return (
    <div className="group">
      {(label || right) && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
          <span className="truncate text-slate-300">{label}</span>
          <span className="mono shrink-0 text-slate-400">{right}</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
        <div className={`h-full rounded-full ${tones[tone] ?? tones.cyan}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function MetricRow({ label, value, tone = "text-slate-100" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/50 py-1.5 last:border-0">
      <span className="text-[11.5px] text-slate-400">{label}</span>
      <span className={`mono text-[12.5px] font-medium ${tone}`}>{value}</span>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, icon }: { eyebrow: string; title: string; description: string; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {icon && <div className="mt-0.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-2 text-cyan-300">{icon}</div>}
      <div>
        <p className="mono text-[10.5px] tracking-[0.2em] text-cyan-400/80 uppercase">{eyebrow}</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-50">{title}</h1>
        <p className="mt-1 max-w-4xl text-[12.5px] leading-relaxed text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export const NAV_ICONS = { Gauge, Layers, Radio, Workflow, LineChart, ShieldAlert, Activity, GitBranch, Database, LayoutDashboard };
