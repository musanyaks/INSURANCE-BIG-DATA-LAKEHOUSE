import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Banknote, Boxes, Database, Gauge, Layers, LineChart, ShieldAlert, Siren } from "lucide-react";
import { Badge, Bar, DataTable, Kpi, LayerTag, MetricRow, Panel } from "@/components/ui";
import { Donut, HBars, MultiLine, PremiumClaimsTrend, StackedBars } from "@/components/charts";
import { IbnrBars } from "@/components/ibnr-bars";
import { CountyTileMap } from "@/components/county-map";
import { LiveEventTicker } from "@/components/live-ticker";
import { compactKes, executiveSummary, layerCounts, platformStats, recentClaims } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ExecutiveControl() {
  const [exec, layers, claims, stats] = await Promise.all([executiveSummary(), layerCounts(), recentClaims(12), platformStats()]);
  const k = exec.kpis;
  const prev = exec.trend.slice(-13, -1)[0];
  const now = exec.trend[exec.trend.length - 1];
  const premiumDelta = prev && prev.earnedPremium > 0 ? ((now.earnedPremium - prev.earnedPremium) / prev.earnedPremium) * 100 : 0;

  const ibnrByMethod = [
    { method: "Chain Ladder", ibnr: k.ibnr },
    { method: "Bornhuetter-Ferguson", ibnr: k.ibnrBf },
    { method: "Cape Cod", ibnr: k.ibnrCapeCod },
  ];

  const fraudLevelOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const levelMap = new Map(exec.fraudLevels.map((f) => [f.level, f]));

  return (
    <div className="space-y-4">
      <header className="panel relative overflow-hidden px-5 py-4">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono flex items-center gap-2 text-[10px] tracking-[0.24em] text-cyan-400 uppercase">
              <Boxes size={12} /> Insurance data intelligence platform
            </p>
            <h1 className="mt-1.5 text-[26px] leading-tight font-bold tracking-tight text-slate-50">
              INSURE<span className="text-cyan-400">LAKE</span> Executive Control Centre
            </h1>
            <p className="mt-1 max-w-3xl text-[12.5px] text-slate-400">
              A real-time, governed insurance lakehouse powering actuarial analytics, fraud intelligence, risk modelling and executive decision-making across 47 Kenyan counties.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Apache Iceberg v2", "Kafka (8 topics)", "Spark Structured Streaming", "dbt · 34 models", "Trino SQL", "MLflow", "Great Expectations", "OpenMetadata"].map((t) => (
              <Badge key={t} tone="slate">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Earned premium · 12m" value={compactKes(k.earnedPremium)} sub={`${k.policiesActive.toLocaleString("en-KE")} policies in force`} delta={{ value: `${premiumDelta.toFixed(1)}% MoM`, up: premiumDelta >= 0 }} tone="cyan" icon={<Banknote size={15} />} />
        <Kpi label="Incurred claims · 12m" value={compactKes(k.incurredClaims)} sub={`${k.claimCount.toLocaleString("en-KE")} claims · ${k.openClaims.toLocaleString("en-KE")} open`} tone="rose" icon={<Siren size={15} />} />
        <Kpi label="Loss ratio" value={`${k.lossRatio}%`} sub="incurred / earned premium" tone={k.lossRatio > 80 ? "rose" : k.lossRatio > 65 ? "gold" : "emerald"} icon={<Gauge size={15} />} />
        <Kpi label="Fraud exposure" value={compactKes(k.fraudExposure)} sub={`${k.fraudRate}% of incurred · ${k.fraudConfirmed} confirmed`} tone="gold" icon={<ShieldAlert size={15} />} />
        <Kpi label="IBNR reserve (CL)" value={compactKes(k.ibnr)} sub={`Mack σ ${compactKes(k.mackSe)}`} tone="slate" icon={<LineChart size={15} />} />
        <Kpi label="Policy retention" value={`${k.retention}%`} sub={`${k.churn}% lapsed / cancelled`} tone="emerald" icon={<Layers size={15} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Premium vs claims trend" subtitle="gold.fact_premiums × gold.fact_claims · monthly, trailing 24 months · served by Trino" accent="#22d3ee" right={<Badge tone="cyan">🥇 gold</Badge>}>
          <PremiumClaimsTrend data={exec.trend.slice(-24)} />
        </Panel>

        <Panel className="xl:col-span-4" title="Fraud alert distribution" subtitle="gold.fact_fraud_events · scored by fraud-ensemble-v3" accent="#f43f5e" right={<Link href="/fraud" className="mono flex items-center gap-1 text-[10.5px] text-cyan-300 hover:text-cyan-200">console <ArrowUpRight size={11} /></Link>}>
          <div className="space-y-2.5">
            {fraudLevelOrder.map((lvl) => {
              const f = levelMap.get(lvl);
              const tone = lvl === "CRITICAL" ? "rose" : lvl === "HIGH" ? "gold" : lvl === "MEDIUM" ? "bronze" : "emerald";
              return (
                <div key={lvl} className="flex items-center gap-3">
                  <span className="mono w-[74px] shrink-0 text-[11px] tracking-wide text-slate-300">{lvl}</span>
                  <div className="min-w-0 flex-1">
                    <Bar value={f?.count ?? 0} max={Math.max(...exec.fraudLevels.map((x) => x.count), 1)} tone={tone} />
                  </div>
                  <span className="mono w-[112px] shrink-0 text-right text-[11px] text-slate-300">
                    {(f?.count ?? 0).toLocaleString("en-KE")} · {compactKes(f?.amount ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
            <MetricRow label="Avg model score" value={`${k.avgFraudScore}%`} />
            <MetricRow label="Fraud rate" value={`${k.fraudRate}%`} tone="text-amber-300" />
          </div>
          <div className="mt-3 space-y-1.5">
            {exec.topFraud.slice(0, 4).map((a) => (
              <Link key={a.alertId} href={`/fraud?alert=${a.alertId}`} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5 text-[11px] transition-colors hover:border-rose-500/40">
                <AlertTriangle size={12} className={a.level === "CRITICAL" ? "text-rose-400" : "text-amber-400"} />
                <span className="mono text-slate-300">{a.claimId}</span>
                <span className="truncate text-slate-500">{a.county}</span>
                <span className="mono ml-auto text-rose-300">{(a.score * 100).toFixed(1)}%</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="County insurance risk map" subtitle="dim_location · 47 counties with KNBS population, NTSA road risk, KMD rainfall & crime indices" accent="#eab308" right={<Badge tone="gold">Kenya</Badge>}>
          <CountyTileMap counties={exec.counties} />
        </Panel>
        <div className="space-y-4 xl:col-span-4">
          <LiveEventTicker />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Line of business mix" subtitle="Motor · Health · Life · Micro · Agriculture" accent="#22d3ee">
          <Donut data={exec.lob.map((l) => ({ name: l.lob, value: l.claims }))} />
          <div className="mt-3 border-t border-slate-800 pt-2">
            <DataTable
              rows={exec.lob.map((l) => ({ LOB: l.lob, Claims: l.claims, Earned: compactKes(l.earnedPremium), "Loss %": `${l.lossRatio}%`, "Fraud %": `${l.avgFraudScore}%` }))}
              columns={["LOB", "Claims", "Earned", "Loss %", "Fraud %"]}
              maxHeight={170}
            />
          </div>
        </Panel>

        <Panel className="xl:col-span-4" title="Reserving: IBNR by method" subtitle="actuarial.reserve_result · chain ladder vs BF vs Cape Cod" accent="#a78bfa" right={<Link href="/actuarial" className="mono flex items-center gap-1 text-[10.5px] text-cyan-300">open <ArrowUpRight size={11} /></Link>}>
          <IbnrBars data={ibnrByMethod.map((m) => ({ name: m.method, value: Math.round(m.ibnr / 1e6) }))} />
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
            <MetricRow label="Ultimate (CL)" value={compactKes(k.ibnr + k.incurredClaims)} />
            <MetricRow label="Mack CV" value={k.ibnr > 0 ? `${((k.mackSe / k.ibnr) * 100).toFixed(1)}%` : "—"} />
            <MetricRow label="Case reserves" value={compactKes(k.reserves)} />
            <MetricRow label="Open claims" value={k.openClaims.toLocaleString("en-KE")} />
          </div>
          <p className="mono mt-3 text-[10px] leading-relaxed text-slate-500">
            Reserve adequacy and Mack standard error refresh nightly from the R <span className="text-slate-400">chainladder</span> DAG over the paid & incurred triangles.
          </p>
        </Panel>

        <Panel className="xl:col-span-4" title="Payments & M-PESA" subtitle="gold.fact_payments · channel mix by value" accent="#34d399">
          <Donut
            data={exec.paymentChannels.slice(0, 5).map((p) => ({ name: p.channel, value: p.amount }))}
            colors={["#34d399", "#22d3ee", "#a78bfa", "#eab308", "#fb923c"]}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
            <MetricRow label="M-PESA share" value={`${(((exec.paymentChannels.find((p) => p.channel.startsWith("M-PESA"))?.amount ?? 0) / Math.max(1, exec.paymentChannels.reduce((s, p) => s + p.amount, 0))) * 100).toFixed(1)}%`} tone="text-emerald-300" />
            <MetricRow label="Transactions" value={exec.paymentChannels.reduce((s, p) => s + p.count, 0).toLocaleString("en-KE")} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Lakehouse volume by layer" subtitle="bronze raw events → silver conformed tables → gold marts" accent="#c9803f">
          <div className="grid grid-cols-3 gap-3">
            {[
              { layer: "bronze", label: "🥉 Bronze", rows: layers.bronze, note: `${(layers.bronzeBytes / 1024 / 1024).toFixed(1)} MB raw JSON`, detail: [["claims", layers.counts.silver_claim], ["immutable", 1]] as Array<[string, number]> },
              { layer: "silver", label: "🥈 Silver", rows: Object.entries(layers.counts).filter(([k2]) => k2.startsWith("silver_")).reduce((s, [, v]) => s + v, 0), note: "8 conformed tables", detail: Object.entries(layers.counts).filter(([k2]) => k2.startsWith("silver_")) as Array<[string, number]> },
              { layer: "gold", label: "🥇 Gold", rows: Object.entries(layers.counts).filter(([k2]) => k2.startsWith("fact_") || k2.startsWith("dim_")).reduce((s, [, v]) => s + v, 0), note: "5 facts · 2 dims · marts", detail: Object.entries(layers.counts).filter(([k2]) => k2.startsWith("fact_") || k2.startsWith("dim_")) as Array<[string, number]> },
            ].map((l) => (
              <div key={l.layer} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-slate-200">{l.label}</span>
                  <LayerTag layer={l.layer} />
                </div>
                <p className="mono mt-2 text-[20px] leading-none font-semibold text-slate-50">{l.rows.toLocaleString("en-KE")}</p>
                <p className="mono mt-1 text-[10px] text-slate-500">{l.note}</p>
                <div className="mt-2.5 space-y-1">
                  {l.detail.slice(0, 6).map(([name, n]) => (
                    <Bar key={name} label={name} right={n.toLocaleString("en-KE")} value={n} max={Math.max(...l.detail.map(([, v]) => v), 1)} tone={l.layer === "bronze" ? "bronze" : l.layer === "silver" ? "slate" : "gold"} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mono mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3 text-[10.5px] text-slate-500 md:grid-cols-4">
            <span>lake size: {(layers.bronzeBytes / 1024 / 1024).toFixed(1)} MB bronze</span>
            <span>dev_triangle cells: {layers.counts.dev_triangle?.toLocaleString("en-KE")}</span>
            <span>reserve rows: {layers.counts.reserve_result?.toLocaleString("en-KE")}</span>
            <span>pricing segments: {layers.counts.pricing_segment?.toLocaleString("en-KE")}</span>
          </div>
        </Panel>

        <Panel className="xl:col-span-5" title="Data quality & trust" subtitle="Great Expectations checkpoint results across all layers" accent="#34d399" right={<Link href="/governance" className="mono flex items-center gap-1 text-[10.5px] text-cyan-300">governance <ArrowUpRight size={11} /></Link>}>
          <div className="flex items-center gap-4">
            <div className="relative h-[104px] w-[104px] shrink-0">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="12" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#34d399" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(k.dqScore / 100) * 314} 314`} />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <span className="mono text-[19px] font-semibold text-emerald-300">{k.dqScore}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <MetricRow label="Expectations executed" value={String(k.dqChecks)} />
              <MetricRow label="Failing suites" value={String(k.dqFailed)} tone={k.dqFailed > 0 ? "text-amber-300" : "text-emerald-300"} />
              <MetricRow label="Duplicate customers merged" value={k.duplicateCustomers.toLocaleString("en-KE")} />
              <MetricRow label="KYC verified" value={`${k.kycVerified}%`} />
            </div>
          </div>
          <div className="mono mt-3 rounded border border-slate-800 bg-slate-900/50 p-2 text-[10px] leading-relaxed text-slate-500">
            lineage: M-PESA Daraja → kafka:insurance.mpesa → bronze.mpesa → silver.payment → gold.fact_payments → BI executive dashboard · 34 catalogued datasets · column-level lineage harvested by OpenMetadata
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Latest claims landed in silver" subtitle="silver.claim · newest FNOL events after dedupe & FK validation" accent="#22d3ee">
          <DataTable
            rows={claims.map((c) => ({
              claim_id: c.claimId,
              policy_id: c.policyId,
              date: c.claimDate,
              lob: c.claimType,
              county: c.county,
              amount: Math.round(c.amount),
              status: c.status,
              fraud: `${((c.fraudScore ?? 0) * 100).toFixed(1)}%`,
              risk: c.riskLevel ?? "—",
            }))}
            maxHeight={280}
          />
        </Panel>
        <Panel className="xl:col-span-5" title="Claims & fraud intensity by month" subtitle="fact_claims volume vs fraud-flagged exposure" accent="#f43f5e">
          <StackedBars
            data={exec.trend.slice(-14).map((t) => ({ month: t.month, Claims: t.claimCount, "Fraud exposure (M)": Math.round(t.fraudExposure / 1e6) }))}
            xKey="month"
            bars={[
              { key: "Claims", name: "Claim count", color: "#22d3ee" },
              { key: "Fraud exposure (M)", name: "Fraud exposure (KSh M)", color: "#f43f5e" },
            ]}
            height={280}
          />
        </Panel>
      </div>

      <Panel title="Executive narrative" subtitle="Auto-generated from the gold layer at query time" accent="#eab308">
        <div className="grid gap-3 text-[12px] leading-relaxed text-slate-300 md:grid-cols-3">
          <p>
            <span className="mono text-cyan-300">Underwriting:</span> earned premium of <strong className="text-slate-100">{compactKes(k.earnedPremium)}</strong> over the last 12 months supports{" "}
            <strong className="text-slate-100">{compactKes(k.incurredClaims)}</strong> of incurred claims — a <strong className={k.lossRatio > 75 ? "text-rose-300" : "text-emerald-300"}>{k.lossRatio}% loss ratio</strong>. Motor remains the
            dominant exposure while Health carries the fastest development pattern.
          </p>
          <p>
            <span className="mono text-amber-300">Reserving:</span> chain-ladder IBNR of <strong className="text-slate-100">{compactKes(k.ibnr)}</strong> (Mack σ {compactKes(k.mackSe)}) sits between the Bornhuetter-Ferguson (
            {compactKes(k.ibnrBf)}) and Cape Cod ({compactKes(k.ibnrCapeCod)}) estimates, indicating a stable but slightly under-reserved recent diagonal.
          </p>
          <p>
            <span className="mono text-rose-300">Fraud:</span> {levelMap.get("CRITICAL")?.count ?? 0} critical and {levelMap.get("HIGH")?.count ?? 0} high alerts expose{" "}
            <strong className="text-slate-100">{compactKes(k.fraudExposure)}</strong> ({k.fraudRate}% of incurred). Provider-linked rings concentrate in Nairobi, Mombasa and Kisumu; streaming scoring catches them in ~1 second, not the nightly batch.
          </p>
        </div>
        <div className="mono mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3 text-[10px] text-slate-500">
          <Database size={11} /> bootstrap: {stats?.seededAt ? String(stats.seededAt).slice(0, 19).replace("T", " ") : "—"} · bronze {Number(stats?.bronze_events ?? 0).toLocaleString("en-KE")} events · silver{" "}
          {Number(stats?.silver_rows ?? 0).toLocaleString("en-KE")} rows · gold {Number(stats?.gold_rows ?? 0).toLocaleString("en-KE")} rows · quarantined {Number(stats?.quarantined ?? 0).toLocaleString("en-KE")} · build{" "}
          {Number(stats?.duration_s ?? 0)}s
        </div>
      </Panel>
    </div>
  );
}
