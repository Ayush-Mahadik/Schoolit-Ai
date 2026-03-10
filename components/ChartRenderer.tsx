"use client";

import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────
export interface ChartDataset {
  label?: string;
  data: { x?: number | string; y?: number; name?: string; value?: number }[];
  color?: string;
}

export interface ChartSpec {
  type: "line" | "bar" | "pie" | "area" | "scatter";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  datasets: ChartDataset[];
}

// ── Dark Theme Constants ──────────────────────────────────────────────
const GRID         = "#1e1e1e";
const TICK         = "#666";
const LABEL        = "#888";
const TOOLTIP_BG   = "#1a1a1a";
const TOOLTIP_BORDER = "#2a2a2a";

// ── Color Palette ─────────────────────────────────────────────────────
const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

// ── Shared axis props ─────────────────────────────────────────────────
const axisStyle = { fill: TICK, fontSize: 11 } as const;

// ── Dark Tooltip component ────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: TOOLTIP_BG,
      border: `1px solid ${TOOLTIP_BORDER}`,
      borderRadius: "6px",
      padding: "8px 12px",
      fontSize: "12px",
      fontFamily: "monospace",
    }}>
      {label != null && (
        <p style={{ color: "#aaa", fontSize: "11px", marginBottom: "4px" }}>{label}</p>
      )}
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color, margin: "2px 0" }}>
          {e.name}: <b>{e.value}</b>
        </p>
      ))}
    </div>
  );
};

// ── Main Chart Renderer ───────────────────────────────────────────────
export function ChartRenderer({ data }: { data: ChartSpec }) {
  const { type, title, xLabel, yLabel, datasets } = data;

  // Transform data for Recharts
  const chartData = useMemo(() => {
    if (type === "pie") {
      return (datasets[0]?.data || []).map((d) => ({
        name: d.name || String(d.x || ""),
        value: d.value ?? d.y ?? 0,
      }));
    }

    const xValues = new Set<number | string>();
    for (const ds of datasets) {
      for (const pt of ds.data) {
        xValues.add(pt.x ?? pt.name ?? 0);
      }
    }

    const sorted = Array.from(xValues).sort((a, b) => {
      if (typeof a === "number" && typeof b === "number") return a - b;
      return String(a).localeCompare(String(b));
    });

    return sorted.map((xVal) => {
      const point: Record<string, unknown> = { x: xVal };
      for (let i = 0; i < datasets.length; i++) {
        const ds = datasets[i];
        const match = ds.data.find((d) => (d.x ?? d.name) === xVal);
        point[ds.label || `series${i}`] = match?.y ?? match?.value ?? null;
      }
      return point;
    });
  }, [type, datasets]);

  const seriesKeys = useMemo(() => {
    if (type === "pie") return [];
    return datasets.map((ds, i) => ds.label || `series${i}`);
  }, [type, datasets]);

  return (
    <div className="chart-container my-4 p-4 bg-surface-2 rounded-xl border border-surface-4">
      {title && (
        <h4 className="text-sm font-semibold text-white text-center mb-3">{title}</h4>
      )}
      <ResponsiveContainer width="100%" height={320}>
        {type === "line" ? (
          <LineChart data={chartData}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5, fill: LABEL, fontSize: 11 } : undefined}
            />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: LABEL, fontSize: 11 } : undefined}
            />
            <Tooltip content={<DarkTooltip />} />
            {seriesKeys.length > 1 && <Legend wrapperStyle={{ color: LABEL, fontSize: 11 }} />}
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={datasets[i]?.color || COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        ) : type === "bar" ? (
          <BarChart data={chartData}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5, fill: LABEL, fontSize: 11 } : undefined}
            />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: LABEL, fontSize: 11 } : undefined}
            />
            <Tooltip content={<DarkTooltip />} />
            {seriesKeys.length > 1 && <Legend wrapperStyle={{ color: LABEL, fontSize: 11 }} />}
            {seriesKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={datasets[i]?.color || COLORS[i % COLORS.length]}
                barSize={32}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        ) : type === "pie" ? (
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: TICK }}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ color: LABEL, fontSize: 11 }} />
          </PieChart>
        ) : type === "area" ? (
          <AreaChart data={chartData}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5, fill: LABEL, fontSize: 11 } : undefined}
            />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: LABEL, fontSize: 11 } : undefined}
            />
            <Tooltip content={<DarkTooltip />} />
            {seriesKeys.length > 1 && <Legend wrapperStyle={{ color: LABEL, fontSize: 11 }} />}
            {seriesKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={datasets[i]?.color || COLORS[i % COLORS.length]}
                fill={datasets[i]?.color || COLORS[i % COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </AreaChart>
        ) : type === "scatter" ? (
          <ScatterChart>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              type="number"
              label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5, fill: LABEL, fontSize: 11 } : undefined}
            />
            <YAxis
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: LABEL, fontSize: 11 } : undefined}
            />
            <Tooltip content={<DarkTooltip />} />
            {seriesKeys.length > 1 && <Legend wrapperStyle={{ color: LABEL, fontSize: 11 }} />}
            {seriesKeys.map((key, i) => {
              const scatterData = datasets[i]?.data.map(d => ({ x: d.x, y: d.y })) || [];
              return (
                <Scatter
                  key={key}
                  name={key}
                  data={scatterData}
                  fill={datasets[i]?.color || COLORS[i % COLORS.length]}
                />
              );
            })}
          </ScatterChart>
        ) : (
          <BarChart data={[]}>
            <text x="50%" y="50%" textAnchor="middle" fill={LABEL} fontSize={13}>
              Unsupported chart type: {type}
            </text>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ── Parse chart blocks from markdown content ──────────────────────────
export function parseChartBlocks(content: string): { text: string; charts: ChartSpec[] } {
  const charts: ChartSpec[] = [];
  const text = content.replace(/```chart\n([\s\S]*?)```/g, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (parsed.type && parsed.datasets) {
        charts.push(parsed);
        return `<!--chart:${charts.length - 1}-->`;
      }
    } catch {
      // Keep the raw text if parsing fails
    }
    return _;
  });
  return { text, charts };
}
