"use client";

import { useState } from "react";
import { Badge, DataTable, LayerTag, fmt } from "./ui";

export type BronzeSample = {
  eventId: string;
  topic: string;
  sourceSystem: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  eventTime: Date | string;
  lakePath: string;
  partition: string;
  ingestMode: string;
  payloadBytes: number;
};

export type DatasetGroup = { layer: "bronze" | "silver" | "gold"; label: string; note: string; rows: Array<Record<string, unknown>> };

export function DatasetBrowser({ groups, bronze }: { groups: Record<string, DatasetGroup>; bronze: BronzeSample[] }) {
  const keys = Object.keys(groups);
  const [active, setActive] = useState(keys[0]);
  const [selectedBronze, setSelectedBronze] = useState(0);
  const g = groups[active];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => setActive(k)}
            className={`mono rounded border px-2 py-1 text-[10.5px] transition-colors ${
              active === k ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200" : "border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LayerTag layer={g.layer} />
        <span className="mono text-[11px] text-slate-400">{g.label}</span>
        <span className="mono ml-auto text-[10px] text-slate-600">{g.note}</span>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40">
        <DataTable rows={g.rows.slice(0, 14)} maxHeight={380} />
      </div>

      {active.startsWith("bronze.") && bronze.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="bronze">raw payload — immutable</Badge>
            <span className="mono text-[10.5px] text-slate-500">{bronze[selectedBronze]?.lakePath}</span>
            <div className="ml-auto flex gap-1">
              {bronze.slice(0, 8).map((b, i) => (
                <button key={b.eventId} onClick={() => setSelectedBronze(i)} className={`mono rounded border px-1.5 py-0.5 text-[9.5px] ${i === selectedBronze ? "border-amber-500/50 bg-amber-500/15 text-amber-200" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="scroll-thin max-h-[240px] overflow-auto">
            <pre className="mono text-[11px] leading-relaxed text-slate-300">
              <span className="text-slate-600">// topic={bronze[selectedBronze]?.topic} · source={bronze[selectedBronze]?.sourceSystem} · schema v{bronze[selectedBronze]?.schemaVersion} · {bronze[selectedBronze]?.payloadBytes}B · ingested {fmt(bronze[selectedBronze]?.eventTime)}</span>
              {"\n"}
              {JSON.stringify(bronze[selectedBronze]?.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
