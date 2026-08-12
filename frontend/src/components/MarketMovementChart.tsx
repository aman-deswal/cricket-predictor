'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
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
  insightCaption?: string;
  heightClassName?: string;
}

function formatMarketTimestamp(timestamp: number, compact = false): string {
  return new Date(timestamp).toLocaleString(undefined, compact
    ? { month: 'short', day: 'numeric', hour: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' });
}

function formatPopupEventTime(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Time unavailable';
  return timestamp.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MarketMovementChart({
  chartRows,
  series,
  minDomain,
  maxDomain,
  ariaLabel,
  annotations,
  insightCaption,
  heightClassName,
}: MarketMovementChartProps) {
  const seriesStats = useMemo(() => series.map((entry) => {
    const points = chartRows
      .map((row) => row[entry.id])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const opening = points[0] ?? null;
    const latest = points[points.length - 1] ?? null;
    const delta = opening !== null && latest !== null ? latest - opening : null;
    return {
      ...entry,
      pointCount: points.length,
      opening,
      latest,
      delta,
    };
  }), [chartRows, series]);
  const annotationsByTimestamp = useMemo(() => new Map(
    annotations.map((annotation) => [annotation.timestamp, annotation]),
  ), [annotations]);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<{
    annotation: MovementAnnotation;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedMarker) return;
    if (!annotationsByTimestamp.has(selectedMarker.annotation.timestamp)) {
      setSelectedMarker(null);
    }
  }, [annotationsByTimestamp, selectedMarker]);

  useEffect(() => {
    if (!selectedMarker) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (popupRef.current?.contains(target)) return;
      if (target.closest('[data-annotation-trigger="true"]')) return;
      setSelectedMarker(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [selectedMarker]);

  const accessibleSummaries = seriesStats.map((entry) => {
    const opening = entry.opening;
    const latest = entry.latest;
    if (opening === null || latest === null) {
      return `${entry.label}: no usable chart points were available.`;
    }
    const delta = latest - opening;
    const direction = Math.abs(delta) < 0.05 ? 'was unchanged' : delta > 0 ? 'rose' : 'fell';
    return `${entry.label}: opened at ${opening.toFixed(1)}%, latest ${latest.toFixed(1)}%, and ${direction}${direction === 'was unchanged' ? '' : ` by ${Math.abs(delta).toFixed(1)} percentage points`} across ${entry.pointCount} ${entry.pointCount === 1 ? 'snapshot' : 'snapshots'}.`;
  });
  const pointCountsBySeries = new Map(series.map((entry) => [
    entry.id,
    chartRows.reduce((count, row) => {
      const value = row[entry.id];
      return typeof value === 'number' && Number.isFinite(value) ? count + 1 : count;
    }, 0),
  ]));
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
    const emptyDot = (
      <circle
        key={`empty-${String(dotProps.dataKey)}-${String(dotProps.cx)}-${String(dotProps.cy)}`}
        cx={0}
        cy={0}
        r={0}
        fill="transparent"
        stroke="none"
      />
    );
    if (typeof dotProps.cx !== 'number' || typeof dotProps.cy !== 'number' || typeof dotProps.dataKey !== 'string') {
      return emptyDot;
    }

    const timestamp = Number(dotProps.payload?.timestamp);
    const numericValue = typeof dotProps.value === 'number'
      ? dotProps.value
      : Array.isArray(dotProps.value) && typeof dotProps.value[0] === 'number'
        ? dotProps.value[0]
        : null;

    if (!Number.isFinite(timestamp) || numericValue === null) return emptyDot;

    const offsetKey = `${timestamp}:${numericValue.toFixed(1)}:${dotProps.dataKey}`;
    const annotation = dotProps.dataKey === 'sixsense-model'
      ? annotationsByTimestamp.get(timestamp)
      : undefined;
    const isSelected = annotation?.timestamp === selectedMarker?.annotation.timestamp;
    const cx = dotProps.cx + (overlappingDotOffsets.get(offsetKey) ?? 0);
    const cy = dotProps.cy;
    const showSinglePointStub = (pointCountsBySeries.get(dotProps.dataKey) ?? 0) === 1;

    if (annotation) {
      return (
        <g
          key={offsetKey}
          data-annotation-trigger="true"
          role="button"
          tabIndex={0}
          onClick={() => setSelectedMarker((current) => (
            current?.annotation.timestamp === annotation.timestamp
              ? null
              : { annotation, x: cx, y: cy }
          ))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelectedMarker({ annotation, x: cx, y: cy });
            } else if (event.key === 'Escape') {
              setSelectedMarker(null);
            }
          }}
          aria-expanded={isSelected}
          aria-label={`${formatMarketTimestamp(annotation.timestamp)}: ${annotation.eventCount} input ${annotation.eventCount === 1 ? 'event' : 'events'} tied to this SixSense move`}
          className="cursor-pointer"
        >
          {showSinglePointStub && (
            <line
              x1={cx - 10}
              x2={cx + 10}
              y1={cy}
              y2={cy}
              stroke={dotProps.stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.72}
            />
          )}
          <circle
            cx={cx}
            cy={cy}
            r={isSelected ? 8 : 6}
            fill="rgba(59, 130, 246, 0.16)"
            stroke="none"
          />
          <circle
            cx={cx}
            cy={cy}
            r={isSelected ? 5.5 : 4.5}
            fill="#08111b"
            stroke="#f8fafc"
            strokeWidth={2}
          />
          <circle
            cx={cx}
            cy={cy}
            r={2}
            fill="#f8fafc"
            stroke="none"
          />
        </g>
      );
    }

    return (
      <g key={offsetKey}>
        {showSinglePointStub && (
          <line
            x1={cx - 10}
            x2={cx + 10}
            y1={cy}
            y2={cy}
            stroke={dotProps.stroke}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.65}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={2.75}
          fill={dotProps.stroke}
          stroke="#08111b"
          strokeWidth={1.25}
        />
      </g>
    );
  };

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-[24px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] ${heightClassName ?? 'h-48 sm:h-56 lg:h-64'}`}
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 16, right: 16, bottom: 10, left: 6 }}>
            <CartesianGrid vertical={false} stroke="#1e293b" strokeOpacity={0.45} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => formatMarketTimestamp(Number(value), true)}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
              tickLine={false}
              axisLine={{ stroke: '#1e293b', strokeOpacity: 0.9 }}
              minTickGap={28}
            />
            <YAxis
              domain={[minDomain, maxDomain]}
              tickFormatter={(value) => `${Math.round(Number(value))}%`}
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'var(--font-jetbrains-mono, monospace)' }}
              tickLine={false}
              axisLine={{ stroke: '#1e293b', strokeOpacity: 0.9 }}
              width={46}
            />
            <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 5" strokeOpacity={0.3} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(8,17,27,0.96)',
                border: '1px solid rgba(148,163,184,0.12)',
                borderRadius: '14px',
                boxShadow: '0 18px 44px rgba(2,6,23,0.42)',
                fontSize: '11px',
                fontFamily: 'var(--font-jetbrains-mono, monospace)',
                color: '#e2e8f0',
              }}
              itemStyle={{ color: '#cbd5e1', paddingTop: 2, paddingBottom: 2 }}
              labelStyle={{ color: '#f8fafc', marginBottom: 8, fontWeight: 600 }}
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
                strokeWidth={entry.kind === 'model' ? 2.8 : 2.15}
                strokeOpacity={entry.kind === 'model' ? 0.96 : 0.72}
                dot={chartRows.length <= 8 ? renderMarketDot : false}
                activeDot={{ fill: entry.color, r: entry.kind === 'model' ? 4.5 : 3.5, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {selectedMarker && (
          <div
            ref={popupRef}
            className={`pointer-events-auto absolute z-10 w-[min(18rem,calc(100%-1rem))] rounded-2xl border border-white/[0.08] bg-[#08111b]/95 p-3 shadow-[0_16px_36px_rgba(0,0,0,0.4)] backdrop-blur ${
              selectedMarker.y < 88 ? 'translate-y-3' : '-translate-y-[calc(100%+0.75rem)]'
            }`}
            style={{
              left: `clamp(0.5rem, calc(${selectedMarker.x}px - 9rem), calc(100% - 18.5rem))`,
              top: `${selectedMarker.y}px`,
            }}
            role="dialog"
            aria-label={`Model move details for ${formatMarketTimestamp(selectedMarker.annotation.timestamp)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                  {formatMarketTimestamp(selectedMarker.annotation.timestamp)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {selectedMarker.annotation.eventCount} structured input {selectedMarker.annotation.eventCount === 1 ? 'update' : 'updates'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMarker(null)}
                className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                aria-label="Close move details"
              >
                Close
              </button>
            </div>
            <ol className="mt-3 space-y-2">
              {selectedMarker.annotation.events.map((event, index) => (
                <li
                  key={`${event.snapshot_at}-${event.type}-${index}`}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em]">
                    <time className="text-slate-400" dateTime={event.event_at}>
                      {formatPopupEventTime(event.event_at)}
                    </time>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-slate-300">
                      {event.category.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-white">{event.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{event.summary}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <ul className="sr-only">
        {accessibleSummaries.map((summary, index) => (
          <li key={series[index].id}>{summary}</li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chart legend">
        {seriesStats.map((entry) => (
          <div
            key={`${entry.id}-legend`}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"
          >
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2.5 w-6 items-center" aria-hidden="true">
                <span
                  className="absolute inset-x-0 top-1/2 border-t-2"
                  style={{ borderColor: entry.color, opacity: entry.kind === 'model' ? 0.96 : 0.78 }}
                />
                <span
                  className={`absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    entry.kind === 'model' ? 'border-2 bg-[#08111b]' : ''
                  }`}
                  style={{
                    borderColor: entry.color,
                    backgroundColor: entry.kind === 'model' ? '#08111b' : entry.color,
                  }}
                />
              </span>
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                {entry.label}
              </p>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Latest</p>
                <p className="mt-1 font-mono text-lg font-semibold text-white">
                  {entry.latest !== null ? `${entry.latest.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Move</p>
                <p className={`mt-1 font-mono text-sm font-semibold ${
                  entry.delta === null || Math.abs(entry.delta) < 0.05
                    ? 'text-slate-300'
                    : entry.delta > 0
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                }`}>
                  {entry.delta === null
                    ? '—'
                    : Math.abs(entry.delta) < 0.05
                      ? 'Flat'
                      : `${entry.delta > 0 ? '+' : '-'}${Math.abs(entry.delta).toFixed(1)} pts`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        {insightCaption ?? 'Tap a gold SixSense point to inspect the input changes tied to that move.'}
      </p>
    </>
  );
}
