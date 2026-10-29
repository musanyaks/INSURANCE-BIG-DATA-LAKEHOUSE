import { GitBranch, ScrollText, ShieldCheck, TableProperties } from "lucide-react";
import { Badge, Bar, DataTable, Kpi, MetricRow, Panel, SectionHeading } from "@/components/ui";
import { LineageGraph, type LineageEdge } from "@/components/lineage-graph";
import { governanceData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const g = await governanceData();
  const edges: LineageEdge[] = g.lineage.map((l) => ({ ...l, description: l.description }));
  const dims = ["Completeness", "Accuracy", "Consistency", "Uniqueness", "Validity", "Timeliness"];
  const failing = g.checks.filter((c) => c.status !== "passed").slice(0, 18);
  const piiDatasets = g.catalog.filter((c) => c.pii);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Great Expectations · OpenMetadata · column-level lineage"
        title="Data Governance & Lineage"
        description="“Where did this number come from?” Every dataset in the lakehouse is catalogued, owned, classified and continuously tested. Quality is measured across six dimensions, lineage is harvested end-to-end from source system to dashboard tile, and slowly changing dimensions keep full history."
        icon={<ShieldCheck size={18} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Data quality score" value={`${g.agg.score}%`} sub={`${g.agg.checks} expectations executed`} tone={g.agg.score > 95 ? "emerald" : "gold"} icon={<ShieldCheck size={15} />} />
        <Kpi label="Records tested" value={g.agg.tested.toLocaleString("en-KE")} sub={`${g.agg.failed.toLocaleString("en-KE")} failed`} tone="cyan" />
        <Kpi label="Catalogued datasets" value={String(g.catalog.length)} sub={`${piiDatasets.length} contain PII`} tone="slate" icon={<TableProperties size={15} />} />
        <Kpi label="Lineage edges" value={String(g.lineage.length)} sub="source → BI, column level" tone="gold" icon={<GitBranch size={15} />} />
        <Kpi label="SCD changes tracked" value={String(g.scd.length)} sub="Type 1 & Type 2 history" tone="cyan" icon={<ScrollText size={15} />} />
        <Kpi label="Failing suites" value={String(g.checks.filter((c) => c.status === "failed").length)} sub="alerting to #dq-incidents" tone={g.checks.some((c) => c.status === "failed") ? "rose" : "emerald"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Quality by dimension" subtitle="Great Expectations checkpoint · last run" accent="#34d399">
          <div className="mb-4 flex items-center gap-4">
            <div className="relative h-[108px] w-[108px] shrink-0">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="12" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#34d399" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(g.agg.score / 100) * 314} 314`} />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <span className="mono text-[20px] font-semibold text-emerald-300">{g.agg.score}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-400">
              Composite score across all layers. Failing expectations quarantine rows rather than silently dropping them, so bronze remains reprocessable.
            </div>
          </div>
          <div className="space-y-2.5">
            {dims.map((d) => {
              const row = g.byDim.find((x) => x.dim === d);
              return <Bar key={d} label={d} right={`${(row?.score ?? 100).toFixed(2)}% · ${Number(row?.failed ?? 0).toLocaleString("en-KE")} failed`} value={row?.score ?? 100} max={100} tone={(row?.score ?? 100) > 98 ? "emerald" : (row?.score ?? 100) > 95 ? "gold" : "rose"} />;
            })}
          </div>
        </Panel>

        <Panel className="xl:col-span-8" title="Expectation results" subtitle="dataset · dimension · rule · records tested vs failed" accent="#22d3ee" right={<Badge tone="emerald">great_expectations</Badge>}>
          <DataTable
            maxHeight={380}
            rows={g.checks.map((c) => ({
              dataset: c.dataset,
              layer: c.layer,
              dimension: c.dimension,
              expectation: c.expectation,
              rule: c.rule,
              tested: c.recordsTested,
              failed: c.recordsFailed,
              score: `${c.score.toFixed(2)}%`,
              severity: c.severity,
              status: c.status,
              run_at: c.runAt.toISOString().slice(0, 16).replace("T", " "),
            }))}
            render={(r, i) => {
              const c = g.checks[i];
              return (
                <>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-cyan-300">{c.dataset}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-500">{c.layer}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-300">{c.dimension}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-400">{c.expectation}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-500">{c.recordsTested.toLocaleString("en-KE")}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-rose-300">{c.recordsFailed.toLocaleString("en-KE")}</td>
                  <td className="border-b border-slate-800/60 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full ${c.score > 98 ? "bg-emerald-400/80" : c.score > 95 ? "bg-amber-400/80" : "bg-rose-400/80"}`} style={{ width: `${Math.max(4, c.score)}%` }} />
                      </div>
                      <span className="mono text-[10.5px] text-slate-300">{c.score.toFixed(2)}%</span>
                    </div>
                  </td>
                  <td className="border-b border-slate-800/60 px-2 py-1.5">
                    <span className={`mono rounded border px-1.5 py-0.5 text-[9.5px] uppercase ${c.status === "passed" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : c.status === "warning" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}`}>
                      {c.status}
                    </span>
                  </td>
                </>
              );
            }}
            columns={["dataset", "layer", "dimension", "expectation", "tested", "failed", "score", "status"]}
          />
        </Panel>
      </div>

      <Panel title="End-to-end data lineage" subtitle="hover a node to trace upstream sources and downstream consumers — M-PESA → Kafka → Bronze → Silver → Gold → dashboard" accent="#a78bfa" right={<Badge tone="slate">OpenMetadata harvest · daily</Badge>}>
        <LineageGraph edges={edges} height={660} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Slowly changing dimensions" subtitle="SCD Type 1 overwrites, SCD Type 2 preserves valid_from / valid_to history" accent="#eab308">
          <DataTable
            maxHeight={330}
            rows={g.scd.map((s) => ({
              id: s.id,
              table: s.tableName,
              strategy: s.strategy,
              entity: `${s.entityKey} · ${s.entityLabel ?? ""}`,
              attribute: s.attribute,
              old: s.oldValue ?? "—",
              new: s.newValue,
              changed_at: s.changedAt.toISOString().slice(0, 16).replace("T", " "),
              changed_by: s.changedBy,
              valid_from: s.validFrom ? s.validFrom.toISOString().slice(0, 10) : "—",
              valid_to: s.validTo ? s.validTo.toISOString().slice(0, 10) : "9999-12-31",
            }))}
          />
        </Panel>

        <div className="space-y-4 xl:col-span-5">
          <Panel title="Ownership & classification" subtitle="catalog entry summary per dataset" accent="#34d399">
            <div className="space-y-2">
              {g.catalog.slice(0, 8).map((c) => (
                <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11.5px] text-slate-100">{c.dataset}</span>
                    <Badge tone={c.classification === "Restricted" ? "rose" : c.classification === "Confidential" ? "gold" : "slate"}>{c.classification}</Badge>
                    {c.pii && <Badge tone="rose">PII</Badge>}
                    <span className="mono ml-auto text-[10px] text-slate-500">{c.rows.toLocaleString("en-KE")} rows</span>
                  </div>
                  <p className="mono mt-1 text-[10px] text-slate-500">
                    owner: <span className="text-slate-400">{c.owner}</span> · {c.tableFormat} · {c.sizeMb} MB
                  </p>
                  <p className="mono mt-0.5 truncate text-[9.5px] text-slate-600">{c.location}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Quarantine & reprocessing" subtitle="rejected rows never disappear — they wait in the quarantine zone" accent="#f43f5e">
            <MetricRow label="Quarantine zone" value="s3a://insurelake/quarantine/" />
            <MetricRow label="Reprocessable from bronze" value="always" tone="text-emerald-300" />
            <MetricRow label="PII masking" value="msisdn, national_id" />
            <MetricRow label="Access control" value="Ranger policies per layer" />
            <MetricRow label="Retention" value="bronze 7y · silver 7y · gold indefinite" />
            <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
              Claims with negative amounts, future dates, null customer keys or orphan policy references are quarantined with the failing expectation attached, then replayed once the source system is fixed.
            </p>
          </Panel>
        </div>
      </div>

      <Panel title="Failing & warning expectations" subtitle="what an on-call data engineer sees at 07:00 EAT" accent="#f43f5e">
        {failing.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-emerald-300">All expectations passing.</p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {failing.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center gap-2">
                  <span className={`mono rounded border px-1.5 py-0.5 text-[9.5px] uppercase ${c.status === "failed" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>{c.status}</span>
                  <span className="mono truncate text-[11px] text-slate-200">{c.expectation}</span>
                  <span className="mono ml-auto text-[10.5px] text-slate-400">{c.score.toFixed(2)}%</span>
                </div>
                <p className="mono mt-1.5 text-[10px] text-slate-500">{c.dataset} · {c.dimension} · {c.layer}</p>
                <p className="mt-1 text-[11px] text-slate-400">{c.rule}</p>
                <p className="mono mt-1 text-[10px] text-slate-600">
                  {c.recordsFailed.toLocaleString("en-KE")} / {c.recordsTested.toLocaleString("en-KE")} records failed
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
