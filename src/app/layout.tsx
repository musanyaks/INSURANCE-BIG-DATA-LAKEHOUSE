import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/shell";
import { BootstrapScreen } from "@/components/bootstrap-screen";
import { isSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070e",
};

export const metadata: Metadata = {
  title: "INSURELAKE — Enterprise Insurance Big Data Lakehouse & Actuarial Intelligence Platform",
  description:
    "A real-time, governed insurance lakehouse powering actuarial analytics, fraud intelligence, risk modelling and executive decision-making. Bronze → Silver → Gold on Apache Iceberg, Kafka streaming, Spark, dbt, MLflow, Great Expectations and Trino.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const seeded = await isSeeded();
  return (
    <html lang="en">
      <body className="bg-[#05070e] text-slate-200 antialiased">{seeded ? <Shell>{children}</Shell> : <BootstrapScreen />}</body>
    </html>
  );
}
