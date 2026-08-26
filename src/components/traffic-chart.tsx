"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChartDate, formatNumber } from "@/lib/format";
import type { TimeseriesPoint } from "@/lib/types";

interface TrafficChartProps {
  data: TimeseriesPoint[];
}

export function TrafficChart({ data }: TrafficChartProps) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="panel animate-rise animate-rise-delay-2 rounded-2xl p-4 sm:rounded-3xl sm:p-5 md:p-6">
      <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink sm:text-xl">
            Visitors over time
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Users and sessions day by day</p>
        </div>
      </div>
      <div className={`chart-scroll h-56 w-full sm:h-72 ${compact ? "" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{
              top: 8,
              right: compact ? 4 : 8,
              left: 0,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="usersFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0e8f7c" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0e8f7c" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(18,32,43,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              tick={{ fill: "#3d5160", fontSize: compact ? 10 : 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={compact ? 36 : 28}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => formatNumber(Number(v))}
              tick={{ fill: "#3d5160", fontSize: compact ? 10 : 12 }}
              axisLine={false}
              tickLine={false}
              width={compact ? 32 : 42}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 14,
                border: "1px solid rgba(18,32,43,0.08)",
                background: "rgba(255,255,255,0.95)",
                boxShadow: "0 12px 30px rgba(18,32,43,0.08)",
                fontSize: 12,
              }}
              labelFormatter={(label) => formatChartDate(String(label))}
              formatter={(value, name) => [
                formatNumber(Number(value ?? 0)),
                name === "users"
                  ? "Users"
                  : name === "sessions"
                    ? "Sessions"
                    : "Previous period",
              ]}
            />
            <Area
              type="monotone"
              dataKey="prevUsers"
              stroke="#9aacb8"
              strokeWidth={1.5}
              fill="transparent"
              strokeDasharray="2 4"
              animationDuration={700}
            />
            <Area
              type="monotone"
              dataKey="users"
              stroke="#0e8f7c"
              strokeWidth={compact ? 2 : 2.5}
              fill="url(#usersFill)"
              animationDuration={900}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="#e4572e"
              strokeWidth={1.75}
              fill="transparent"
              strokeDasharray="5 5"
              animationDuration={1100}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-teal" /> Users
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-5 border-t-2 border-dashed border-coral" /> Sessions
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-5 border-t-2 border-dotted border-[#9aacb8]" /> Users,
          previous period
        </span>
      </div>
    </div>
  );
}
