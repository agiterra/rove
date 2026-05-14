"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FindingEmptyState } from "./FindingEmptyState";
import type { TrendBucket } from "./types";

interface FindingTrendChartProps {
  projectId: string;
  heuristicPrefix: string;
  windowDays?: number;
  bucket?: "day" | "week";
  /**
   * Optional pre-aggregated data. When omitted (the substrate's mock path),
   * the chart synthesizes deterministic mock buckets keyed off projectId +
   * heuristicPrefix so previews look stable across renders.
   */
  data?: TrendBucket[];
}

export function FindingTrendChart({
  projectId,
  heuristicPrefix,
  windowDays = 30,
  bucket = "day",
  data,
}: FindingTrendChartProps) {
  const windowSafe = Math.max(1, Math.floor(windowDays));
  const buckets = useMemo(
    () => data ?? mockBuckets(projectId, heuristicPrefix, windowSafe, bucket),
    [data, projectId, heuristicPrefix, windowSafe, bucket],
  );
  const total = buckets.reduce((acc, b) => acc + b.critical + b.major + b.minor, 0);

  if (buckets.length === 0 || total === 0) {
    return <FindingEmptyState surface="trend" projectId={projectId} />;
  }

  return (
    <figure
      data-rove-trend
      className="m-0"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <figcaption
        className="font-mono uppercase mb-2"
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          color: "var(--color-text-faint)",
        }}
      >
        {heuristicPrefix} · last {windowSafe} {windowSafe === 1 ? "day" : "days"} · by {bucket}
      </figcaption>
      <div className="w-full" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={buckets} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <XAxis
              dataKey="at"
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              minTickGap={16}
            />
            <YAxis allowDecimals={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: "var(--color-panel-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--color-text)",
              }}
              labelStyle={{ color: "var(--color-text-muted)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-text-muted)" }} />
            <Line
              name="critical"
              type="monotone"
              dataKey="critical"
              stroke="var(--color-severity-critical)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              name="major"
              type="monotone"
              dataKey="major"
              stroke="var(--color-severity-major)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              name="minor"
              type="monotone"
              dataKey="minor"
              stroke="var(--color-severity-minor)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function mockBuckets(
  projectId: string,
  heuristicPrefix: string,
  windowDays: number,
  bucket: "day" | "week",
): TrendBucket[] {
  const seedKey = `${projectId}|${heuristicPrefix}`;
  const seed = seedKey
    .split("")
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seed);

  const stepDays = bucket === "week" ? 7 : 1;
  const stepCount = Math.max(1, Math.ceil(windowDays / stepDays));
  const out: TrendBucket[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = stepCount - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i * stepDays);
    out.push({
      at: d.toISOString().slice(0, 10),
      critical: Math.floor(rng() * 3),
      major: Math.floor(rng() * 5),
      minor: Math.floor(rng() * 7),
    });
  }
  return out;
}

function mulberry32(seed: number) {
  let a = seed;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
