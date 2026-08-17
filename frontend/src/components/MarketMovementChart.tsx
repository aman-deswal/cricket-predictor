'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
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

interface HoverRow {
  id: string;
  label: string;
  color: string;
  presentation: 'line' | 'candle';
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  delta?: number;
}

interface HoverState {
  x: number;
  y: number;
  timestamp: number | null;
  hasCandleRow: boolean;
  rows: HoverRow[];
}

interface PreparedSeriesPoint {
  timestamp: number;
  value: number;
}

interface PreparedSeries {
  id: string;
  label: string;
  color: string;
  kind: 'model' | 'market';
  points: PreparedSeriesPoint[];
  lineData: LineData<Time>[];
}

const CANDLE_INTERVALS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  2 * 24 * 60 * 60 * 1000,
] as const;

function toChartTime(timestamp: number): Time {
  return Math.floor(timestamp / 1000) as Time;
}

function fromChartTime(time: Time | undefined): number | null {
  if (typeof time === 'number') return time * 1000;
  return null;
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

function formatSignedDelta(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)} pts`;
}

function buildTimestampLabel(firstTimestamp: number | null, lastTimestamp: number | null): string | null {
  if (firstTimestamp === null || lastTimestamp === null) return null;
  return `${formatMarketTimestamp(firstTimestamp, true)} to ${formatMarketTimestamp(lastTimestamp, true)}`;
}

function formatAxisTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  if (date.getMinutes() === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
    });
  }
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCandleIntervalLabel(intervalMs: number): string {
  if (intervalMs < 60 * 60 * 1000) {
    return `${Math.round(intervalMs / (24 * 60 * 60 * 1000))}d`;
  }
  if (intervalMs < 24 * 60 * 60 * 1000) {
    return `${Math.round(intervalMs / (60 * 60 * 1000))}h`;
  }
  return `${Math.round(intervalMs / (24 * 60 * 60 * 1000))}d`;
}

function formatCandleWindowLabel(timestamp: number, intervalMs: number, compact = false): string {
  const endTimestamp = timestamp + intervalMs;
  const start = new Date(timestamp);
  const end = new Date(endTimestamp);
  const sameDay = start.toDateString() === end.toDateString();

  if (compact) {
    const startLabel = start.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    });
    const endLabel = end.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return sameDay ? `${startLabel}-${endLabel}` : `${startLabel} to ${formatMarketTimestamp(endTimestamp, true)}`;
  }

  const startLabel = start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const endLabel = sameDay
    ? end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : end.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
  return `${startLabel} to ${endLabel}`;
}

function chooseCandleInterval(timestamps: number[]): number {
  if (timestamps.length <= 1) return 60 * 60 * 1000;

  const ordered = [...timestamps].sort((left, right) => left - right);
  const span = Math.max(ordered[ordered.length - 1] - ordered[0], 1);
  const gaps = ordered
    .slice(1)
    .map((timestamp, index) => timestamp - ordered[index])
    .filter((gap) => gap > 0)
    .sort((left, right) => left - right);
  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : span;
  const targetBucket = Math.max(medianGap, span / 14);
  return CANDLE_INTERVALS_MS.find((interval) => interval >= targetBucket)
    ?? CANDLE_INTERVALS_MS[CANDLE_INTERVALS_MS.length - 1];
}

function buildCandles(points: PreparedSeriesPoint[], intervalMs: number): CandlestickData<Time>[] {
  if (points.length === 0) return [];

  const buckets = new Map<number, CandlestickData<Time>>();

  points.forEach((point) => {
    const bucketStart = Math.floor(point.timestamp / intervalMs) * intervalMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        time: toChartTime(bucketStart),
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
      });
      return;
    }

    existing.high = Math.max(existing.high, point.value);
    existing.low = Math.min(existing.low, point.value);
    existing.close = point.value;
  });

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, candle]) => candle);
}

function isLineHoverData(data: unknown): data is { value: number } {
  return typeof data === 'object'
    && data !== null
    && 'value' in data
    && typeof data.value === 'number'
    && Number.isFinite(data.value);
}

function isCandleHoverData(data: unknown): data is { open: number; high: number; low: number; close: number } {
  return typeof data === 'object'
    && data !== null
    && 'open' in data
    && 'high' in data
    && 'low' in data
    && 'close' in data
    && typeof data.open === 'number'
    && typeof data.high === 'number'
    && typeof data.low === 'number'
    && typeof data.close === 'number';
}

function getCandlePalette(kind: 'model' | 'market') {
  if (kind === 'model') {
    return {
      upColor: 'rgba(251, 191, 36, 0.82)',
      downColor: 'rgba(217, 119, 6, 0.68)',
      borderUpColor: '#fbbf24',
      borderDownColor: '#d97706',
      wickUpColor: 'rgba(253, 224, 71, 0.82)',
      wickDownColor: 'rgba(245, 158, 11, 0.74)',
    };
  }

  return {
    upColor: 'rgba(56, 189, 248, 0.5)',
    downColor: 'rgba(14, 165, 233, 0.24)',
    borderUpColor: '#7dd3fc',
    borderDownColor: '#38bdf8',
    wickUpColor: 'rgba(125, 211, 252, 0.72)',
    wickDownColor: 'rgba(56, 189, 248, 0.64)',
  };
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
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<{
    annotation: MovementAnnotation;
    x: number;
    y: number;
  } | null>(null);

  const annotationsByTimestamp = useMemo(() => new Map(
    annotations.map((annotation) => [annotation.timestamp, annotation]),
  ), [annotations]);
  const annotationsById = useMemo(() => new Map(
    annotations.map((annotation) => [`annotation-${annotation.timestamp}`, annotation]),
  ), [annotations]);

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

  const seriesSummaries = useMemo(() => series.map((entry) => {
    const values = chartRows
      .map((row) => row[entry.id])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const opening = values[0] ?? null;
    const latest = values[values.length - 1] ?? null;
    return {
      ...entry,
      opening,
      latest,
      delta: opening !== null && latest !== null ? latest - opening : null,
      hasData: values.length > 0,
    };
  }), [chartRows, series]);

  const firstTimestamp = chartRows.length > 0 ? Number(chartRows[0].timestamp) : null;
  const lastTimestamp = chartRows.length > 0 ? Number(chartRows[chartRows.length - 1].timestamp) : null;
  const timestampLabel = buildTimestampLabel(firstTimestamp, lastTimestamp);

  const preparedSeries = useMemo(() => series.map((entry) => ({
    ...entry,
    points: chartRows
      .map((row) => {
        const timestamp = Number(row.timestamp);
        const value = row[entry.id];
        if (!Number.isFinite(timestamp) || typeof value !== 'number' || !Number.isFinite(value)) return null;
        return { timestamp, value } satisfies PreparedSeriesPoint;
      })
      .filter((row): row is PreparedSeriesPoint => row !== null),
  })).map((entry) => ({
    ...entry,
    lineData: entry.points.map((point) => ({
      time: toChartTime(point.timestamp),
      value: point.value,
    }) satisfies LineData<Time>),
  })), [chartRows, series]);

  const primaryCandleSeries = useMemo(() => preparedSeries.find((entry) => entry.kind === 'market' && entry.points.length > 0)
    ?? preparedSeries.find((entry) => entry.points.length > 0)
    ?? null, [preparedSeries]);
  const candleIntervalMs = useMemo(() => chooseCandleInterval(
    primaryCandleSeries?.points.map((point) => point.timestamp) ?? [],
  ), [primaryCandleSeries]);
  const primaryCandles = useMemo(() => (
    primaryCandleSeries ? buildCandles(primaryCandleSeries.points, candleIntervalMs) : []
  ), [candleIntervalMs, primaryCandleSeries]);
  const comparisonSeries = useMemo(() => preparedSeries.filter((entry) => entry.id !== primaryCandleSeries?.id), [preparedSeries, primaryCandleSeries]);

  const annotationMarkers = useMemo(() => annotations.map((annotation) => ({
    id: `annotation-${annotation.timestamp}`,
    time: toChartTime(annotation.timestamp),
    position: 'atPriceMiddle' as const,
    shape: 'circle' as const,
    color: '#fbbf24',
    size: 0.6,
    price: annotation.probability,
  })), [annotations]);

  const accessibleSummaries = useMemo(() => seriesSummaries.map((entry) => {
    if (entry.latest === null || entry.opening === null || entry.delta === null) {
      return `${entry.label}: no plotted snapshots are available yet.`;
    }
    const direction = Math.abs(entry.delta) < 0.05 ? 'was unchanged' : entry.delta > 0 ? 'rose' : 'fell';
    return `${entry.label}: opened at ${entry.opening.toFixed(1)}%, latest ${entry.latest.toFixed(1)}%, and ${direction}${direction === 'was unchanged' ? '' : ` by ${Math.abs(entry.delta).toFixed(1)} percentage points`}.`;
  }), [seriesSummaries]);

  useEffect(() => {
    const container = chartHostRef.current;
    if (!container) return;
    if (preparedSeries.every((entry) => entry.lineData.length === 0)) {
      setHoverState(null);
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        textColor: '#94a3b8',
        background: { type: ColorType.Solid, color: '#050b13' },
        attributionLogo: false,
      },
      leftPriceScale: {
        visible: true,
        borderVisible: false,
        ticksVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.18 },
      },
      rightPriceScale: {
        visible: false,
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        ticksVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffsetPixels: 20,
        barSpacing: primaryCandles.length >= 10 ? 18 : 26,
        minBarSpacing: 10,
        tickMarkFormatter: (time: Time) => {
          const timestamp = fromChartTime(time);
          return timestamp === null ? '' : formatAxisTimeLabel(timestamp);
        },
        tickMarkMaxCharacterLength: 8,
        uniformDistribution: true,
        allowBoldLabels: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: {
          color: 'rgba(36, 48, 65, 0.55)',
          style: LineStyle.SparseDotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(71, 85, 105, 0.48)',
          style: LineStyle.SparseDotted,
          width: 1,
          labelVisible: false,
        },
        horzLine: {
          color: 'rgba(71, 85, 105, 0.48)',
          style: LineStyle.SparseDotted,
          width: 1,
          labelBackgroundColor: '#0f172a',
        },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: false,
        axisDoubleClickReset: false,
      },
      localization: {
      priceFormatter: (value: number) => `${value.toFixed(1)}%`,
        timeFormatter: (time: Time) => {
          const timestamp = fromChartTime(time);
          return timestamp === null ? '' : formatMarketTimestamp(timestamp);
        },
      },
    });

    const renderedSeries: Array<{
      entry: PreparedSeries;
      api: ISeriesApi<'Candlestick', Time> | ISeriesApi<'Line', Time>;
      presentation: 'candle' | 'line';
    }> = [];

    let markerSeries: ISeriesApi<'Candlestick', Time> | ISeriesApi<'Line', Time> | null = null;

    if (primaryCandleSeries && primaryCandles.length > 0) {
      const candle = chart.addSeries(CandlestickSeries, {
      ...getCandlePalette(primaryCandleSeries.kind),
      borderVisible: true,
      wickVisible: true,
      lastValueVisible: false,
      priceLineVisible: false,
      priceScaleId: 'left',
      });
      candle.setData(primaryCandles);
      renderedSeries.push({
      entry: primaryCandleSeries,
      api: candle,
      presentation: 'candle',
      });
      if (primaryCandleSeries.kind === 'model') {
      markerSeries = candle;
      }
      candle.createPriceLine({
      price: 50,
      color: 'rgba(100, 116, 139, 0.32)',
      lineWidth: 1,
      lineStyle: LineStyle.LargeDashed,
      axisLabelVisible: false,
      title: '',
      });
    }

    comparisonSeries.forEach((entry) => {
      const line = chart.addSeries(LineSeries, {
      color: entry.color,
      lineWidth: entry.kind === 'model' ? 3 : 2,
      lineType: LineType.Simple,
      lineStyle: entry.kind === 'model' ? LineStyle.Solid : LineStyle.LargeDashed,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: entry.kind === 'model' ? 4 : 2,
      crosshairMarkerBorderColor: entry.color,
      crosshairMarkerBackgroundColor: '#050b13',
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
      pointMarkersRadius: entry.kind === 'model' ? 2 : 1.5,
      priceScaleId: 'left',
      });
      line.setData(entry.lineData);
      renderedSeries.push({
      entry,
      api: line,
      presentation: 'line',
      });
      if (entry.kind === 'model') {
      markerSeries = line;
      }
    });

    if (markerSeries) {
      createSeriesMarkers(markerSeries, annotationMarkers);
    }

    chart.priceScale('left').applyOptions({
      autoScale: false,
      mode: 0,
    });
    chart.timeScale().fitContent();
    chart.priceScale('left').setVisibleRange({ from: minDomain, to: maxDomain });

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0 || !container) {
        setHoverState(null);
        return;
      }

      const rows = renderedSeries
        .map(({ entry, api, presentation }) => {
          const dataPoint = param.seriesData.get(api);
          if (!dataPoint) return null;

          if (presentation === 'candle' && isCandleHoverData(dataPoint)) {
            const row: HoverRow = {
              id: entry.id,
              label: entry.label,
              color: entry.color,
              presentation,
              value: dataPoint.close,
              open: dataPoint.open,
              high: dataPoint.high,
              low: dataPoint.low,
              close: dataPoint.close,
              delta: dataPoint.close - dataPoint.open,
            };
            return row;
          }

          if (presentation === 'line' && isLineHoverData(dataPoint)) {
            const row: HoverRow = {
              id: entry.id,
              label: entry.label,
              color: entry.color,
              presentation,
              value: dataPoint.value,
            };
            return row;
          }

          return null;
        })
        .filter((entry): entry is HoverRow => entry !== null);

      if (rows.length === 0) {
        setHoverState(null);
        return;
      }

      setHoverState({
        x: param.point.x,
        y: param.point.y,
        timestamp: fromChartTime(param.time),
        hasCandleRow: rows.some((row) => row.presentation === 'candle'),
        rows,
      });
    };

    const handleChartClick = (param: MouseEventParams<Time>) => {
      const markerId = typeof param.hoveredObjectId === 'string' ? param.hoveredObjectId : null;
      if (!markerId || !param.point) {
        setSelectedMarker(null);
        return;
      }

      const annotation = annotationsById.get(markerId);
      if (!annotation) {
        setSelectedMarker(null);
        return;
      }

      setSelectedMarker({
        annotation,
        x: param.point.x,
        y: param.point.y,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleChartClick);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      chart.resize(width, height);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
    };
  }, [annotationMarkers, annotationsById, maxDomain, minDomain, preparedSeries]);

  return (
    <>
      {timestampLabel && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-slate-400">
            {timestampLabel}
          </span>
          {primaryCandleSeries && (
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-slate-300">
              {primaryCandleSeries.kind === 'market' ? 'Market' : 'SixSense'} {formatCandleIntervalLabel(candleIntervalMs)} candles
            </span>
          )}
          {annotations.length > 0 && (
            <span className="rounded-full border border-amber-300/10 bg-amber-300/[0.08] px-2.5 py-1 text-amber-200/90">
              Gold dots = explained model move
            </span>
          )}
        </div>
      )}

      <div
        className={`relative mt-3 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.2),transparent_40%),linear-gradient(180deg,rgba(7,12,20,0.98),rgba(5,9,16,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${heightClassName ?? 'h-40 sm:h-48 lg:h-56'}`}
        role="img"
        aria-label={ariaLabel}
      >
        <div ref={chartHostRef} className="h-full w-full" />

        {hoverState && (
          <div
            className={`pointer-events-none absolute z-[3] min-w-[10rem] rounded-2xl border border-white/10 bg-[#0d141d]/96 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.38)] backdrop-blur ${
              hoverState.y < 92 ? 'translate-y-3' : '-translate-y-[calc(100%+0.75rem)]'
            }`}
            style={{
              left: `clamp(0.75rem, calc(${hoverState.x}px - 5rem), calc(100% - 11rem))`,
              top: `${hoverState.y}px`,
            }}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {hoverState.timestamp !== null
                ? hoverState.hasCandleRow
                  ? formatCandleWindowLabel(hoverState.timestamp, candleIntervalMs)
                  : formatMarketTimestamp(hoverState.timestamp)
                : 'Snapshot'}
            </p>
            <div className="mt-2 space-y-2">
              {hoverState.rows.map((row) => (
                <div key={row.id} className="rounded-xl bg-white/[0.04] px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-slate-300">
                      <span
                        className={row.presentation === 'candle' ? 'h-3 w-2 rounded-[2px]' : 'h-2 w-2 rounded-full'}
                        style={{ backgroundColor: row.color }}
                      />
                      {row.label}
                    </span>
                    <span className="font-mono font-black text-white">{row.value.toFixed(1)}%</span>
                  </div>
                  {row.presentation === 'candle' && row.open !== undefined && row.high !== undefined && row.low !== undefined && row.close !== undefined && (
                    <div className="mt-1.5 space-y-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                      <div className="flex items-center justify-between gap-2">
                        <span>O {row.open.toFixed(1)} / H {row.high.toFixed(1)}</span>
                        <span>L {row.low.toFixed(1)} / C {row.close.toFixed(1)}</span>
                      </div>
                      <div className={`${row.delta === undefined ? 'text-slate-400' : row.delta >= 0 ? 'text-emerald-200' : 'text-amber-200'}`}>
                        {row.delta === undefined ? 'No interval move' : `${formatSignedDelta(row.delta)} in this candle`}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedMarker && (
          <div
            ref={popupRef}
            className={`pointer-events-auto absolute z-[4] w-[min(18rem,calc(100%-1rem))] rounded-2xl border border-white/10 bg-[#111820]/95 p-3 shadow-[0_16px_36px_rgba(0,0,0,0.4)] backdrop-blur ${
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

        <div className="pointer-events-none absolute bottom-2 right-3 text-[8px] uppercase tracking-[0.14em] text-slate-600">
          TradingView
        </div>
      </div>

      <ul className="sr-only">
        {accessibleSummaries.map((summary, index) => (
          <li key={series[index].id}>{summary}</li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Chart legend">
        {primaryCandleSeries && (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
            <span
              className="inline-flex h-3 w-2 rounded-[2px]"
              style={{ backgroundColor: primaryCandleSeries.color }}
              aria-hidden="true"
            />
            {primaryCandleSeries.label} candles
          </span>
        )}
        {comparisonSeries.map((entry) => (
          <span
            key={`${entry.id}-legend`}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300"
          >
            <span className="inline-flex h-2 w-5 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
            {entry.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
          <span className="font-mono text-slate-400">%</span>
          Bounded probability scale
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        {insightCaption ?? `Candles compress each ${formatCandleIntervalLabel(candleIntervalMs)} window into open, high, low, and close win probability so the market path reads like a real movement chart. Hover for exact percentages and tap a gold dot to inspect the model inputs behind that move.`}
      </p>
    </>
  );
}
