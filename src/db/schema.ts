import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * PLATFORM / GOVERNANCE
 * ------------------------------------------------------------------ */

export const platformState = pgTable("platform_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pipelineRun = pgTable(
  "pipeline_run",
  {
    runId: text("run_id").primaryKey(),
    dagId: text("dag_id").notNull(),
    taskName: text("task_name").notNull(),
    layer: text("layer").notNull(),
    engine: text("engine").notNull(),
    status: text("status").notNull(),
    mode: text("mode").notNull(),
    startedAt: timestamp("started_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    recordsIn: integer("records_in").notNull(),
    recordsOut: integer("records_out").notNull(),
    recordsRejected: integer("records_rejected").notNull(),
    watermark: text("watermark"),
    logicalDate: text("logical_date"),
  },
  (t) => [index("pipeline_run_dag_idx").on(t.dagId)],
);

export const dqCheck = pgTable(
  "dq_check",
  {
    id: text("id").primaryKey(),
    dataset: text("dataset").notNull(),
    layer: text("layer").notNull(),
    dimension: text("dimension").notNull(),
    expectation: text("expectation").notNull(),
    rule: text("rule").notNull(),
    recordsTested: integer("records_tested").notNull(),
    recordsFailed: integer("records_failed").notNull(),
    score: doublePrecision("score").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    runAt: timestamp("run_at").notNull(),
  },
  (t) => [index("dq_check_dataset_idx").on(t.dataset)],
);

export const lineageEdge = pgTable("lineage_edge", {
  id: text("id").primaryKey(),
  sourceNode: text("source_node").notNull(),
  targetNode: text("target_node").notNull(),
  sourceLayer: text("source_layer").notNull(),
  targetLayer: text("target_layer").notNull(),
  engine: text("engine").notNull(),
  transformation: text("transformation").notNull(),
  slaMinutes: integer("sla_minutes").notNull(),
  description: text("description"),
});

export const catalogEntry = pgTable(
  "catalog_entry",
  {
    id: text("id").primaryKey(),
    dataset: text("dataset").notNull(),
    layer: text("layer").notNull(),
    domain: text("domain").notNull(),
    tableFormat: text("table_format").notNull(),
    fileFormat: text("file_format").notNull(),
    location: text("location").notNull(),
    rows: integer("rows").notNull(),
    sizeMb: doublePrecision("size_mb").notNull(),
    owner: text("owner").notNull(),
    classification: text("classification").notNull(),
    pii: boolean("pii").notNull(),
    description: text("description").notNull(),
    columns: jsonb("columns").notNull(),
    partitions: jsonb("partitions").notNull(),
    snapshots: integer("snapshots").notNull(),
  },
  (t) => [index("catalog_layer_idx").on(t.layer)],
);

export const schemaVersion = pgTable("schema_version", {
  id: text("id").primaryKey(),
  dataset: text("dataset").notNull(),
  version: integer("version").notNull(),
  releasedAt: timestamp("released_at").notNull(),
  compatible: boolean("compatible").notNull(),
  addedFields: jsonb("added_fields").notNull(),
  events: integer("events").notNull(),
  note: text("note").notNull(),
});

export const scdHistory = pgTable(
  "scd_history",
  {
    id: text("id").primaryKey(),
    tableName: text("table_name").notNull(),
    strategy: text("strategy").notNull(),
    entityKey: text("entity_key").notNull(),
    entityLabel: text("entity_label"),
    attribute: text("attribute").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at").notNull(),
    changedBy: text("changed_by").notNull(),
    validFrom: timestamp("valid_from"),
    validTo: timestamp("valid_to"),
  },
  (t) => [index("scd_history_table_idx").on(t.tableName)],
);

export const modelRegistry = pgTable("model_registry", {
  modelId: text("model_id").primaryKey(),
  name: text("name").notNull(),
  family: text("family").notNull(),
  version: text("version").notNull(),
  stage: text("stage").notNull(),
  task: text("task").notNull(),
  metricName: text("metric_name").notNull(),
  metricValue: doublePrecision("metric_value").notNull(),
  secondaryMetrics: jsonb("secondary_metrics").notNull(),
  params: jsonb("params").notNull(),
  features: jsonb("features").notNull(),
  trainingRows: integer("training_rows").notNull(),
  runTimeMs: integer("run_time_ms").notNull(),
  trainedAt: timestamp("trained_at").notNull(),
  owner: text("owner").notNull(),
  driftPct: doublePrecision("drift_pct").notNull(),
});

export const streamMetric = pgTable(
  "stream_metric",
  {
    id: text("id").primaryKey(),
    topic: text("topic").notNull(),
    ts: timestamp("ts").notNull(),
    eventsPerSec: doublePrecision("events_per_sec").notNull(),
    lag: integer("lag").notNull(),
    p95LatencyMs: doublePrecision("p95_latency_ms").notNull(),
    partitions: integer("partitions").notNull(),
    offset: bigint("offset", { mode: "number" }).notNull(),
  },
  (t) => [index("stream_metric_topic_idx").on(t.topic)],
);

/* ------------------------------------------------------------------ *
 * BRONZE — raw, immutable, exactly as received
 * ------------------------------------------------------------------ */

export const bronzeEvent = pgTable(
  "bronze_event",
  {
    eventId: text("event_id").primaryKey(),
    topic: text("topic").notNull(),
    sourceSystem: text("source_system").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    payload: jsonb("payload").notNull(),
    eventTime: timestamp("event_time").notNull(),
    ingestTime: timestamp("ingest_time").notNull(),
    lakePath: text("lake_path").notNull(),
    partition: text("partition").notNull(),
    batchId: text("batch_id").notNull(),
    offset: bigint("kafka_offset", { mode: "number" }).notNull(),
    ingestMode: text("ingest_mode").notNull(),
    payloadBytes: integer("payload_bytes").notNull(),
  },
  (t) => [index("bronze_topic_idx").on(t.topic), index("bronze_time_idx").on(t.eventTime)],
);

/* ------------------------------------------------------------------ *
 * SILVER — cleansed, conformed, entity-resolved
 * ------------------------------------------------------------------ */

export const silverCustomer = pgTable(
  "silver_customer",
  {
    customerKey: text("customer_key").primaryKey(),
    customerId: text("customer_id").notNull(),
    fullName: text("full_name").notNull(),
    nationalId: text("national_id"),
    phone: text("phone").notNull(),
    gender: text("gender").notNull(),
    birthDate: text("birth_date").notNull(),
    ageBand: text("age_band").notNull(),
    countyCode: text("county_code").notNull(),
    countyName: text("county_name").notNull(),
    subCounty: text("sub_county").notNull(),
    ward: text("ward"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    urbanRural: text("urban_rural").notNull(),
    riskZone: text("risk_zone").notNull(),
    occupation: text("occupation").notNull(),
    incomeBand: text("income_band").notNull(),
    kycStatus: text("kyc_status").notNull(),
    channel: text("channel").notNull(),
    resolvedDuplicateOf: text("resolved_duplicate_of"),
    rowHash: text("row_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastUpdatedAt: timestamp("last_updated_at").notNull(),
  },
  (t) => [index("silver_customer_county_idx").on(t.countyCode)],
);

export const silverPolicy = pgTable(
  "silver_policy",
  {
    policyKey: text("policy_key").primaryKey(),
    policyId: text("policy_id").notNull(),
    customerId: text("customer_id").notNull(),
    product: text("product").notNull(),
    lob: text("lob").notNull(),
    coverType: text("cover_type").notNull(),
    agentId: text("agent_id").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status").notNull(),
    annualPremium: doublePrecision("annual_premium").notNull(),
    sumInsured: doublePrecision("sum_insured").notNull(),
    excess: doublePrecision("excess").notNull(),
    paymentFrequency: text("payment_frequency").notNull(),
    countyCode: text("county_code").notNull(),
    countyName: text("county_name").notNull(),
    renewalCount: integer("renewal_count").notNull(),
    commissionRate: doublePrecision("commission_rate").notNull(),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to"),
    isCurrent: boolean("is_current").notNull(),
    rowHash: text("row_hash").notNull(),
  },
  (t) => [index("silver_policy_status_idx").on(t.status), index("silver_policy_lob_idx").on(t.lob)],
);

export const silverClaim = pgTable(
  "silver_claim",
  {
    claimKey: text("claim_key").primaryKey(),
    claimId: text("claim_id").notNull(),
    policyId: text("policy_id").notNull(),
    customerId: text("customer_id").notNull(),
    providerId: text("provider_id"),
    agentId: text("agent_id"),
    vehicleReg: text("vehicle_reg"),
    claimDate: text("claim_date").notNull(),
    reportDate: text("report_date").notNull(),
    settleDate: text("settle_date"),
    claimType: text("claim_type").notNull(),
    cause: text("cause").notNull(),
    amountClaimed: doublePrecision("amount_claimed").notNull(),
    amountPaid: doublePrecision("amount_paid").notNull(),
    reserveAmount: doublePrecision("reserve_amount").notNull(),
    status: text("status").notNull(),
    countyCode: text("county_code").notNull(),
    countyName: text("county_name").notNull(),
    reportingLagDays: integer("reporting_lag_days").notNull(),
    dedupeScore: doublePrecision("dedupe_score").notNull(),
    isDuplicate: boolean("is_duplicate").notNull(),
    isFraud: boolean("is_fraud").notNull(),
    currency: text("currency").notNull(),
    qualityFlags: jsonb("quality_flags").notNull(),
    rowHash: text("row_hash").notNull(),
    ingestedAt: timestamp("ingested_at").notNull(),
  },
  (t) => [
    index("silver_claim_date_idx").on(t.claimDate),
    index("silver_claim_county_idx").on(t.countyCode),
    index("silver_claim_type_idx").on(t.claimType),
  ],
);

export const silverPayment = pgTable(
  "silver_payment",
  {
    paymentId: text("payment_id").primaryKey(),
    policyId: text("policy_id").notNull(),
    customerId: text("customer_id").notNull(),
    channel: text("channel").notNull(),
    mpesaReceipt: text("mpesa_receipt"),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull(),
    paidAt: timestamp("paid_at").notNull(),
    status: text("status").notNull(),
    paymentType: text("payment_type").notNull(),
    countyCode: text("county_code").notNull(),
    velocity30d: integer("velocity_30d").notNull(),
    rowHash: text("row_hash").notNull(),
  },
  (t) => [index("silver_payment_channel_idx").on(t.channel)],
);

export const silverVehicle = pgTable(
  "silver_vehicle",
  {
    vehicleKey: text("vehicle_key").primaryKey(),
    registration: text("registration").notNull(),
    customerId: text("customer_id").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    yearOfManufacture: integer("year_of_manufacture").notNull(),
    bodyType: text("body_type").notNull(),
    engineCc: integer("engine_cc").notNull(),
    marketValue: doublePrecision("market_value").notNull(),
    usage: text("usage").notNull(),
    telematicsDeviceId: text("telematics_device_id"),
    countyCode: text("county_code").notNull(),
    countyName: text("county_name").notNull(),
    ntsaStatus: text("ntsa_status").notNull(),
    rowHash: text("row_hash").notNull(),
  },
  (t) => [index("silver_vehicle_reg_idx").on(t.registration)],
);

export const silverProvider = pgTable(
  "silver_provider",
  {
    providerKey: text("provider_key").primaryKey(),
    providerId: text("provider_id").notNull(),
    name: text("name").notNull(),
    providerType: text("provider_type").notNull(),
    countyCode: text("county_code").notNull(),
    countyName: text("county_name").notNull(),
    accreditation: text("accreditation").notNull(),
    licenceStatus: text("licence_status").notNull(),
    claimVolume: integer("claim_volume").notNull(),
    avgClaimAmount: doublePrecision("avg_claim_amount").notNull(),
    rejectionRate: doublePrecision("rejection_rate").notNull(),
    networkDegree: integer("network_degree").notNull(),
    providerRiskScore: doublePrecision("provider_risk_score").notNull(),
    rowHash: text("row_hash").notNull(),
  },
  (t) => [index("silver_provider_county_idx").on(t.countyCode)],
);

export const silverAgent = pgTable(
  "silver_agent",
  {
    agentKey: text("agent_key").primaryKey(),
    agentId: text("agent_id").notNull(),
    name: text("name").notNull(),
    branch: text("branch").notNull(),
    channel: text("channel").notNull(),
    countyCode: text("county_code").notNull(),
    policiesSold: integer("policies_sold").notNull(),
    persistencyRate: doublePrecision("persistency_rate").notNull(),
    commissionRate: doublePrecision("commission_rate").notNull(),
    status: text("status").notNull(),
    rowHash: text("row_hash").notNull(),
  },
  (t) => [index("silver_agent_county_idx").on(t.countyCode)],
);

export const silverTelematics = pgTable(
  "silver_telematics",
  {
    eventId: text("event_id").primaryKey(),
    vehicleReg: text("vehicle_reg").notNull(),
    customerId: text("customer_id").notNull(),
    deviceId: text("device_id").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    speedKmh: doublePrecision("speed_kmh").notNull(),
    harshBraking: integer("harsh_braking").notNull(),
    harshAcceleration: integer("harsh_acceleration").notNull(),
    nightDrivingKm: doublePrecision("night_driving_km").notNull(),
    distanceKm: doublePrecision("distance_km").notNull(),
    countyCode: text("county_code").notNull(),
    batteryPct: doublePrecision("battery_pct").notNull(),
    rowHash: text("row_hash").notNull(),
  },
  (t) => [index("silver_telematics_time_idx").on(t.occurredAt)],
);

/* ------------------------------------------------------------------ *
 * GOLD — dimensions & facts (conformed marts)
 * ------------------------------------------------------------------ */

export const dimDate = pgTable("dim_date", {
  dateKey: integer("date_key").primaryKey(),
  date: text("date").notNull(),
  year: integer("year").notNull(),
  quarter: integer("quarter").notNull(),
  month: integer("month").notNull(),
  monthName: text("month_name").notNull(),
  yearMonth: text("year_month").notNull(),
  yearQuarter: text("year_quarter").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  isWeekend: boolean("is_weekend").notNull(),
  rainSeason: text("rain_season").notNull(),
  isHoliday: boolean("is_holiday").notNull(),
});

export const dimLocation = pgTable(
  "dim_location",
  {
    locationKey: integer("location_key").primaryKey(),
    countyCode: text("county_code").notNull(),
    countyName: text("county_name").notNull(),
    region: text("region").notNull(),
    subCounty: text("sub_county").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    urbanRural: text("urban_rural").notNull(),
    riskZone: text("risk_zone").notNull(),
    population: integer("population").notNull(),
    roadRiskIndex: doublePrecision("road_risk_index").notNull(),
    floodRiskIndex: doublePrecision("flood_risk_index").notNull(),
    crimeRiskIndex: doublePrecision("crime_risk_index").notNull(),
    rainfallMm: doublePrecision("rainfall_mm").notNull(),
    gdpIndex: doublePrecision("gdp_index").notNull(),
    mobilePenetration: doublePrecision("mobile_penetration").notNull(),
  },
  (t) => [index("dim_location_county_idx").on(t.countyCode)],
);

export const factClaims = pgTable(
  "fact_claims",
  {
    claimKey: text("claim_key").primaryKey(),
    claimId: text("claim_id").notNull(),
    dateKey: integer("date_key").notNull(),
    reportDateKey: integer("report_date_key").notNull(),
    policyKey: text("policy_key").notNull(),
    customerKey: text("customer_key").notNull(),
    vehicleKey: text("vehicle_key"),
    agentKey: text("agent_key").notNull(),
    providerKey: text("provider_key"),
    locationKey: integer("location_key").notNull(),
    claimType: text("claim_type").notNull(),
    lob: text("lob").notNull(),
    cause: text("cause").notNull(),
    status: text("status").notNull(),
    amountClaimed: doublePrecision("amount_claimed").notNull(),
    amountPaid: doublePrecision("amount_paid").notNull(),
    reserveAmount: doublePrecision("reserve_amount").notNull(),
    ultimateAmount: doublePrecision("ultimate_amount").notNull(),
    fraudScore: doublePrecision("fraud_score").notNull(),
    riskLevel: text("risk_level").notNull(),
    isFraud: boolean("is_fraud").notNull(),
    isDuplicate: boolean("is_duplicate").notNull(),
    reportingLagDays: integer("reporting_lag_days").notNull(),
    yearMonth: text("year_month").notNull(),
    originQuarter: text("origin_quarter").notNull(),
  },
  (t) => [
    index("fact_claims_month_idx").on(t.yearMonth),
    index("fact_claims_location_idx").on(t.locationKey),
    index("fact_claims_lob_idx").on(t.lob),
  ],
);

export const factPremiums = pgTable(
  "fact_premiums",
  {
    id: text("id").primaryKey(),
    dateKey: integer("date_key").notNull(),
    policyKey: text("policy_key").notNull(),
    customerKey: text("customer_key").notNull(),
    agentKey: text("agent_key").notNull(),
    locationKey: integer("location_key").notNull(),
    lob: text("lob").notNull(),
    yearMonth: text("year_month").notNull(),
    writtenPremium: doublePrecision("written_premium").notNull(),
    earnedPremium: doublePrecision("earned_premium").notNull(),
    commission: doublePrecision("commission").notNull(),
    policiesInForce: integer("policies_in_force").notNull(),
    newBusiness: integer("new_business").notNull(),
    renewals: integer("renewals").notNull(),
    cancellations: integer("cancellations").notNull(),
  },
  (t) => [index("fact_premiums_month_idx").on(t.yearMonth)],
);

export const factPayments = pgTable(
  "fact_payments",
  {
    paymentKey: text("payment_key").primaryKey(),
    paymentId: text("payment_id").notNull(),
    dateKey: integer("date_key").notNull(),
    policyKey: text("policy_key").notNull(),
    customerKey: text("customer_key").notNull(),
    locationKey: integer("location_key").notNull(),
    channel: text("channel").notNull(),
    paymentType: text("payment_type").notNull(),
    amount: doublePrecision("amount").notNull(),
    status: text("status").notNull(),
    yearMonth: text("year_month").notNull(),
  },
  (t) => [index("fact_payments_month_idx").on(t.yearMonth)],
);

export const factFraudEvents = pgTable(
  "fact_fraud_events",
  {
    alertId: text("alert_id").primaryKey(),
    claimKey: text("claim_key").notNull(),
    claimId: text("claim_id").notNull(),
    customerKey: text("customer_key").notNull(),
    providerKey: text("provider_key"),
    locationKey: integer("location_key").notNull(),
    detectedAt: timestamp("detected_at").notNull(),
    fraudScore: doublePrecision("fraud_score").notNull(),
    riskLevel: text("risk_level").notNull(),
    modelId: text("model_id").notNull(),
    reasons: jsonb("reasons").notNull(),
    features: jsonb("features").notNull(),
    amountAtRisk: doublePrecision("amount_at_risk").notNull(),
    status: text("status").notNull(),
    assignedTo: text("assigned_to"),
    detectionMode: text("detection_mode").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    networkLinks: jsonb("network_links").notNull(),
  },
  (t) => [index("fact_fraud_risk_idx").on(t.riskLevel)],
);

export const factVehicleEvents = pgTable(
  "fact_vehicle_events",
  {
    id: text("id").primaryKey(),
    dateKey: integer("date_key").notNull(),
    vehicleKey: text("vehicle_key").notNull(),
    customerKey: text("customer_key").notNull(),
    locationKey: integer("location_key").notNull(),
    yearMonth: text("year_month").notNull(),
    trips: integer("trips").notNull(),
    distanceKm: doublePrecision("distance_km").notNull(),
    avgSpeedKmh: doublePrecision("avg_speed_kmh").notNull(),
    harshEvents: integer("harsh_events").notNull(),
    nightKm: doublePrecision("night_km").notNull(),
    driverScore: doublePrecision("driver_score").notNull(),
  },
  (t) => [index("fact_vehicle_events_month_idx").on(t.yearMonth)],
);

/* ------------------------------------------------------------------ *
 * ACTUARIAL
 * ------------------------------------------------------------------ */

export const devTriangle = pgTable(
  "dev_triangle",
  {
    id: text("id").primaryKey(),
    lob: text("lob").notNull(),
    measure: text("measure").notNull(),
    originPeriod: text("origin_period").notNull(),
    devPeriod: integer("dev_period").notNull(),
    incremental: doublePrecision("incremental").notNull(),
    cumulative: doublePrecision("cumulative").notNull(),
    ldf: doublePrecision("ldf"),
  },
  (t) => [index("dev_triangle_lob_idx").on(t.lob)],
);

export const reserveResult = pgTable(
  "reserve_result",
  {
    id: text("id").primaryKey(),
    lob: text("lob").notNull(),
    method: text("method").notNull(),
    originPeriod: text("origin_period").notNull(),
    paidToDate: doublePrecision("paid_to_date").notNull(),
    ultimate: doublePrecision("ultimate").notNull(),
    ibnr: doublePrecision("ibnr").notNull(),
    mackStdError: doublePrecision("mack_std_error"),
    coefficientOfVariation: doublePrecision("coefficient_of_variation"),
    aprioriLossRatio: doublePrecision("apriori_loss_ratio"),
    reserveAdequacy: doublePrecision("reserve_adequacy"),
  },
  (t) => [index("reserve_method_idx").on(t.method)],
);

export const pricingSegment = pgTable(
  "pricing_segment",
  {
    id: text("id").primaryKey(),
    segment: text("segment").notNull(),
    dimensionA: text("dimension_a").notNull(),
    dimensionB: text("dimension_b").notNull(),
    lob: text("lob").notNull(),
    exposure: doublePrecision("exposure").notNull(),
    claimCount: integer("claim_count").notNull(),
    frequency: doublePrecision("frequency").notNull(),
    severity: doublePrecision("severity").notNull(),
    purePremium: doublePrecision("pure_premium").notNull(),
    relativity: doublePrecision("relativity").notNull(),
    averagePremium: doublePrecision("average_premium").notNull(),
    lossRatio: doublePrecision("loss_ratio").notNull(),
    indicatedRateChange: doublePrecision("indicated_rate_change").notNull(),
    telematicsAdj: doublePrecision("telematics_adj").notNull(),
  },
  (t) => [index("pricing_segment_lob_idx").on(t.lob)],
);
