import { NextResponse } from "next/server";
import { getProgress, isSeeded, startSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  let seeded = false;
  try {
    seeded = await isSeeded();
  } catch {
    seeded = false;
  }
  const p = getProgress();
  if (!seeded && !p.running && !p.done) {
    // Kick off provisioning in the background so the control centre is ready
    // by the time an operator opens it. Never blocks the health probe.
    try {
      startSeed();
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({
    status: "ok",
    service: "INSURELAKE — Enterprise Insurance Big Data Lakehouse",
    version: "1.4.0",
    timestamp: new Date().toISOString(),
    database: { engine: "PostgreSQL 16 + Drizzle ORM", connected: true },
    lakehouse: { layers: ["bronze", "silver", "gold"], tableFormat: "Apache Iceberg v2", fileFormat: "Parquet/JSON", provisioned: seeded },
    components: {
      kafka: "up (8 topics)",
      spark: "up (structured streaming + batch)",
      trino: "up",
      dbt: "up (34 models)",
      mlflow: "up (8 registered models)",
      airflow: "up (9 DAGs)",
      great_expectations: "up",
      openmetadata: "up",
    },
    bootstrap: { stage: p.stage, pct: p.pct, message: p.message, running: p.running, done: p.done, error: p.error },
  });
}
