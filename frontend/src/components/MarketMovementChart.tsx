'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MovementAnnotation, MovementSeries } from '@/lib/pre-match-movement';

interface MarketMovementChartProps {
  chartRows: Array<Record<string, number | null>>;
  series: MovementSeries[];
  minDomain: number;
  maxDomain: number;
  ariaLabel: string;
  annotations: MovementAnnotation[];
}

function formatMarketTimestamp(timestamp: number, compact = false): string {
  return new Date(timestamp).toLocaleString(undefined, compact
    ? { month: 'short', day: 'numeric', hour: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' });
}

export function MarketMovementChart({
  chartRows,
  series,
  minDomain,
  maxDomain,
  ariaLabel,
  annotations,
}: MarketMovementChartProps) {
  const accessibleSummaries = series.map((entry) => {
    const values = chartRows
      .map((row) => row[entry.id])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const opening = values[0];
    const latest = values[values.length - 1];
    const delta = latest - opening;
    const direction = Math.abs(delta) < 0.05 ? 'was unchanged' : delta > 0 ? 'rose' : 'fell';
    return `${entry.label}: opened at ${opening.toFixed(1)}%, latest ${latest.toFixed(1)}%, and ${direction}${direction === 'was unchanged' ? '' : ` by ${Math.abs(delta).toFixed(1)} percentage points`} across ${values.length} ${values.length === 1 ? 'snapshot' : 'snapshots'}.`;
  });
  const overlappingDotOffsets = new Map<string, number>();
  chartRows.forEach((row) => {
    const timestamp = Number(row.timestamp);
    const groups = new Map<string, string[]>();

    series.forEach((entry) => {
      const value = row[entry.id];
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      const bucketKey = `${timestamp}:${value.toFixed(1)}`;
      const entries = groups.get(bucketKey) ?? [];
      entries.push(entry.id);
      groups.set(bucketKey, entries);
    });

    groups.forEach((bookIds, bucketKey) => {
      const offsets = bookIds.length === 1
        ? [0]
        : bookIds.length === 2
          ? [-5, 5]
          : [-8, 0, 8];

      bookIds.forEach((bookId, index) => {
        overlappingDotOffsets.set(`${bucketKey}:${bookId}`, offsets[index] ?? 0);
      });
    });
  });

  const renderMarketDot = (dotProps: {
    cx?: number;
    cy?: number;
    payload?: Record<string, number | string | null>;
    value?: number | string | Array<number | string>;
    dataKey?: string | number;
    stroke?: string;
  }) => {
    if (typeof dotProps.cx !== 'number' || typeof dotProps.cy !== 'number' || typeof dotProps.dataKey !== 'string') {
      return null;
    }

    const timestamp = Number(dotProps.payload?.timestamp);
    const numericValue = typeof dotProps.value === 'number'
      ? dotProps.value
      : Array.isArray(dotProps.value) && typeof dotProps.value[0] === 'number'
        ? dotProps.value[0]
        : null;

    if (!Number.isFinite(timestamp) || numericValue === null) return null;

    const offsetKey = `${timestamp}:${numericValue.toFixed(1)}:${dotProps.dataKey}`;
    return (
      <circle
        cx={dotProps.cx + (overlappingDotOffsets.get(offsetKey) ?? 0)}
        cy={dotProps.cy}
        r={3.25}
        fill={dotProps.stroke}
        stroke="#0b1016"
        strokeWidth={1.5}
      />
    );
  };

  return (
    <>
      <div
        className="h-32 sm:h-36 lg:h-44"
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 5" stroke="#1f2937" strokeOpacity={0.7} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => formatMarketTimestamp(Number(value), true)}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[minDomain, maxDomain]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <ReferenceLine y={50} stroke="#64748b" strokeDasharray="4 4" strokeOpacity={0.28} />
            {annotations.map((annotation) => (
              <ReferenceDot
                key={`${annotation.timestamp}-${annotation.probability}`}
                x={annotation.timestamp}
                y={annotation.probability}
                r={5}
                fill="#0b1016"
                stroke="#fbbf24"
                strokeWidth={2.5}
                ifOverflow="extendDomain"
              />
            ))}
            <Tooltip
              contentStyle={{
                backgroundColor: '#111820',
                border: '1px solid rgba(245,158,11,0.16)',
                borderRadius: '12px',
                fontSize: '11px',
                fontFamily: 'var(--font-jetbrains-mono, monospace)',
              }}
              labelFormatter={(value) => formatMarketTimestamp(Number(value))}
              formatter={(value, name) => {
                const entry = series.find((candidate) => candidate.id === name);
                const numericValue = typeof value === 'number'
                  ? value
                  : Array.isArray(value) && typeof value[0] === 'number'
                    ? value[0]
                    : null;
                if (numericValue === null) return ['—', entry?.label ?? String(name)];
                return [`${numericValue.toFixed(1)}%`, entry?.label ?? String(name)];
              }}
            />
            {series.map((entry) => (
              <Line
                key={entry.id}
                type="monotone"
                dataKey={entry.id}
                stroke={entry.color}
                strokeWidth={entry.kind === 'model' ? 3 : 2}
                strokeDasharray={entry.kind === 'market' ? '6 4' : undefined}
                dot={chartRows.length <= 8 ? renderMarketDot : false}
                activeDot={{ fill: entry.color, r: 4, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only">
        {accessibleSummaries.map((summary, index) => (
          <li key={series[index].id}>{summary}</li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2" aria-label="Chart legend">
        {series.map((entry) => (
          <span
            key={`${entry.id}-legend`}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300"
          >
            <span
              className={`w-4 border-t-2 ${entry.kind === 'market' ? 'border-dashed' : ''}`}
              style={{ borderColor: entry.color }}
              aria-hidden="true"
            />
            {entry.label}
          </span>
        ))}
      </div>
    </>
  );
}
