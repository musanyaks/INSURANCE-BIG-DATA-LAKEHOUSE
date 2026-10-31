import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";
import { BootstrapScreen } from "@/components/bootstrap-screen";
import { isSeeded } from "@/lib/seed";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="bg-[#05070e] text-slate-200 antialiased">{seeded ? <Shell>{children}</Shell> : <BootstrapScreen />}</body>
    </html>
  );
}
