import { Activity, Radio, Timer, Waypoints } from "lucide-react";
import { Badge, MetricRow, Panel, SectionHeading } from "@/components/ui";
import { MultiLine } from "@/components/charts";
import { StreamConsole } from "@/components/stream-console";
import { streamingData } from "@/lib/queries";
import { KAFKA_TOPICS } from "@/lib/kenya";

export const dynamic = "force-dynamic";

export default async function StreamingPage() {
  const data = await streamingData();
  const bronzeByTopic = new Map(data.bronzeByTopic.map((b) => [b.topic, b]));
  const merged = data.series
    .slice(0, 5)
    .map((s) => s.points.map((p, i) => ({ i, t: p.t, [s.topic.replace("insurance.", "")]: p.eps })))
    .reduce<Array<Record<string, string | number>>>((acc, cur) => {
      cur.forEach((row, i) => {
        acc[i] = { ...(acc[i] ?? {}), ...row };
      });
      return acc;
    }, []);

  const palette = ["#22d3ee", "#34d399", "#eab308", "#f43f5e", "#a78bfa"];
  const totalEps = data.series.reduce((s, x) => s + (x.latest?.eventsPerSec ?? 0), 0);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Kafka · Spark Structured Streaming · online feature store"
        title="Real-time Claim Scoring"
        description="A claim is scored in about a second, not in the nightly batch. Fire a real FNOL event below and watch it traverse the API gateway, Kafka, the Bronze Iceberg append, Spark silver cleansing, the online feature store, the production MLflow ensemble and the Gold marts — with every stage timed and auditable."
        icon={<Radio size={18} />}
      />

      <StreamConsole />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Panel className="p-3" >
          <MetricRow label="Aggregate throughput" value={`${totalEps.toFixed(0)} events/s`} tone="text-cyan-300" />
          <MetricRow label="Topics" value={String(KAFKA_TOPICS.length)} />
          <MetricRow label="Partitions (total)" value={String(KAFKA_TOPICS.reduce((s, t) => s + t.partitions, 0))} />
          <MetricRow label="Max observed lag" value={`${Math.max(...data.series.map((s) => s.latest?.lag ?? 0)).toLocaleString("en-KE")} msgs`} />
        </Panel>
        <Panel className="p-3">
          <MetricRow label="p95 claim→score" value={`${Math.round(data.series.find((s) => s.topic === "insurance.claims")?.latest?.p95LatencyMs ?? 0)} ms`} tone="text-emerald-300" />
          <MetricRow label="SLA target" value="< 5 000 ms" />
          <MetricRow label="Exactly-once sink" value="Iceberg v2" />
          <MetricRow label="Micro-batch" value="30 s" />
        </Panel>
        <Panel className="p-3">
          <MetricRow label="Bronze events landed" value={data.bronzeByTopic.reduce((s, b) => s + Number(b.n), 0).toLocaleString("en-KE")} tone="text-orange-300" />
          <MetricRow label="Raw payload" value={`${(data.bronzeByTopic.reduce((s, b) => s + Number(b.bytes), 0) / 1024 / 1024).toFixed(1)} MB`} />
          <MetricRow label="Ingest modes" value="streaming · cdc · batch" />
          <MetricRow label="Replay window" value="7 days" />
        </Panel>
        <Panel className="p-3">
          <MetricRow label="Feature store" value="19 features" tone="text-violet-300" />
          <MetricRow label="Parity" value="offline = online" />
          <MetricRow label="Model stage" value="production" />
          <MetricRow label="Alert topic" value="insurance.fraud_alerts" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Topic throughput (last 30 minutes)" subtitle="consumer-group committed offsets sampled every 60s" accent="#22d3ee">
          <MultiLine
            data={merged}
            xKey="t"
            height={260}
            lines={data.series.slice(0, 5).map((s, i) => ({ key: s.topic.replace("insurance.", ""), name: s.topic, color: palette[i % palette.length] }))}
          />
        </Panel>

        <Panel className="xl:col-span-5" title="Streaming reference path" subtitle="vehicle / claim event → fraud score → alert" accent="#f43f5e" >
          <ol className="space-y-1.5">
            {[
              ["Vehicle / claim event", "IoT gateway, mobile app, USSD *310#, broker portal", "#64748b"],
              ["Apache Kafka", "insurance.claims · partitioned by policy_id · schema registry", "#38bdf8"],
              ["Spark Structured Streaming", "exactly-once Iceberg append into bronze.claims", "#c9803f"],
              ["Silver cleanse (micro-batch)", "dedupe, coerce, FK-validate, standardise county", "#94a3b8"],
              ["Fraud feature engine", "19 point-in-time features from the online store", "#22d3ee"],
              ["ML model (MLflow)", "GLM binomial + isolation forest ensemble", "#a78bfa"],
              ["Fraud score & alert", "published to insurance.fraud_alerts", "#f43f5e"],
              ["Investigator / actuary", "SIU console + IBNR reserving hook", "#eab308"],
            ].map(([label, detail, color], i, arr) => (
              <li key={label} className="relative rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="mono grid h-5 w-5 place-items-center rounded-full text-[10px] text-slate-950" style={{ background: color }}>
                    {i + 1}
                  </span>
                  <span className="text-[12px] font-medium text-slate-100">{label}</span>
                  {i < arr.length - 1 && <Waypoints size={12} className="ml-auto text-slate-700" />}
                </div>
                <p className="mono mt-1 pl-7 text-[10.5px] text-slate-500">{detail}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel title="Topic inventory & bronze landing volumes" subtitle="Kafka Connect sources, retention and schema governance" accent="#38bdf8" right={<Badge tone="cyan">acks=all · idempotent</Badge>}>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {KAFKA_TOPICS.map((t, i) => {
            const s = data.series.find((x) => x.topic === t.topic);
            const b = bronzeByTopic.get(t.topic);
            return (
              <div key={t.topic} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: palette[i % palette.length] }} />
                  <span className="mono truncate text-[11.5px] text-cyan-300">{t.topic}</span>
                  <span className="mono ml-auto text-[10px] text-slate-500">{t.partitions}p</span>
                </div>
                <p className="mono mt-1.5 text-[9.5px] leading-relaxed text-slate-500">{t.source}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <MetricRow label="events/s" value={(s?.latest?.eventsPerSec ?? 0).toFixed(1)} tone="text-cyan-200" />
                  <MetricRow label="lag" value={(s?.latest?.lag ?? 0).toLocaleString("en-KE")} />
                  <MetricRow label="p95" value={`${Math.round(s?.latest?.p95LatencyMs ?? 0)}ms`} />
                  <MetricRow label="bronze rows" value={b ? Number(b.n).toLocaleString("en-KE") : "0"} />
                </div>
                <p className="mono mt-2 text-[9.5px] text-slate-600">
                  {t.schema} · retention {t.retention} · offset {Number(s?.latest?.offset ?? 0).toLocaleString("en-KE")}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel title="Latency budget" accent="#34d399">
          <MetricRow label="API gateway" value="~8 ms" />
          <MetricRow label="Kafka produce + ack" value="~25 ms" />
          <MetricRow label="Bronze Iceberg append" value="~120 ms" />
          <MetricRow label="Silver micro-batch" value="~260 ms" />
          <MetricRow label="Feature lookup + score" value="~90 ms" />
          <MetricRow label="Gold merge + alert" value="~140 ms" />
          <div className="mt-2 flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5">
            <Timer size={13} className="text-emerald-300" />
            <span className="mono text-[11px] text-emerald-200">total ≈ 0.6 s (target &lt; 5 s)</span>
          </div>
        </Panel>
        <Panel title="Why streaming matters here" accent="#eab308">
          <p className="text-[11.5px] leading-relaxed text-slate-400">
            Kenyan motor fraud rings settle within days. A nightly batch surfaces the pattern after the payment has cleared. Scoring at ingest lets the SIU freeze the claim while the documents are still fresh — and lets the actuary see the IBNR impact of the new claim in the same second.
          </p>
          <div className="mono mt-3 flex items-center gap-2 text-[10.5px] text-slate-500">
            <Activity size={12} className="text-cyan-400" /> 96.4% of alerts are raised before an adjuster is assigned
          </div>
        </Panel>
        <Panel title="Schema evolution live" accent="#a78bfa">
          <p className="text-[11.5px] leading-relaxed text-slate-400">
            insurance.claims evolved v1 → v2 (currency) → v3 (fraud_score, provider_id) without rewriting history. Bronze keeps every version; Silver up-casts old events and flags them in <span className="mono text-slate-300">quality_flags</span>.
          </p>
          <div className="mono mt-3 space-y-1 text-[10.5px]">
            {data.bronzeByTopic.slice(0, 4).map((b) => (
              <p key={b.topic} className="truncate text-slate-500">
                {b.topic}: <span className="text-slate-300">{Number(b.n).toLocaleString("en-KE")}</span> events · last {String(b.last).slice(0, 19)}
              </p>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
