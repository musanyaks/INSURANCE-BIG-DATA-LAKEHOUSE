"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Boxes, Cpu, Radio } from "lucide-react";
import { NAV } from "./ui";

type BootState = { running: boolean; done: boolean; pct: number; message: string; stage: string };

function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString("en-KE", {
          timeZone: "Africa/Nairobi",
          hour12: false,
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " EAT",
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="mono text-[11px] text-slate-400">{now}</span>;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [boot, setBoot] = useState<BootState | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/bootstrap", { cache: "no-store" });
        const j = (await r.json()) as BootState;
        if (alive) setBoot(j);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="grid-bg min-h-screen bg-[#05070e]">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-slate-800/70 bg-[#070b16]/80 backdrop-blur lg:flex">
          <div className="border-b border-slate-800/70 px-4 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20">
                <Boxes size={19} />
              </span>
              <span>
                <span className="block text-[15px] leading-tight font-bold tracking-tight text-slate-50">
                  INSURE<span className="text-cyan-400">LAKE</span>
                </span>
                <span className="mono block text-[9.5px] tracking-[0.13em] text-slate-500 uppercase">Insurance Lakehouse</span>
              </span>
            </Link>
          </div>
          <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 py-3">
            {groups.map((g) => (
              <div key={g} className="mb-4">
                <p className="mono px-2 pb-1.5 text-[9.5px] tracking-[0.2em] text-slate-600 uppercase">{g}</p>
                {NAV.filter((n) => n.group === g).map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors ${
                        active ? "bg-cyan-500/10 text-cyan-200 ring-1 ring-cyan-500/25 ring-inset" : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                      }`}
                    >
                      <Icon size={15} className={active ? "text-cyan-300" : ""} />
                      <span className="truncate">{item.label}</span>
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400 blip" />}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="border-t border-slate-800/70 px-4 py-3">
            <div className="mono flex items-center gap-2 text-[10px] text-slate-500">
              <Cpu size={12} className="text-emerald-400" />
              <span>trino · spark · kafka</span>
            </div>
            <div className="mono mt-1 text-[10px] text-slate-600">Iceberg v2 · Parquet · S3/MinIO</div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-800/70 bg-[#070b16]/85 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 blip" />
                <span className="mono text-[10px] tracking-wider text-emerald-300 uppercase">all systems nominal</span>
              </span>
              <span className="mono hidden text-[10.5px] text-slate-500 md:inline">s3a://insurelake · region af-south-1 · cluster insurelake-prod-01</span>
            </div>
            <div className="flex items-center gap-3">
              {boot && !boot.done && boot.running && (
                <span className="mono flex items-center gap-1.5 text-[10.5px] text-amber-300">
                  <Radio size={12} className="blip" /> bootstrapping {boot.pct}%
                </span>
              )}
              <Clock />
              <span className="mono hidden rounded border border-slate-700 bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-300 md:inline">actuary.naibi@insurelake.co.ke</span>
            </div>
          </header>
          <main className="min-w-0 flex-1 px-4 py-5 md:px-6">{children}</main>
          <footer className="border-t border-slate-800/70 px-4 py-3 text-[10.5px] text-slate-600 md:px-6">
            <span className="mono">
              INSURELAKE v1.4.0 · Enterprise Insurance Big Data Lakehouse & Actuarial Intelligence Platform · Raw → Clean → Trusted → Actuarial → ML → Decisions → BI
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
