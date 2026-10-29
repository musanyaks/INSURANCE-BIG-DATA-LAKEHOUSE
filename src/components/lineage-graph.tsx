"use client";

import { useMemo, useState } from "react";

export type LineageEdge = {
  id: string;
  sourceNode: string;
  targetNode: string;
  sourceLayer: string;
  targetLayer: string;
  engine: string;
  transformation: string;
  slaMinutes: number;
  description: string | null;
};

const LAYER_ORDER = ["source", "stream", "lake", "bronze", "silver", "gold", "ml", "actuarial", "governance", "bi"];
const LAYER_COLOR: Record<string, string> = {
  source: "#64748b",
  stream: "#38bdf8",
  lake: "#c9803a",
  bronze: "#c9803f",
  silver: "#94a3b8",
  gold: "#eab308",
  ml: "#22d3ee",
  actuarial: "#a78bfa",
  governance: "#34d399",
  bi: "#f472b6",
};

export function LineageGraph({ edges, height = 620 }: { edges: LineageEdge[]; height?: number }) {
  const [active, setActive] = useState<string | null>(null);

  const { nodes, cols, width } = useMemo(() => {
    const layerOf = new Map<string, string>();
    for (const e of edges) {
      layerOf.set(e.sourceNode, e.sourceLayer);
      layerOf.set(e.targetNode, e.targetLayer);
    }
    const byLayer = new Map<string, string[]>();
    for (const [node, layer] of layerOf) {
      const arr = byLayer.get(layer) ?? [];
      arr.push(node);
      byLayer.set(layer, arr);
    }
    const cols = LAYER_ORDER.filter((l) => byLayer.has(l));
    const nodes = new Map<string, { x: number; y: number; layer: string }>();
    const colWidth = 186;
    cols.forEach((layer, ci) => {
      const list = (byLayer.get(layer) ?? []).sort();
      const gap = Math.max(34, height / (list.length + 1));
      list.forEach((n, i) => {
        nodes.set(n, { x: 20 + ci * colWidth, y: 22 + (i + 0.5) * gap, layer });
      });
    });
    return { nodes, cols, width: 20 + cols.length * colWidth + 40 };
  }, [edges, height]);

  const related = useMemo(() => {
    if (!active) return null;
    const set = new Set<string>();
    const walk = (node: string, dir: "up" | "down", depth: number) => {
      if (depth > 6) return;
      for (const e of edges) {
        if (dir === "down" && e.sourceNode === node && !set.has(e.targetNode)) {
          set.add(e.targetNode);
          walk(e.targetNode, "down", depth + 1);
        }
        if (dir === "up" && e.targetNode === node && !set.has(e.sourceNode)) {
          set.add(e.sourceNode);
          walk(e.sourceNode, "up", depth + 1);
        }
      }
    };
    walk(active, "down", 0);
    walk(active, "up", 0);
    set.add(active);
    return set;
  }, [active, edges]);

  const highlightedEdge = (e: LineageEdge) => !related || (related.has(e.sourceNode) && related.has(e.targetNode));
  const activeEdge = edges.find((e) => (e.sourceNode === active || e.targetNode === active));

  return (
    <div className="relative">
      <div className="scroll-thin overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="min-w-full">
          <defs>
            <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#475569" />
            </marker>
            <marker id="arrow-hot" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#22d3ee" />
            </marker>
          </defs>

          {cols.map((layer, ci) => (
            <g key={layer}>
              <rect x={8 + ci * 186} y={4} width={172} height={height - 8} rx={10} fill={LAYER_COLOR[layer]} opacity={0.045} />
              <text x={16 + ci * 186} y={20} className="mono" fontSize={9.5} fill={LAYER_COLOR[layer]} letterSpacing="1.6">
                {layer.toUpperCase()}
              </text>
            </g>
          ))}

          {edges.map((e) => {
            const s = nodes.get(e.sourceNode);
            const t = nodes.get(e.targetNode);
            if (!s || !t) return null;
            const on = highlightedEdge(e);
            const x1 = s.x + 150;
            const x2 = t.x;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={e.id}
                d={`M ${x1} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${x2} ${t.y}`}
                fill="none"
                stroke={on ? (active ? "#22d3ee" : "#334155") : "#1e293b"}
                strokeWidth={on && active ? 1.5 : 1}
                opacity={on ? 0.9 : 0.25}
                className={on && active ? "flow-line" : undefined}
                markerEnd={on && active ? "url(#arrow-hot)" : "url(#arrow)"}
              />
            );
          })}

          {[...nodes.entries()].map(([name, n]) => {
            const on = !related || related.has(name);
            const color = LAYER_COLOR[n.layer] ?? "#64748b";
            const isActive = active === name;
            return (
              <g key={name} transform={`translate(${n.x}, ${n.y - 13})`} opacity={on ? 1 : 0.28} className="cursor-pointer" onMouseEnter={() => setActive(name)} onMouseLeave={() => setActive(null)} onClick={() => setActive(name)}>
                <rect width={150} height={26} rx={7} fill="#0b1020" stroke={isActive ? color : "#1e293b"} strokeWidth={isActive ? 1.6 : 1} />
                <rect width={3} height={26} rx={1.5} fill={color} />
                <text x={10} y={16} fontSize={9.6} fill={isActive ? "#e2e8f0" : "#94a3b8"} className="mono">
                  {name.length > 25 ? `${name.slice(0, 24)}…` : name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mono mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
        {cols.map((l) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: LAYER_COLOR[l] }} />
            {l}
          </span>
        ))}
      </div>

      <div className="mt-2 min-h-[52px] rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
        {activeEdge ? (
          <>
            <p className="mono text-[11px] text-cyan-300">
              {activeEdge.sourceNode} → {activeEdge.targetNode}
            </p>
            <p className="mt-1 text-[11.5px] text-slate-300">
              <span className="text-slate-500">engine:</span> {activeEdge.engine} · <span className="text-slate-500">transform:</span> {activeEdge.transformation} · <span className="text-slate-500">SLA:</span> {activeEdge.slaMinutes}m
            </p>
            {activeEdge.description && <p className="mt-0.5 text-[11px] text-slate-500">{activeEdge.description}</p>}
          </>
        ) : (
          <p className="text-[11px] text-slate-500">Hover any node to trace its full upstream and downstream lineage — “where did this number come from?”</p>
        )}
      </div>
    </div>
  );
}
