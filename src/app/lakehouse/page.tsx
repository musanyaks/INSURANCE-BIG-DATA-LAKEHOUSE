import { ArrowUpRight, Layers } from "lucide-react";
import Link from "next/link";
import { Badge, DataTable, LayerTag, MetricRow, Panel, SectionHeading } from "@/components/ui";
import { DatasetBrowser, type BronzeSample, type DatasetGroup } from "@/components/dataset-browser";
import { bronzeSample, lakehouseData, layerCounts, sampleRows } from "@/lib/queries";
import * as S from "@/db/schema";
import { KAFKA_TOPICS } from "@/lib/kenya";

export const dynamic = "force-dynamic";

export default async function LakehouseExplorer() {
  const [lake, layers, claimsBronze, mpesaBronze, telBronze, sClaim, sCustomer, sPolicy, sPayment, sVehicle, sProvider, sTelematics, fClaims, fFraud, fPremiums] = await Promise.all([
    lakehouseData(),
    layerCounts(),
    bronzeSample("insurance.claims", 8),
    bronzeSample("insurance.mpesa", 6),
    bronzeSample("insurance.telematics", 6),
    sampleRows(S.silverClaim, 14),
    sampleRows(S.silverCustomer, 12),
    sampleRows(S.silverPolicy, 12),
    sampleRows(S.silverPayment, 12),
    sampleRows(S.silverVehicle, 12),
    sampleRows(S.silverProvider, 12),
    sampleRows(S.silverTelematics, 12),
    sampleRows(S.factClaims, 14),
    sampleRows(S.factFraudEvents, 10),
    sampleRows(S.factPremiums, 12),
  ]);

  const bronze: BronzeSample[] = [...claimsBronze, ...mpesaBronze, ...telBronze].map((b) => ({ ...b, payload: b.payload as Record<string, unknown> }));

  const groups: Record<string, DatasetGroup> = {
    "bronze.claims": { layer: "bronze", label: `${layers.bronze.toLocaleString("en-KE")} raw events across all topics`, note: "append-only Iceberg · no transformation · schema v1→v3 preserved", rows: claimsBronze.map((b) => ({ event_id: b.eventId, topic: b.topic, schema_v: b.schemaVersion, claim_id: (b.payload as Record<string, unknown>).claim_id, amount: (b.payload as Record<string, unknown>).claim_amount, location: (b.payload as Record<string, unknown>).location, status: (b.payload as Record<string, unknown>).status, lake_path: b.lakePath })) },
    "bronze.mpesa": { layer: "bronze", label: "M-PESA Daraja receipts (PII column-masked)", note: "msisdn masked for analysts · raw retained for audit", rows: mpesaBronze.map((b) => ({ event_id: b.eventId, source: b.sourceSystem, receipt: (b.payload as Record<string, unknown>).mpesa_receipt, msisdn: (b.payload as Record<string, unknown>).msisdn, amount: (b.payload as Record<string, unknown>).amount, status: (b.payload as Record<string, unknown>).status })) },
    "bronze.telematics": { layer: "bronze", label: "IoT gateway vehicle events (protobuf v4)", note: "hourly compaction · dt + hour partitioned", rows: telBronze.map((b) => ({ event_id: (b.payload as Record<string, unknown>).event_id, device: (b.payload as Record<string, unknown>).device_id, reg: (b.payload as Record<string, unknown>).vehicle_reg, speed: (b.payload as Record<string, unknown>).speed_kmh, harsh: (b.payload as Record<string, unknown>).harsh_braking, km: (b.payload as Record<string, unknown>).distance_km })) },
    "silver.claim": { layer: "silver", label: `${(layers.counts.silver_claim ?? 0).toLocaleString("en-KE")} cleansed claims`, note: "deduped · typed · FK-validated · quality_flags retained", rows: sClaim },
    "silver.customer": { layer: "silver", label: `${(layers.counts.silver_customer ?? 0).toLocaleString("en-KE")} golden customer records`, note: "entity resolution on national_id · E.164 phone normalisation", rows: sCustomer },
    "silver.policy": { layer: "silver", label: `${(layers.counts.silver_policy ?? 0).toLocaleString("en-KE")} policies with SCD2 history`, note: "CDC collapsed by ts_ms · valid_from/valid_to history", rows: sPolicy },
    "silver.payment": { layer: "silver", label: `${(layers.counts.silver_payment ?? 0).toLocaleString("en-KE")} payments`, note: "receipt validation · 30-day velocity features", rows: sPayment },
    "silver.vehicle": { layer: "silver", label: `${(layers.counts.silver_vehicle ?? 0).toLocaleString("en-KE")} vehicles`, note: "NTSA registration status joined", rows: sVehicle },
    "silver.provider": { layer: "silver", label: `${(layers.counts.silver_provider ?? 0).toLocaleString("en-KE")} hospitals & garages`, note: "accreditation, licence status, network degree", rows: sProvider },
    "silver.telematics": { layer: "silver", label: `${(layers.counts.silver_telematics ?? 0).toLocaleString("en-KE")} vehicle events`, note: "range-clipped, device de-duplicated", rows: sTelematics },
    "gold.fact_claims": { layer: "gold", label: `${(layers.counts.fact_claims ?? 0).toLocaleString("en-KE")} conformed claim facts`, note: "7 dimensions · ultimate = paid + reserve", rows: fClaims },
    "gold.fact_premiums": { layer: "gold", label: `${(layers.counts.fact_premiums ?? 0).toLocaleString("en-KE")} premium snapshots`, note: "month × LOB × county periodic snapshot", rows: fPremiums },
    "gold.fact_fraud_events": { layer: "gold", label: `${(layers.counts.fact_fraud_events ?? 0).toLocaleString("en-KE")} scored fraud alerts`, note: "model provenance + feature snapshot + reasons", rows: fFraud.map((r) => ({ ...r, reasons: `${(r.reasons as unknown[])?.length ?? 0} reasons`, features: "19 features", networkLinks: `${(r.networkLinks as unknown[])?.length ?? 0} links` })) },
  };

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Bronze · Silver · Gold"
        title="Lakehouse Explorer"
        description="Browse every medallion layer exactly as it sits on object storage. Bronze preserves the original event byte-for-byte, Silver is cleansed/conformed/entity-resolved, Gold holds the conformed insurance marts consumed by Trino, Power BI and the actuarial models."
        icon={<Layers size={18} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { layer: "bronze", rows: layers.bronze, tables: 9, size: `${(layers.bronzeBytes / 1024 / 1024).toFixed(1)} MB` },
          { layer: "silver", rows: Object.entries(layers.counts).filter(([k]) => k.startsWith("silver_")).reduce((s, [, v]) => s + v, 0), tables: 8, size: "Parquet + Iceberg v2" },
          { layer: "gold", rows: Object.entries(layers.counts).filter(([k]) => k.startsWith("fact_") || k.startsWith("dim_")).reduce((s, [, v]) => s + v, 0), tables: 7, size: "5 facts · 2 dims" },
          { layer: "ml", rows: layers.counts.dev_triangle + layers.counts.reserve_result + layers.counts.pricing_segment, tables: 3, size: "triangles · reserves · pricing" },
        ].map((c) => (
          <div key={c.layer} className="panel p-3.5">
            <div className="flex items-center justify-between">
              <LayerTag layer={c.layer === "ml" ? "gold" : c.layer} />
              <span className="mono text-[10px] text-slate-500">{c.tables} datasets</span>
            </div>
            <p className="mono mt-2.5 text-[22px] leading-none font-semibold text-slate-50">{c.rows.toLocaleString("en-KE")}</p>
            <p className="mono mt-1.5 text-[10px] text-slate-500">{c.size}</p>
          </div>
        ))}
      </div>

      <Panel title="Dataset browser" subtitle="select a table to inspect real rows from the lakehouse" accent="#22d3ee" right={<Badge tone="cyan">Trino SQL backed</Badge>}>
        <DatasetBrowser groups={groups} bronze={bronze} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Schema evolution without destroying history" subtitle="Iceberg schema versions · additive changes are backwards compatible" accent="#a78bfa">
          <DataTable
            rows={lake.schemas.map((s) => ({
              dataset: s.dataset,
              v: `v${s.version}`,
              released: s.releasedAt.toISOString().slice(0, 10),
              compatible: s.compatible ? "additive ✓" : "BREAKING ⚠",
              fields: (s.addedFields as string[]).join(", "),
              note: s.note,
            }))}
            columns={["dataset", "v", "released", "compatible", "fields", "note"]}
            maxHeight={300}
          />
        </Panel>

        <Panel className="xl:col-span-5" title="Kafka topic inventory" subtitle="8 topics · partitioned · schema-registry governed" accent="#38bdf8" right={<Link href="/streaming" className="mono flex items-center gap-1 text-[10.5px] text-cyan-300">streaming <ArrowUpRight size={11} /></Link>}>
          <div className="space-y-2">
            {KAFKA_TOPICS.map((t) => {
              const bc = lake.bronzeTopicCounts.find((b) => b.topic === t.topic);
              return (
                <div key={t.topic} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11.5px] text-cyan-300">{t.topic}</span>
                    <Badge tone="slate">{t.partitions} partitions</Badge>
                    <span className="mono ml-auto text-[10.5px] text-slate-400">{bc ? Number(bc.n).toLocaleString("en-KE") : 0} bronze rows</span>
                  </div>
                  <p className="mono mt-1 text-[10px] text-slate-500">
                    {t.source} · {t.schema} · retention {t.retention}
                  </p>
                  {bc && (
                    <p className="mono mt-1 text-[10px] text-slate-600">
                      schema mix: v1 {Number(bc.v1).toLocaleString("en-KE")} · v2 {Number(bc.v2).toLocaleString("en-KE")} · v3+ {Number(bc.v3).toLocaleString("en-KE")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Data catalog (OpenMetadata)" subtitle="ownership, classification, PII flags, storage location, snapshot counts" accent="#34d399">
        <DataTable
          rows={lake.catalog.map((c) => ({
            dataset: c.dataset,
            layer: c.layer,
            domain: c.domain,
            format: `${c.tableFormat} / ${c.fileFormat}`,
            location: c.location,
            rows: c.rows,
            size_mb: c.sizeMb,
            owner: c.owner,
            classification: c.classification,
            pii: c.pii ? "YES" : "no",
            snapshots: c.snapshots,
            partitions: (c.partitions as string[]).join(", ") || "—",
          }))}
          maxHeight={420}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel title="Bronze guarantees" accent="#c9803f">
          <MetricRow label="Immutability" value="append-only" tone="text-orange-300" />
          <MetricRow label="Transformations" value="none" />
          <MetricRow label="Reprocessing" value="always possible" />
          <MetricRow label="Partitioning" value="dt=YYYY/MM/DD" />
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            Every source event is retained verbatim so any downstream number can be recomputed from raw. Duplicates, negative amounts and future dates are preserved here and only resolved in Silver.
          </p>
        </Panel>
        <Panel title="Silver guarantees" accent="#94a3b8">
          <MetricRow label="Deduplication" value="claim_id + ts_ms" />
          <MetricRow label="Entity resolution" value="national_id graph" />
          <MetricRow label="Referential integrity" value="policy / customer FK" />
          <MetricRow label="Quarantine" value="dq_quarantine zone" />
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            Type coercion (string → decimal), county standardisation, E.164 phone normalisation, SCD2 policy history and Great Expectations gates before anything reaches Gold.
          </p>
        </Panel>
        <Panel title="Gold guarantees" accent="#eab308">
          <MetricRow label="Grain" value="business process" />
          <MetricRow label="Dimensions" value="7 conformed" />
          <MetricRow label="Served by" value="Trino / Next.js" />
          <MetricRow label="Consumers" value="BI · ML · actuarial" />
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            Claims, premium, payment, fraud and telematics marts plus dim_date/dim_location — the single source of truth behind the executive control centre and the actuarial models.
          </p>
        </Panel>
      </div>
    </div>
  );
}
