import { Network, ShieldAlert, Siren, Target } from "lucide-react";
import { Badge, Bar, DataTable, Kpi, MetricRow, Panel, SectionHeading } from "@/components/ui";
import { HBars } from "@/components/charts";
import { FraudConsole, type FraudAlert } from "@/components/fraud-console";
import { compactKes, fraudData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FraudPage({ searchParams }: { searchParams: Promise<{ alert?: string }> }) {
  const { alert } = await searchParams;
  const data = await fraudData();

  const alerts: FraudAlert[] = data.alerts.map((a) => ({
    alertId: a.alertId,
    claimId: a.claimId,
    claimKey: a.claimKey,
    score: Number(a.score),
    level: a.level,
    amount: Math.round(a.amount),
    status: a.status,
    assignedTo: a.assignedTo,
    detectedAt: a.detectedAt.toISOString(),
    modelId: a.modelId,
    reasons: (a.reasons as unknown as FraudAlert["reasons"]) ?? [],
    features: (a.features as unknown as Record<string, number>) ?? {},
    networkLinks: (a.networkLinks as unknown as FraudAlert["networkLinks"]) ?? [],
    latencyMs: a.latencyMs,
    detectionMode: a.detectionMode,
    county: a.county,
  }));

  const totalAtRisk = alerts.reduce((s, a) => s + a.amount, 0);
  const critical = data.levels.find((l) => l.level === "CRITICAL");
  const high = data.levels.find((l) => l.level === "HIGH");
  const model = data.model;
  const metrics = (model?.secondaryMetrics ?? {}) as Record<string, number>;
  const params = (model?.params ?? {}) as Record<string, unknown>;
  const weights = (params.weights as number[] | undefined) ?? [];
  const names = (model?.features as string[] | undefined) ?? [];

  const dist = [...data.scoreDist].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Fraud intelligence · SIU console"
        title="Insurance Fraud Intelligence Platform"
        description="The lakehouse is the single source of truth for fraud analytics: 19 point-in-time features per claim, a production GLM + isolation-forest ensemble registered in MLflow, graph community detection for organised rings, and an investigator console that writes decisions straight back into gold.fact_fraud_events."
        icon={<ShieldAlert size={18} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open alerts" value={String(alerts.length)} sub={`${critical?.n ?? 0} critical · ${high?.n ?? 0} high`} tone="rose" icon={<Siren size={15} />} />
        <Kpi label="Amount at risk" value={compactKes(totalAtRisk)} sub="top 250 scored alerts" tone="gold" icon={<Target size={15} />} />
        <Kpi label="Model ROC AUC" value={model ? model.metricValue.toFixed(4) : "—"} sub={`holdout · ${model?.version ?? ""}`} tone="cyan" />
        <Kpi label="Precision / recall" value={`${((metrics.precision ?? 0) * 100).toFixed(0)}% / ${((metrics.recall ?? 0) * 100).toFixed(0)}%`} sub={`F1 ${((metrics.f1 ?? 0) * 100).toFixed(0)}% · KS ${((metrics.ks ?? 0) * 100).toFixed(0)}%`} tone="emerald" />
        <Kpi label="Lift @ top 10%" value={`${(metrics.lift_top10 ?? 0).toFixed(1)}×`} sub="vs random selection" tone="cyan" />
        <Kpi label="Feature drift" value={`${model?.driftPct ?? 0}%`} sub="PSI over 30 days" tone={Number(model?.driftPct ?? 0) > 8 ? "rose" : "emerald"} icon={<Network size={15} />} />
      </div>

      <Panel title="Investigation console" subtitle="select an alert to inspect the score, the additive reasons, the feature snapshot and the entity network" accent="#f43f5e" right={<Badge tone="rose">gold.fact_fraud_events</Badge>}>
        <FraudConsole alerts={alerts} initialAlertId={alert} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Score distribution across the book" subtitle="every claim in gold.fact_claims is scored — batch nightly and streaming at ingest" accent="#22d3ee">
          <div className="space-y-2.5">
            {dist.map((d) => (
              <Bar
                key={String(d.bucket)}
                label={`${String(d.bucket)} score band`}
                right={`${Number(d.n).toLocaleString("en-KE")} claims · ${compactKes(Number(d.amount))}`}
                value={Number(d.n)}
                max={Math.max(...dist.map((x) => Number(x.n)), 1)}
                tone={String(d.bucket).startsWith("8") || String(d.bucket).startsWith("6") ? "rose" : String(d.bucket).startsWith("4") ? "gold" : "emerald"}
              />
            ))}
          </div>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <MetricRow label="Claims scored" value={dist.reduce((s, d) => s + Number(d.n), 0).toLocaleString("en-KE")} />
            <MetricRow label="Exposure above 60%" value={compactKes(dist.filter((d) => String(d.bucket).startsWith("6") || String(d.bucket).startsWith("8")).reduce((s, d) => s + Number(d.amount), 0))} tone="text-rose-300" />
          </div>
        </Panel>

        <Panel className="xl:col-span-4" title="Highest-risk providers" subtitle="silver.provider · accreditation, licence status, network degree and rejection rate" accent="#a78bfa">
          <DataTable
            maxHeight={330}
            rows={data.providers.map((p) => ({
              provider: p.name,
              type: p.providerType,
              county: p.countyName,
              claims: p.claimVolume,
              avg_claim: Math.round(p.avgClaimAmount),
              rejection: `${(p.rejectionRate * 100).toFixed(1)}%`,
              degree: p.networkDegree,
              licence: p.licenceStatus,
              risk: `${(p.providerRiskScore * 100).toFixed(0)}%`,
            }))}
          />
        </Panel>

        <Panel className="xl:col-span-4" title="Model card — fraud-ensemble-v3" subtitle="MLflow registry · production stage" accent="#34d399">
          <MetricRow label="Family" value={String(model?.family ?? "—")} />
          <MetricRow label="Version" value={String(model?.version ?? "—")} />
          <MetricRow label="Stage" value={String(model?.stage ?? "—")} tone="text-emerald-300" />
          <MetricRow label="Trained" value={model ? model.trainedAt.toISOString().slice(0, 16).replace("T", " ") : "—"} />
          <MetricRow label="Training rows" value={Number(model?.trainingRows ?? 0).toLocaleString("en-KE")} />
          <MetricRow label="Isolation AUC" value={(metrics.isolation_auc ?? 0).toFixed(4)} />
          <MetricRow label="GLM AUC" value={(metrics.glm_auc ?? 0).toFixed(4)} />
          <div className="mt-3">
            <p className="mono mb-1.5 text-[9.5px] tracking-wider text-slate-500 uppercase">top model weights (standardised)</p>
            {names
              .map((n, i) => ({ n, w: weights[i] ?? 0 }))
              .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
              .slice(0, 8)
              .map((f) => (
                <div key={f.n} className="mb-1.5">
                  <Bar label={f.n} right={f.w.toFixed(3)} value={Math.abs(f.w)} max={Math.max(...weights.map((w) => Math.abs(w)), 0.1)} tone={f.w > 0 ? "rose" : "emerald"} />
                </div>
              ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Fraud propensity by claim cause" subtitle="average model score and exposure per declared cause" accent="#eab308">
          <HBars
            data={data.causeFraud.map((c) => ({ name: String(c.cause).length > 26 ? String(c.cause).slice(0, 25) + "…" : String(c.cause), score: Number((Number(c.avgScore) * 100).toFixed(1)) }))}
            xKey="name"
            yKey="score"
            color="#f43f5e"
            height={300}
            fmt="pct"
          />
        </Panel>
        <Panel className="xl:col-span-5" title="Alert workflow state" subtitle="decisions written back to the fraud mart by investigators" accent="#34d399">
          <div className="space-y-2">
            {data.statuses.map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <span className="mono w-[150px] shrink-0 text-[11px] text-slate-300">{s.status}</span>
                <div className="min-w-0 flex-1">
                  <Bar value={Number(s.n)} max={Math.max(...data.statuses.map((x) => Number(x.n)), 1)} tone="emerald" />
                </div>
                <span className="mono w-12 shrink-0 text-right text-[11px] text-slate-400">{Number(s.n).toLocaleString("en-KE")}</span>
              </div>
            ))}
          </div>
          <div className="mono mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[10px] leading-relaxed text-slate-500">
            detection pipeline: kafka:insurance.claims → bronze.claims → silver.claim → ml.fraud_feature_store (19 features, point-in-time correct) → fraud-ensemble-v3 → insurance.fraud_alerts → gold.fact_fraud_events → SIU console
          </div>
        </Panel>
      </div>
    </div>
  );
}
