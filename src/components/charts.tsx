"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export type ChartFmtName = "M" | "pct" | "int" | "compact" | "kes";
export type ChartFmt = ChartFmtName | ((v: number) => string);

const FORMATTERS: Record<ChartFmtName, (v: number) => string> = {
  M: (v) => `${v}M`,
  pct: (v) => `${v}%`,
  int: (v) => v.toLocaleString("en-KE"),
  compact: (v) => new Intl.NumberFormat("en", { notation: "compact" }).format(v),
  kes: (v) => `KSh ${new Intl.NumberFormat("en", { notation: "compact" }).format(v)}`,
};

function resolveFmt(f?: ChartFmt): ((v: number) => string) | undefined {
  if (!f) return undefined;
  return typeof f === "function" ? f : FORMATTERS[f];
}

const axis = { stroke: "#475569", fontSize: 10, tickLine: false, axisLine: false } as const;
const grid = { stroke: "#1e293b", strokeDasharray: "3 3", vertical: false } as const;

function Tip({ active, payload, label, suffix }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel rounded-lg border-slate-700 px-3 py-2 shadow-xl">
      {label !== undefined && <p className="mono mb-1 text-[10.5px] tracking-wide text-slate-400 uppercase">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="mono flex items-center gap-2 text-[11.5px] text-slate-200">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}</span>
          <span className="ml-auto font-semibold">
            {typeof p.value === "number" ? p.value.toLocaleString("en-KE", { maximumFractionDigits: 2 }) : p.value}
            {suffix ?? ""}
          </span>
        </p>
      ))}
    </div>
  );
}

export function PremiumClaimsTrend({ data }: { data: Array<{ month: string; earnedPremium: number; incurredClaims: number; lossRatio: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={268}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="prem" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="clm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" {...axis} interval="preserveStartEnd" minTickGap={22} />
        <YAxis {...axis} tickFormatter={(v: number) => `${(v / 1e6).toFixed(0)}M`} />
        <YAxis yAxisId="right" orientation="right" {...axis} tickFormatter={(v: number) => `${v}%`} domain={[0, 140]} />
        <Tooltip content={<Tip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} iconType="plainline" />
        <Area type="monotone" dataKey="earnedPremium" name="Earned premium" stroke="#22d3ee" strokeWidth={1.8} fill="url(#prem)" />
        <Area type="monotone" dataKey="incurredClaims" name="Incurred claims" stroke="#f43f5e" strokeWidth={1.8} fill="url(#clm)" />
        <Line yAxisId="right" type="monotone" dataKey="lossRatio" name="Loss ratio %" stroke="#eab308" strokeWidth={1.6} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MultiLine({ data, xKey, lines, height = 220, yFmt }: { data: Array<Record<string, string | number>>; xKey: string; lines: Array<{ key: string; name: string; color: string }>; height?: number; yFmt?: ChartFmt }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey={xKey} {...axis} minTickGap={24} />
        <YAxis {...axis} tickFormatter={resolveFmt(yFmt)} />
        <Tooltip content={<Tip />} />
        <Legend wrapperStyle={{ fontSize: 10.5 }} iconType="plainline" />
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StackedBars({ data, xKey, bars, height = 240, fmt }: { data: Array<Record<string, string | number>>; xKey: string; bars: Array<{ key: string; name: string; color: string }>; height?: number; fmt?: ChartFmt }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey={xKey} {...axis} minTickGap={16} />
        <YAxis {...axis} tickFormatter={resolveFmt(fmt)} />
        <Tooltip content={<Tip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
        <Legend wrapperStyle={{ fontSize: 10.5 }} />
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} stackId="a" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HBars({ data, xKey, yKey, color = "#22d3ee", height = 240, fmt }: { data: Array<Record<string, string | number>>; xKey: string; yKey: string; color?: string; height?: number; fmt?: ChartFmt }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid {...grid} horizontal={false} />
        <XAxis type="number" {...axis} tickFormatter={resolveFmt(fmt)} />
        <YAxis type="category" dataKey={xKey} {...axis} width={118} />
        <Tooltip content={<Tip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
        <Bar dataKey={yKey} fill={color} radius={[0, 3, 3, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, colors }: { data: Array<{ name: string; value: number }>; colors?: string[] }) {
  const palette = colors ?? ["#22d3ee", "#eab308", "#f43f5e", "#34d399", "#a78bfa", "#fb923c", "#60a5fa"];
  return <PieFallback data={data} palette={palette} />;
}

function PieFallback({ data, palette }: { data: Array<{ name: string; value: number }>; palette: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="h-[150px] w-[150px] -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#1e293b" strokeWidth="16" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const el = (
            <circle
              key={d.name}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth="16"
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-acc * C}
              className="transition-all duration-500"
            />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: palette[i % palette.length] }} />
            <span className="truncate text-slate-300">{d.name}</span>
            <span className="mono ml-auto text-slate-400">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Gauge({ value, label, tone = "#f43f5e" }: { value: number; label: string; tone?: string }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ name: label, value: Math.min(100, Math.max(0, value)), fill: tone }]} startAngle={210} endAngle={-30}>
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar background={{ fill: "#1e293b" }} dataKey="value" cornerRadius={6} isAnimationActive={false} />
        <Tooltip content={<Tip suffix="%" />} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ points, color = "#22d3ee", height = 40 }: { points: number[]; color?: string; height?: number }) {
  const data = points.map((p, i) => ({ i, v: p }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sp-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.4} fill={`url(#sp-${color.replace("#", "")})`} isAnimationActive={false} />
        <Tooltip content={<Tip />} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ScatterRisk({ data, xName = "Frequency", yName = "Severity" }: { data: Array<{ x: number; y: number; z: number; name: string }>; xName?: string; yName?: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 10, right: 14, bottom: 6, left: -8 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="x" type="number" name={xName} {...axis} tickFormatter={(v: number) => v.toFixed(2)} />
        <YAxis dataKey="y" type="number" name={yName} {...axis} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
        <ZAxis dataKey="z" type="number" range={[40, 420]} name="Exposure" />
        <Tooltip content={<Tip />} cursor={{ strokeDasharray: "3 3", stroke: "#475569" }} />
        <Scatter data={data} fill="#22d3ee" fillOpacity={0.65} stroke="#0e7490" isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
