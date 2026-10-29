import { Activity, Boxes, FlaskConical, GitCompareArrows } from "lucide-react";
import { Badge, Bar, DataTable, Kpi, MetricRow, Panel, SectionHeading } from "@/components/ui";
import { HBars } from "@/components/charts";
import { modelsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const { models } = await modelsData();
  const production = models.filter((m) => m.stage === "production");
  const staged = models.filter((m) => m.stage === "staging");
  const archived = models.filter((m) => m.stage === "archived");
  const fraud = models.find((m) => m.modelId === "fraud-ensemble-v3");
  const fraudNames = (fraud?.features as string[] | undefined) ?? [];
  const fraudParams = (fraud?.params ?? {}) as { weights?: number[]; blend?: { glm: number; isolation: number } };

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="MLflow model registry · feature store"
        title="Model Registry & Feature Store"
        description="Eight registered models spanning fraud detection, pricing, reserving, churn and telematics scoring. Every score served in the platform carries model provenance — version, stage, training rows, metric and drift — so a decision can always be traced back to the artefact that produced it."
        icon={<Activity size={18} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Registered models" value={String(models.length)} sub={`${production.length} production · ${staged.length} staging · ${archived.length} archived`} tone="cyan" icon={<Boxes size={15} />} />
        <Kpi label="Best fraud AUC" value={Math.max(...models.filter((m) => m.task === "binary-classification").map((m) => m.metricValue)).toFixed(4)} sub="fraud-ensemble-v3 (holdout)" tone="emerald" icon={<FlaskConical size={15} />} />
        <Kpi label="Mean drift (PSI)" value={`${(models.reduce((s, m) => s + m.driftPct, 0) / Math.max(1, models.length)).toFixed(1)}%`} sub="30-day window" tone={models.some((m) => m.driftPct > 10) ? "gold" : "emerald"} />
        <Kpi label="Feature store" value={`${fraudNames.length} features`} sub="offline = online parity" tone="slate" icon={<GitCompareArrows size={15} />} />
      </div>

      <Panel title="Registry" subtitle="stage, task, primary metric, training volume, owner and drift" accent="#22d3ee" right={<Badge tone="cyan">mlflow</Badge>}>
        <div className="grid gap-3 lg:grid-cols-2">
          {models.map((m) => {
            const secondary = (m.secondaryMetrics ?? {}) as Record<string, number>;
            const stageTone = m.stage === "production" ? "emerald" : m.stage === "staging" ? "gold" : "slate";
            return (
              <div key={m.modelId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[13px] font-semibold text-slate-100">{m.name}</h3>
                    <p className="mono mt-0.5 truncate text-[10px] text-slate-500">
                      {m.modelId} · {m.version} · {m.family}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0">
                    <Badge tone={stageTone as "emerald"}>{m.stage}</Badge>
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                    <p className="mono text-[9px] tracking-wider text-slate-600 uppercase">{m.metricName}</p>
                    <p className="mono mt-0.5 text-[15px] font-semibold text-cyan-300">{m.metricValue < 10 ? m.metricValue.toFixed(4) : m.metricValue.toLocaleString("en-KE")}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                    <p className="mono text-[9px] tracking-wider text-slate-600 uppercase">training rows</p>
                    <p className="mono mt-0.5 text-[15px] font-semibold text-slate-200">{m.trainingRows.toLocaleString("en-KE")}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                    <p className="mono text-[9px] tracking-wider text-slate-600 uppercase">drift (PSI)</p>
                    <p className={`mono mt-0.5 text-[15px] font-semibold ${m.driftPct > 8 ? "text-rose-300" : m.driftPct > 4 ? "text-amber-300" : "text-emerald-300"}`}>{m.driftPct.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="mt-2.5">
                  {Object.entries(secondary)
                    .slice(0, 6)
                    .map(([k, v]) => (
                      <MetricRow key={k} label={k.replace(/_/g, " ")} value={typeof v === "number" ? (Math.abs(v) > 1000 ? Math.round(v).toLocaleString("en-KE") : Number(v).toFixed(4)) : String(v)} />
                    ))}
                </div>
                <div className="mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800 pt-2 text-[9.5px] text-slate-600">
                  <span>owner: <span className="text-slate-400">{m.owner}</span></span>
                  <span>task: <span className="text-slate-400">{m.task}</span></span>
                  <span>trained: <span className="text-slate-400">{m.trainedAt.toISOString().slice(0, 16).replace("T", " ")}</span></span>
                  <span>run: <span className="text-slate-400">{m.runTimeMs} ms</span></span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-6" title="Fraud feature store" subtitle="the 19 point-in-time features materialised by Spark and served online by Redis" accent="#f43f5e">
          <DataTable
            maxHeight={330}
            rows={fraudNames.map((n, i) => ({
              feature: n,
              weight: Number((fraudParams.weights?.[i] ?? 0).toFixed(4)),
              direction: (fraudParams.weights?.[i] ?? 0) > 0 ? "increases risk" : "decreases risk",
              source: n.startsWith("provider") ? "silver.provider + gold.fact_fraud_events" : n.startsWith("payment") ? "silver.payment" : n.startsWith("telematics") || n.startsWith("night") ? "silver.telematics" : n.startsWith("location") ? "gold.dim_location" : "silver.claim + silver.policy",
            }))}
          />
          <p className="mono mt-2 text-[10px] text-slate-500">
            ensemble blend: GLM {(fraudParams.blend?.glm ?? 0.84) * 100}% · isolation {(fraudParams.blend?.isolation ?? 0.16) * 100}%
          </p>
        </Panel>

        <Panel className="xl:col-span-6" title="Champion vs challenger" subtitle="primary metric by model — production champion highlighted" accent="#a78bfa">
          <HBars
            data={models.map((m) => ({ name: `${m.modelId}${m.stage === "production" ? " ★" : ""}`, value: Number(m.metricValue < 1 ? m.metricValue.toFixed(4) : (m.metricValue / 100).toFixed(2)) }))}
            xKey="name"
            yKey="value"
            color="#a78bfa"
            height={300}
          />
          <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
            {models
              .filter((m) => m.task === "binary-classification")
              .map((m) => (
                <Bar key={m.modelId} label={`${m.name} (${m.stage})`} right={`${m.metricValue.toFixed(4)} AUC`} value={m.metricValue} max={1} tone={m.stage === "production" ? "emerald" : m.stage === "staging" ? "gold" : "slate"} />
              ))}
          </div>
          <p className="mono mt-3 text-[10px] leading-relaxed text-slate-500">
            Promotion rule: challenger must beat champion AUC by ≥ 0.01 on the holdout with drift &lt; 5% and SIU precision ≥ 60% over a 14-day shadow run.
          </p>
        </Panel>
      </div>
    </div>
  );
}
