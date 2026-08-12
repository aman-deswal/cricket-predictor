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
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.92}
            />
          )}
          <circle
            cx={cx}
            cy={cy}
            r={isSelected ? 8.5 : 7}
            fill="rgba(245, 158, 11, 0.14)"
            stroke="none"
          />
          <circle
            cx={cx}
            cy={cy}
            r={isSelected ? 5.75 : 5}
            fill="#0b1016"
            stroke="#fbbf24"
            strokeWidth={2.5}
          />
          <circle
            cx={cx}
            cy={cy}
            r={2.2}
            fill="#fbbf24"
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
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.9}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={3.25}
          fill={dotProps.stroke}
          stroke="#0b1016"
          strokeWidth={1.5}
        />
      </g>
    );
  };

  return (
    <>
      <div
        className={`relative ${heightClassName ?? 'h-40 sm:h-48 lg:h-56'}`}
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 12, right: 12, bottom: 8, left: 2 }}>
            <CartesianGrid vertical={false} stroke="#243041" strokeOpacity={0.55} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => formatMarketTimestamp(Number(value), true)}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#223041', strokeOpacity: 0.7 }}
              minTickGap={28}
            />
            <YAxis
              domain={[minDomain, maxDomain]}
              tickFormatter={(value) => `${Math.round(Number(value))}%`}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#223041', strokeOpacity: 0.7 }}
              width={42}
            />
            <ReferenceLine y={50} stroke="#64748b" strokeDasharray="4 4" strokeOpacity={0.28} />
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
                strokeWidth={entry.kind === 'model' ? 3.5 : 2.75}
                strokeOpacity={entry.kind === 'model' ? 1 : 0.88}
                dot={chartRows.length <= 8 ? renderMarketDot : false}
                activeDot={{ fill: entry.color, r: 4, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {selectedMarker && (
          <div
            ref={popupRef}
            className={`pointer-events-auto absolute z-10 w-[min(18rem,calc(100%-1rem))] rounded-2xl bg-[#111820]/95 p-3 shadow-[0_16px_36px_rgba(0,0,0,0.4)] backdrop-blur ${
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
                className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 hover:bg-white/[0.1] hover:text-white"
                aria-label="Close move details"
              >
                Close
              </button>
            </div>
            <ol className="mt-3 space-y-2">
              {selectedMarker.annotation.events.map((event, index) => (
                <li
                  key={`${event.snapshot_at}-${event.type}-${index}`}
                  className="rounded-xl bg-white/[0.04] p-2.5"
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
      <div className="mt-2 flex flex-wrap gap-2" aria-label="Chart legend">
        {series.map((entry) => (
          <span
            key={`${entry.id}-legend`}
            className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300"
          >
            <span className="relative inline-flex h-2.5 w-5 items-center" aria-hidden="true">
              <span
                className="absolute inset-x-0 top-1/2 border-t-2"
                style={{ borderColor: entry.color, opacity: entry.kind === 'model' ? 1 : 0.88 }}
              />
              <span
                className={`absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  entry.kind === 'model' ? 'border-2 bg-[#0b1016]' : ''
                }`}
                style={{
                  borderColor: entry.color,
                  backgroundColor: entry.kind === 'model' ? '#0b1016' : entry.color,
                }}
              />
            </span>
            {entry.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        {insightCaption ?? 'Tap a gold SixSense point to inspect the input changes tied to that move.'}
      </p>
    </>
  );
}
