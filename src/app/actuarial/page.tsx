import { Calculator, LineChart, Sigma, TrendingUp } from "lucide-react";
import { Badge, Bar, DataTable, Kpi, MetricRow, Panel, SectionHeading } from "@/components/ui";
import { compactKes } from "@/lib/queries";
import { HBars, ScatterRisk } from "@/components/charts";
import { ReservingPanel, type LobReserving } from "@/components/reserving-panel";
import { actuarialData } from "@/lib/queries";
import { cdfFrom, ldf, type TriangleCell } from "@/lib/actuarial";

export const dynamic = "force-dynamic";

export default async function ActuarialPage() {
  const { triangles, reserves, pricing } = await actuarialData();
  const lobs = [...triangles.keys()];

  const reserving: LobReserving[] = lobs.map((lob) => {
    const rows = triangles.get(lob) ?? [];
    const paidRows = rows.filter((r) => r.measure === "paid");
    const incRows = rows.filter((r) => r.measure === "incurred");
    const origins = [...new Set(rows.map((r) => r.originPeriod))].sort();
    const maxDev = origins.length;
    const build = (list: typeof rows): Array<Array<number | null>> => {
      const m: TriangleCell[][] = origins.map(() => new Array(maxDev).fill(null));
      for (const r of list) {
        const i = origins.indexOf(r.originPeriod);
        if (i >= 0 && r.devPeriod < maxDev) m[i][r.devPeriod] = r.cumulative;
      }
      return m;
    };
    const paid = build(paidRows);
    const incurred = build(incRows);
    const f = ldf({ origins, maxDev, incremental: paid.map((row) => row.map(() => 0)), cumulative: paid });
    const cdf = cdfFrom(f);
    const methods: Record<string, LobReserving["methods"][string]> = {};
    for (const m of ["chain_ladder", "bornhuetter_ferguson", "cape_cod", "mack"]) {
      methods[m] = origins.map((origin) => {
        const row = reserves.find((r) => r.lob === lob && r.method === m && r.originPeriod === origin);
        return {
          origin,
          paidToDate: row?.paidToDate ?? 0,
          ultimate: row?.ultimate ?? 0,
          ibnr: row?.ibnr ?? 0,
          se: row?.mackStdError ?? null,
          cv: row?.coefficientOfVariation ?? null,
          apriori: row?.aprioriLossRatio ?? null,
        };
      });
    }
    const mackRows = methods.mack;
    const mackSe = Math.sqrt(mackRows.reduce((s, r) => s + (r.se ?? 0) ** 2, 0));
    const totalIbnr = methods.chain_ladder.reduce((s, r) => s + r.ibnr, 0);
    return { lob, origins, paid, incurred, ldf: f.slice(0, maxDev), cdf: cdf.slice(0, maxDev), methods, mackSe, mackCv: totalIbnr > 0 ? mackSe / totalIbnr : 0 };
  });

  const totalIbnr = reserving.reduce((s, d) => s + d.methods.chain_ladder.reduce((a, r) => a + r.ibnr, 0), 0);
  const totalUltimate = reserving.reduce((s, d) => s + d.methods.chain_ladder.reduce((a, r) => a + r.ultimate, 0), 0);
  const totalPaid = reserving.reduce((s, d) => s + d.methods.chain_ladder.reduce((a, r) => a + r.paidToDate, 0), 0);
  const totalSe = Math.sqrt(reserving.reduce((s, d) => s + d.mackSe ** 2, 0));
  const motor = reserving.find((d) => d.lob === "Motor") ?? reserving[0];

  const pricingByLob = new Map<string, typeof pricing>();
  for (const p of pricing) {
    const arr = pricingByLob.get(p.lob) ?? [];
    arr.push(p);
    pricingByLob.set(p.lob, arr);
  }
  const allPricing = [...pricing].sort((a, b) => b.purePremium - a.purePremium);
  const motorScatter = (pricingByLob.get("Motor") ?? []).map((p) => ({ x: Number(p.frequency.toFixed(4)), y: Math.round(p.severity), z: Math.round(p.exposure), name: p.segment }));

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Chain ladder · Mack · Bornhuetter-Ferguson · Cape Cod · Tweedie GLM"
        title="Actuarial Intelligence Layer"
        description="Paid and incurred development triangles are built directly from gold.fact_claims, then projected with four reserving methods including Mack's analytical standard error. Pricing segments decompose expected loss into frequency × severity with relativities that feed rate indications."
        icon={<Calculator size={18} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Paid to date" value={compactKes(totalPaid)} sub="all lines, all origin quarters" tone="cyan" icon={<Sigma size={15} />} />
        <Kpi label="Ultimate claims" value={compactKes(totalUltimate)} sub="chain ladder projection" tone="gold" icon={<TrendingUp size={15} />} />
        <Kpi label="IBNR reserve" value={compactKes(totalIbnr)} sub={`${((totalIbnr / Math.max(1, totalUltimate)) * 100).toFixed(1)}% of ultimate`} tone="rose" icon={<LineChart size={15} />} />
        <Kpi label="Mack standard error" value={compactKes(totalSe)} sub={`CV ${((totalSe / Math.max(1, totalIbnr)) * 100).toFixed(1)}%`} tone="slate" />
        <Kpi label="Motor LDF (dev 0→1)" value={(motor?.ldf[0] ?? 1).toFixed(3)} sub={`tail ${motor ? motor.ldf[motor.ldf.length - 1].toFixed(3) : "1.000"}`} tone="cyan" />
        <Kpi label="Pricing segments" value={String(pricing.length)} sub="frequency × severity relativities" tone="emerald" />
      </div>

      <Panel title="Claims reserving" subtitle="development triangles and four-method projection per line of business" accent="#a78bfa" right={<Badge tone="gold">R · chainladder</Badge>}>
        <ReservingPanel data={reserving} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Method comparison — total IBNR" subtitle="chain ladder vs Bornhuetter-Ferguson vs Cape Cod (KSh M)" accent="#22d3ee">
          <HBars
            data={reserving.flatMap((d) => [
              { name: `${d.lob} · CL`, value: Number((d.methods.chain_ladder.reduce((s, r) => s + r.ibnr, 0) / 1e6).toFixed(1)) },
              { name: `${d.lob} · BF`, value: Number((d.methods.bornhuetter_ferguson.reduce((s, r) => s + r.ibnr, 0) / 1e6).toFixed(1)) },
              { name: `${d.lob} · CC`, value: Number((d.methods.cape_cod.reduce((s, r) => s + r.ibnr, 0) / 1e6).toFixed(1)) },
            ])}
            xKey="name"
            yKey="value"
            color="#a78bfa"
            height={380}
            fmt="M"
          />
        </Panel>

        <Panel className="xl:col-span-4" title="Reserve adequacy by line" subtitle="IBNR as a % of paid to date — immaturity indicator" accent="#eab308">
          <div className="space-y-3">
            {reserving.map((d) => {
              const paid = d.methods.chain_ladder.reduce((s, r) => s + r.paidToDate, 0);
              const ibnr = d.methods.chain_ladder.reduce((s, r) => s + r.ibnr, 0);
              const ratio = paid > 0 ? (ibnr / paid) * 100 : 0;
              return (
                <div key={d.lob}>
                  <Bar label={d.lob} right={`${ratio.toFixed(1)}% · CV ${(d.mackCv * 100).toFixed(1)}%`} value={ratio} max={Math.max(...reserving.map((x) => (x.methods.chain_ladder.reduce((s, r) => s + r.paidToDate, 0) > 0 ? (x.methods.chain_ladder.reduce((s, r) => s + r.ibnr, 0) / x.methods.chain_ladder.reduce((s, r) => s + r.paidToDate, 0)) * 100 : 0)), 1)} tone={ratio > 45 ? "rose" : ratio > 25 ? "gold" : "emerald"} />
                  <p className="mono mt-1 text-[9.5px] text-slate-600">
                    paid {compactKes(paid)} → ultimate {compactKes(paid + ibnr)} · a-priori LR {((d.methods.bornhuetter_ferguson[0]?.apriori ?? 0) * 100).toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <MetricRow label="Selected method" value="Chain ladder (paid)" tone="text-cyan-300" />
            <MetricRow label="Tail factor" value="1.000" />
            <MetricRow label="LDF estimator" value="volume weighted" />
            <MetricRow label="Stochastic model" value="Mack (1993)" />
          </div>
        </Panel>

        <Panel className="xl:col-span-3" title="Frequency × severity" subtitle="Motor: pure premium = claim frequency × average severity" accent="#34d399">
          <ScatterRisk data={motorScatter} xName="Claim frequency" yName="Severity (KSh)" />
          <p className="mono mt-2 text-[10px] leading-relaxed text-slate-500">
            bubble size = exposure (policies). Red zone segments are under-priced: indicated rate change &gt; 0 means the pure premium exceeds the average charged premium.
          </p>
        </Panel>
      </div>

      <Panel title="Pricing segments — pure premium & rate indication" subtitle="Tweedie GLM factors materialised as gold.pricing_segment · relativity vs portfolio base" accent="#34d399" right={<Badge tone="emerald">Expected loss = frequency × severity</Badge>}>
        <DataTable
          maxHeight={420}
          rows={allPricing.map((p) => ({
            lob: p.lob,
            segment: p.segment,
            exposure: Math.round(p.exposure),
            claims: p.claimCount,
            frequency: Number(p.frequency.toFixed(4)),
            severity: Math.round(p.severity),
            pure_premium: Math.round(p.purePremium),
            relativity: Number(p.relativity.toFixed(3)),
            avg_premium: Math.round(p.averagePremium),
            loss_ratio: `${(p.lossRatio * 100).toFixed(1)}%`,
            indicated_rate_change: `${(p.indicatedRateChange * 100).toFixed(1)}%`,
            telematics_adj: `${(p.telematicsAdj * 100).toFixed(1)}%`,
          }))}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel title="Rate indications to act on" accent="#f43f5e">
          {allPricing
            .filter((p) => p.indicatedRateChange > 0.05)
            .sort((a, b) => b.indicatedRateChange - a.indicatedRateChange)
            .slice(0, 6)
            .map((p) => (
              <div key={p.id} className="mb-2">
                <Bar label={`${p.lob} · ${p.segment}`} right={`+${(p.indicatedRateChange * 100).toFixed(1)}%`} value={p.indicatedRateChange} max={allPricing[0]?.indicatedRateChange ?? 1} tone="rose" />
              </div>
            ))}
          <p className="mono mt-3 text-[10px] text-slate-500">Segments where the pure premium exceeds the average charged premium by more than 5%.</p>
        </Panel>
        <Panel title="Discount headroom" accent="#34d399">
          {allPricing
            .filter((p) => p.indicatedRateChange < -0.05)
            .sort((a, b) => a.indicatedRateChange - b.indicatedRateChange)
            .slice(0, 6)
            .map((p) => (
              <div key={p.id} className="mb-2">
                <Bar label={`${p.lob} · ${p.segment}`} right={`${(p.indicatedRateChange * 100).toFixed(1)}%`} value={Math.abs(p.indicatedRateChange)} max={Math.abs(allPricing[allPricing.length - 1]?.indicatedRateChange ?? 1)} tone="emerald" />
              </div>
            ))}
          <p className="mono mt-3 text-[10px] text-slate-500">Retention opportunity — profitable segments priced above the indicated level.</p>
        </Panel>
        <Panel title="Telematics (PHYD) adjustment" accent="#22d3ee">
          {allPricing
            .slice(0, 8)
            .map((p) => (
              <div key={p.id} className="mb-2">
                <Bar label={`${p.lob} · ${p.segment}`} right={`${(p.telematicsAdj * 100).toFixed(1)}%`} value={Math.abs(p.telematicsAdj)} max={0.25} tone={p.telematicsAdj < 0 ? "emerald" : "rose"} />
              </div>
            ))}
          <p className="mono mt-3 text-[10px] text-slate-500">Driver-score relativities from fact_vehicle_events: good drivers earn up to −25%, high-risk drivers up to +25%.</p>
        </Panel>
      </div>
    </div>
  );
}
