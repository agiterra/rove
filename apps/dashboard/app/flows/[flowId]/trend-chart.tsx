"use client";

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

export interface TrendPoint {
  at: string;
  total: number;
  critical: number;
  major: number;
  minor: number;
  nit: number;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <XAxis dataKey="at" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "var(--color-panel-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="critical" stroke="var(--color-severity-critical)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="major" stroke="var(--color-severity-major)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="minor" stroke="var(--color-severity-minor)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="nit" stroke="var(--color-severity-nit)" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="total" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
