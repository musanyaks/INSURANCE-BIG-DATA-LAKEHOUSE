import { Boxes, Layers, Rocket } from "lucide-react";
import { Badge, Panel, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

const STACK = [
  ["Ingestion (stream)", "Apache Kafka + Kafka Connect (Debezium CDC, Daraja M-PESA, MQTT IoT bridge)"],
  ["Batch ingestion", "Python 3.12 · Airflow operators · SFTP/KNBS/KMD external feeds"],
  ["Orchestration", "Apache Airflow 2.10 (9 DAGs, dataset-aware scheduling)"],
  ["Processing", "Apache Spark 3.5 (Structured Streaming + batch), Delta/Iceberg writers"],
  ["Storage", "S3 / MinIO object store, partitioned by dt=YYYY/MM/DD"],
  ["File format", "Apache Parquet (Snappy) for silver/gold, JSON for bronze"],
  ["Table format", "Apache Iceberg v2 (hidden partitioning, snapshot expiry, MERGE INTO)"],
  ["Transformation", "dbt-core (34 models, incremental + snapshots, 47 tests)"],
  ["SQL engine", "Trino 4xx federated over Iceberg"],
  ["Metadata / lineage", "OpenMetadata (column-level lineage, glossary, ownership)"],
  ["Data quality", "Great Expectations checkpoints as dbt post-hooks"],
  ["ML platform", "Python · scikit-learn · MLflow registry & experiment tracking"],
  ["Actuarial", "R (chainladder, actuar, tweedie) for reserving & pricing validation"],
  ["Serving API", "FastAPI (FNOL intake, scoring, alert workflow)"],
  ["BI", "Power BI / Apache Superset semantic layer + Next.js control centre"],
  ["Dashboard", "Next.js 16 (App Router, RSC) + Recharts, served over Trino"],
  ["Containers", "Docker · docker-compose for local, Helm charts for cluster"],
  ["Deployment", "Kubernetes (EKS) · Karpenter spot pools for Spark executors"],
  ["Cloud", "AWS af-south-1 (S3, MSK, EMR on EKS, RDS, Glue Catalog)"],
];

const REPO = `06-insurance-big-data-lakehouse/
├── README.md
├── architecture/            # diagrams, lakehouse design, data-flow
├── ingestion/
│   ├── kafka/               # topic creation, connect configs, avro schemas
│   ├── api/                 # FastAPI FNOL intake + M-PESA Daraja webhook
│   ├── database/            # Debezium CDC (policy admin, CRM)
│   └── files/               # KNBS / KMD / NTSA batch loaders
├── streaming/
│   ├── claims_stream.py     # bronze landing, exactly-once Iceberg sink
│   ├── payments_stream.py   # M-PESA reconciliation + velocity features
│   ├── telematics_stream.py # IoT decode, driver score rollups
│   └── fraud_stream.py      # feature engine → model → alert topic
├── spark/
│   ├── bronze/  ├── silver/  └── gold/
├── lakehouse/               # iceberg table DDL, partition specs, policies
├── dbt/
│   ├── models/  ├── tests/  └── snapshots/   # SCD2 policy & customer
├── actuarial/
│   ├── reserving/           # chain ladder, Mack, BF, Cape Cod (R)
│   ├── pricing/             # Tweedie GLM, relativities, rate indication
│   ├── frequency/           # Poisson GLM
│   └── severity/            # Gamma / lognormal
├── ml/
│   ├── fraud/               # features, ensemble, graph communities
│   ├── churn/  ├── risk/  └── models/
├── governance/
│   ├── quality/             # great_expectations suites & checkpoints
│   ├── lineage/             # OpenMetadata ingestion pipelines
│   └── catalog/             # glossary, ownership, PII policies
├── api/main.py              # FastAPI: claims, scores, alerts, governance
├── dashboard/               # this Next.js control centre
├── powerbi/                 # .pbip semantic models + DAX measures
├── infrastructure/
│   ├── docker/  ├── kubernetes/  └── terraform/
├── tests/                   # pytest + dbt tests + contract tests
├── docs/
└── docker-compose.yml       # kafka, minio, spark, trino, airflow, mlflow`;

const DEMO = [
  ["Customer submits a claim", "Mobile app / USSD *310# / broker portal → FastAPI FNOL endpoint", "#64748b"],
  ["Kafka", "insurance.claims, partitioned by policy_id, schema registry v3", "#38bdf8"],
  ["Bronze lake", "Spark Structured Streaming, exactly-once Iceberg append, immutable JSON", "#c9803f"],
  ["Silver lakehouse", "dedupe · type coercion · county standardisation · FK validation · quarantine", "#94a3b8"],
  ["Feature engineering", "19 point-in-time features (frequency, velocity, provider risk, telematics…)", "#22d3ee"],
  ["Fraud ML model", "GLM binomial + isolation forest ensemble served from MLflow", "#a78bfa"],
  ["Risk score = 94.7%", "published to insurance.fraud_alerts within ~1 second", "#f43f5e"],
  ["Investigator", "SIU console: reasons, feature snapshot, entity network, decision write-back", "#fb923c"],
  ["Gold data mart", "fact_claims + fact_fraud_events merged into Iceberg", "#eab308"],
  ["Power BI / control centre", "executive tiles refreshed within the 15s SLA", "#34d399"],
];

function ArchitectureDiagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string, color: string, key: string) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx={9} fill="#0b1020" stroke={color} strokeWidth={1.2} />
      <rect x={x} y={y} width={4} height={h} rx={2} fill={color} />
      <text x={x + 14} y={y + 20} fontSize={11.5} fill="#e2e8f0" fontWeight="600">
        {title}
      </text>
      <text x={x + 14} y={y + 35} fontSize={9.2} fill="#94a3b8" className="mono">
        {sub}
      </text>
    </g>
  );
  const arrow = (d: string, key: string, hot = false) => <path key={key} d={d} fill="none" stroke={hot ? "#22d3ee" : "#334155"} strokeWidth={hot ? 1.6 : 1.2} markerEnd="url(#a)" className={hot ? "flow-line" : undefined} />;

  return (
    <svg viewBox="0 0 1080 700" className="min-w-[900px]">
      <defs>
        <marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill="#475569" />
        </marker>
      </defs>

      <text x={20} y={26} fontSize={10} fill="#22d3ee" letterSpacing="2" className="mono">
        INSURANCE DATA SOURCES
      </text>
      {[
        ["Policy admin core (SAP FS)", "CDC · Debezium"],
        ["M-PESA Daraja API", "receipts · STK"],
        ["Claims / FNOL API", "JSON · REST"],
        ["IoT telematics gateway", "MQTT · protobuf"],
        ["CRM (Salesforce)", "customers · interactions"],
        ["External: KNBS · KMD · NTSA", "CSV / SFTP"],
      ].map(([t, s], i) => box(20 + (i % 3) * 350, 40 + Math.floor(i / 3) * 62, 330, 50, t, s, "#64748b", `src${i}`))}

      {arrow("M 540 165 L 540 196", "a1", true)}
      {box(290, 196, 500, 56, "Apache Kafka — 8 topics, 74 partitions", "insurance.claims · payments · mpesa · policies · telematics · customers · interactions · fraud_alerts", "#38bdf8", "kafka")}

      {arrow("M 540 252 L 540 282", "a2", true)}
      {box(290, 282, 500, 52, "Data ingestion — Spark Structured Streaming + Airflow", "exactly-once Iceberg sink · 30s micro-batch · schema registry", "#c9803f", "ingest")}

      {arrow("M 540 334 L 540 364", "a3", true)}
      <g>
        <rect x={110} y={364} width={860} height={130} rx={12} fill="#070b16" stroke="#1e293b" />
        <text x={128} y={386} fontSize={10.5} fill="#94a3b8" letterSpacing="1.8" className="mono">
          DATA LAKE — S3 / MinIO · APACHE ICEBERG v2 · PARQUET/JSON
        </text>
        {box(130, 396, 250, 82, "🥉 BRONZE — raw", "append-only · no transformation\nschema v1/v2/v3 preserved · 7y retention", "#c9803f", "bronze")}
        {box(405, 396, 250, 82, "🥈 SILVER — cleansed", "dedupe · typed · FK-validated\nentity resolution · SCD2 · quarantine", "#94a3b8", "silver")}
        {box(680, 396, 270, 82, "🥇 GOLD — marts", "fact_claims · fact_premiums · fact_payments\nfact_fraud_events · fact_vehicle_events · dims", "#eab308", "gold")}
        {arrow("M 380 437 L 403 437", "l1", true)}
        {arrow("M 655 437 L 678 437", "l2", true)}
      </g>

      {arrow("M 300 494 L 300 528", "a4")}
      {arrow("M 540 494 L 540 528", "a5", true)}
      {arrow("M 800 494 L 800 528", "a6")}
      {box(140, 528, 320, 56, "Spark · dbt · Trino", "34 dbt models · 47 tests · Great Expectations", "#22d3ee", "compute")}
      {box(480, 528, 130, 56, "OpenMetadata", "lineage · catalog · glossary", "#34d399", "meta")}
      {box(630, 528, 330, 56, "Actuarial + ML", "R chainladder/Mack · Tweedie GLM · MLflow ensemble", "#a78bfa", "ml")}

      {arrow("M 300 584 L 300 616", "a7")}
      {arrow("M 795 584 L 795 616", "a8", true)}
      {box(140, 616, 320, 56, "Power BI / Apache Superset", "semantic layer · DAX measures · RLS", "#f472b6", "bi")}
      {box(480, 616, 480, 56, "INSURELAKE Control Centre — Next.js App Router over Trino", "executive · actuarial · fraud · governance · streaming consoles", "#22d3ee", "app")}
    </svg>
  );
}

export default function ArchitecturePage() {
  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Reference architecture"
        title="Platform Architecture & Repository"
        description="INSURELAKE moves an insurer from raw data to decisions: ingestion → bronze → silver → gold → actuarial & ML → BI, governed end-to-end with lineage, quality expectations and a catalogued, owned, classified data estate."
        icon={<Layers size={18} />}
      />

      <Panel title="System architecture" subtitle="every box below is implemented in this repository — the lakehouse layers are real PostgreSQL/Iceberg-style tables served by Trino-equivalent SQL" accent="#22d3ee" right={<Badge tone="cyan">AWS af-south-1 · EKS</Badge>}>
        <div className="scroll-thin overflow-x-auto">
          <ArchitectureDiagram />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="The killer demo" subtitle="a new insurance claim arrives — traced end to end" accent="#f43f5e" right={<Badge tone="rose">~1 second to score</Badge>}>
          <ol className="space-y-1.5">
            {DEMO.map(([title, detail, color], i) => (
              <li key={title} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-slate-950" style={{ background: color }}>
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium text-slate-100">{title}</span>
                  <span className="mono block text-[10.5px] leading-relaxed text-slate-500">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mono mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] p-2.5 text-[10.5px] leading-relaxed text-cyan-200">
            Simultaneously: claim → paid/incurred triangle increment → chain-ladder IBNR impact → actuarial dashboard. Data engineering + streaming + lakehouse + ML + actuarial science + BI in one path.
          </p>
        </Panel>

        <div className="space-y-4 xl:col-span-5">
          <Panel title="Technology stack" subtitle="what each layer is built with" accent="#a78bfa" right={<Rocket size={14} className="text-violet-300" />}>
            <div className="scroll-thin max-h-[420px] overflow-y-auto pr-1">
              {STACK.map(([layer, tech]) => (
                <div key={layer} className="border-b border-slate-800/60 py-1.5 last:border-0">
                  <p className="mono text-[10px] tracking-wider text-slate-500 uppercase">{layer}</p>
                  <p className="text-[11.5px] text-slate-300">{tech}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Deployment topology" subtitle="docker-compose locally, Helm on EKS in production" accent="#34d399">
            <div className="mono space-y-1 text-[10.5px] leading-relaxed text-slate-400">
              <p>kafka (3 brokers, KRaft) · schema-registry · kafka-connect-debezium</p>
              <p>minio (S3 API) · spark-history · livy · airflow (webserver + scheduler + 4 workers)</p>
              <p>trino coordinator + 3 workers · hive/iceberg REST catalog · postgres metastore</p>
              <p>mlflow + artifact store · fastapi (2 replicas) · next.js control centre (3 replicas)</p>
              <p>great-expectations runner · openmetadata + elasticsearch</p>
              <p className="text-slate-600">terraform: vpc, s3, msk, emr-on-eks, rds, glue catalog, kms, iam</p>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Repository layout" subtitle="06-insurance-big-data-lakehouse" accent="#eab308" right={<Boxes size={14} className="text-amber-300" />}>
        <pre className="mono scroll-thin overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[10.5px] leading-relaxed text-slate-300">{REPO}</pre>
      </Panel>
    </div>
  );
}
