import { GitCommitHorizontal, Workflow } from "lucide-react";
import { Badge, Bar, DataTable, LayerTag, MetricRow, Panel, SectionHeading } from "@/components/ui";
import { PipelineRunner } from "@/components/pipeline-runner";
import { pipelineData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const { runs, dags } = await pipelineData();
  const totalRecords = runs.reduce((s, r) => s + r.recordsIn, 0);
  const totalRejected = runs.reduce((s, r) => s + r.recordsRejected, 0);
  const successRate = runs.length ? (runs.filter((r) => r.status !== "failed").length / runs.length) * 100 : 0;
  const maxDuration = Math.max(...runs.map((r) => r.durationMs), 1);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Airflow · Spark · dbt · Great Expectations"
        title="Orchestration & Incremental Processing"
        description="Nine production DAGs move data from source systems through the medallion layers. Every run is incremental: a CDC watermark means only new and changed records are processed — never a 500-million-row nightly rewrite."
        icon={<Workflow size={18} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Panel className="p-3">
          <MetricRow label="DAGs" value={String(dags.length)} tone="text-cyan-300" />
          <MetricRow label="Runs (9 days)" value={String(runs.length)} />
          <MetricRow label="Success rate" value={`${successRate.toFixed(1)}%`} tone={successRate > 95 ? "text-emerald-300" : "text-amber-300"} />
          <MetricRow label="Records processed" value={totalRecords.toLocaleString("en-KE")} />
        </Panel>
        <Panel className="p-3">
          <MetricRow label="Rejected / quarantined" value={totalRejected.toLocaleString("en-KE")} tone="text-rose-300" />
          <MetricRow label="Rejection rate" value={`${((totalRejected / Math.max(1, totalRecords)) * 100).toFixed(2)}%`} />
          <MetricRow label="Mean run time" value={`${Math.round(runs.reduce((s, r) => s + r.durationMs, 0) / Math.max(1, runs.length) / 1000)}s`} />
          <MetricRow label="Slowest DAG" value={dags.reduce((a, b) => (a.avgMs > b.avgMs ? a : b)).dag.replace("insurelake_", "")} />
        </Panel>
        <Panel className="p-3">
          <MetricRow label="Processing mode" value="incremental" tone="text-emerald-300" />
          <MetricRow label="CDC source" value="Debezium → Kafka" />
          <MetricRow label="Merge strategy" value="Iceberg MERGE INTO" />
          <MetricRow label="Snapshot expiry" value="7 days" />
        </Panel>
        <Panel className="p-3">
          <MetricRow label="Table format" value="Apache Iceberg v2" tone="text-violet-300" />
          <MetricRow label="File format" value="Parquet / JSON" />
          <MetricRow label="Object store" value="S3 / MinIO" />
          <MetricRow label="SQL engine" value="Trino 4xx" />
        </Panel>
      </div>

      <Panel title="Trigger a pipeline run" subtitle="executes a real incremental pass against the lakehouse and records the Airflow run" accent="#34d399" right={<Badge tone="emerald">manual trigger</Badge>}>
        <PipelineRunner dags={dags.map((d) => ({ dag: d.dag, layer: d.layer, engine: d.engine, mode: d.mode }))} />
      </Panel>

      <Panel title="Registered DAGs" subtitle="airflow dags · owners, engines and processing modes" accent="#22d3ee">
        <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {dags.map((d) => (
            <div key={d.dag} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex items-center gap-2">
                <GitCommitHorizontal size={13} className="text-cyan-400" />
                <span className="mono truncate text-[11.5px] text-slate-100">{d.dag}</span>
                <span className="ml-auto">
                  <LayerTag layer={d.layer} />
                </span>
              </div>
              <p className="mono mt-1.5 text-[10px] text-slate-500">{d.engine}</p>
              <p className="mono text-[10px] text-slate-600">{d.mode}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="mono text-[13px] text-slate-100">{d.runs}</p>
                  <p className="mono text-[9px] tracking-wider text-slate-600 uppercase">runs</p>
                </div>
                <div>
                  <p className="mono text-[13px] text-emerald-300">{d.success}</p>
                  <p className="mono text-[9px] tracking-wider text-slate-600 uppercase">ok</p>
                </div>
                <div>
                  <p className="mono text-[13px] text-rose-300">{d.failed}</p>
                  <p className="mono text-[9px] tracking-wider text-slate-600 uppercase">failed</p>
                </div>
              </div>
              <div className="mt-2">
                <Bar label={`avg ${(d.avgMs / 1000).toFixed(1)}s`} right={`${d.records.toLocaleString("en-KE")} recs`} value={d.avgMs} max={Math.max(...dags.map((x) => x.avgMs))} tone="cyan" />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Run history" subtitle="latest 40 runs · duration bars scaled to the slowest run" accent="#eab308">
          <DataTable
            maxHeight={420}
            rows={runs.map((r) => ({ run: r.runId, dag: r.dagId, task: r.taskName, layer: r.layer, status: r.status, mode: r.mode, started: r.startedAt.toISOString().slice(0, 19).replace("T", " "), ms: r.durationMs, in: r.recordsIn, out: r.recordsOut, rejected: r.recordsRejected, watermark: r.watermark }))}
            render={(r, i) => {
              const row = runs[i];
              const tone = row.status === "failed" ? "bg-rose-500/70" : row.status === "success_with_warnings" ? "bg-amber-400/70" : "bg-emerald-400/70";
              return (
                <>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-500">{row.runId.slice(0, 26)}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-cyan-300">{row.taskName}</td>
                  <td className="border-b border-slate-800/60 px-2 py-1.5">
                    <LayerTag layer={row.layer} />
                  </td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[9.5px] uppercase ${row.status === "failed" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : row.status === "success_with_warnings" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                      {row.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="border-b border-slate-800/60 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full ${tone}`} style={{ width: `${(row.durationMs / maxDuration) * 100}%` }} />
                      </div>
                      <span className="mono text-[10.5px] text-slate-400">{(row.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                  </td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-300">{row.recordsIn.toLocaleString("en-KE")}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-300">{row.recordsOut.toLocaleString("en-KE")}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-rose-300">{row.recordsRejected.toLocaleString("en-KE")}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-500">{row.mode}</td>
                  <td className="mono border-b border-slate-800/60 px-2 py-1.5 text-slate-500">{row.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                </>
              );
            }}
            columns={["run", "task", "layer", "status", "duration", "in", "out", "rejected", "mode", "started"]}
          />
        </Panel>

        <div className="space-y-4 xl:col-span-4">
          <Panel title="Incremental processing contract" subtitle="why we never rewrite 500M rows" accent="#a78bfa">
            <pre className="mono rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[10.5px] leading-relaxed text-slate-300">
{`-- silver.claim (dbt incremental)
{{ config(materialized='incremental',
          unique_key='claim_key',
          on_schema_change='append_new_columns') }}

select * from {{ ref('stg_claims') }}
where ingest_time > (
  select max(watermark)
  from {{ source('ops','pipeline_run') }}
  where dag_id = 'insurelake_silver_claims'
)

-- gold.fact_claims
merge into gold.fact_claims t
using silver_claim_staging s
  on t.claim_key = s.claim_key
when matched then update set ...
when not matched then insert ...`}
            </pre>
            <div className="mt-3 space-y-1.5">
              <MetricRow label="Watermark source" value="ops.pipeline_run" />
              <MetricRow label="Late-arriving data" value="reprocessed ±7 days" />
              <MetricRow label="CDC envelope" value="op_type + ts_ms" />
              <MetricRow label="Idempotency" value="claim_key unique" />
            </div>
          </Panel>

          <Panel title="Batch vs streaming split" subtitle="same silver/gold logic, two execution modes" accent="#38bdf8">
            {[
              ["Streaming (Spark)", "claims, payments, M-PESA, telematics", "cyan"],
              ["CDC (Debezium)", "policies, customers", "violet"],
              ["Nightly batch", "external risk data, KNBS, KMD rainfall", "slate"],
              ["Weekly batch", "Iceberg snapshot expiry & compaction", "slate"],
            ].map(([mode, detail, tone]) => (
              <div key={mode} className="mb-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="mono text-[11.5px] text-slate-100">{mode}</span>
                  <Badge tone={tone as "cyan"}>{mode.split(" ")[0].toLowerCase()}</Badge>
                </div>
                <p className="mono mt-1 text-[10px] text-slate-500">{detail}</p>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
