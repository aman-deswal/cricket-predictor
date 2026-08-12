'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  type Coordinate,
  ColorType,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { MovementAnnotation, MovementSeries } from '@/lib/pre-match-movement';

type ChartLinePoint = { time: UTCTimestamp; value: number };

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

interface HoverState {
  x: Coordinate;
  y: Coordinate;
  timestamp: number;
  values: Array<{
    id: string;
    label: string;
    color: string;
    value: number;
  }>;
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

function toChartTime(timestamp: number): UTCTimestamp {
  return Math.floor(timestamp / 1000) as UTCTimestamp;
}

function isLineValueData(value: unknown): value is ChartLinePoint {
  return typeof value === 'object'
    && value !== null
    && 'value' in value
    && typeof (value as { value?: unknown }).value === 'number';
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const seriesRefs = useRef(new Map<string, ISeriesApi<'Area'> | ISeriesApi<'Line'>>());
  const [selectedMarker, setSelectedMarker] = useState<{
    annotation: MovementAnnotation;
    x: Coordinate;
    y: Coordinate;
  } | null>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [annotationCoords, setAnnotationCoords] = useState<Array<{
    annotation: MovementAnnotation;
    x: Coordinate;
    y: Coordinate;
  }>>([]);

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
  const modelStats = seriesStats.find((entry) => entry.kind === 'model') ?? null;
  const comparisonStats = seriesStats.find((entry) => entry.kind === 'market') ?? null;
  const chartWindowLabel = chartRows.length > 1
    ? `${formatMarketTimestamp(Number(chartRows[0]?.timestamp), true)} → ${formatMarketTimestamp(Number(chartRows[chartRows.length - 1]?.timestamp), true)}`
    : chartRows.length === 1
      ? formatMarketTimestamp(Number(chartRows[0]?.timestamp), true)
      : 'Awaiting history';

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'var(--font-jetbrains-mono, monospace)',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(36, 48, 65, 0.12)' },
        horzLines: { color: 'rgba(36, 48, 65, 0.42)' },
      },
      rightPriceScale: {
        visible: true,
        borderColor: 'rgba(34, 48, 65, 0.7)',
        scaleMargins: { top: 0.1, bottom: 0.12 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderColor: 'rgba(34, 48, 65, 0.7)',
        timeVisible: true,
        secondsVisible: false,
        minBarSpacing: 24,
        rightOffset: 0.75,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(148, 163, 184, 0.12)',
          width: 1,
          labelBackgroundColor: '#111820',
        },
        horzLine: {
          color: 'rgba(148, 163, 184, 0.08)',
          width: 1,
          labelBackgroundColor: '#111820',
        },
      },
      localization: {
        priceFormatter: (value: number) => `${value.toFixed(1)}%`,
      },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const syncSize = () => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };

    const resizeObserver = new ResizeObserver(() => syncSize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRefs.current.clear();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    seriesRefs.current.forEach((seriesApi) => chart.removeSeries(seriesApi));
    seriesRefs.current.clear();

    series.forEach((entry) => {
      const pointCount = seriesStats.find((candidate) => candidate.id === entry.id)?.pointCount ?? 0;
      const commonOptions = {
        priceScaleId: 'right' as const,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        pointMarkersVisible: pointCount <= 8,
      };
      const plottedSeries = entry.kind === 'model'
        ? chart.addSeries(AreaSeries, {
            ...commonOptions,
            lineColor: entry.color,
            topColor: 'rgba(245, 158, 11, 0.22)',
            bottomColor: 'rgba(245, 158, 11, 0.02)',
            lineWidth: 3,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: entry.color,
            crosshairMarkerBackgroundColor: '#0b1016',
            pointMarkersRadius: 4,
          })
        : chart.addSeries(LineSeries, {
            ...commonOptions,
            color: entry.color,
            lineWidth: 2,
            lineStyle: 0,
            crosshairMarkerRadius: 3,
            crosshairMarkerBorderColor: entry.color,
            crosshairMarkerBackgroundColor: '#0b1016',
            pointMarkersRadius: 3,
          });

      const data = chartRows
        .map((row) => {
          const value = row[entry.id];
          if (typeof value !== 'number' || !Number.isFinite(value)) return null;
          return {
            time: toChartTime(Number(row.timestamp)),
            value,
          };
        })
        .filter((point): point is ChartLinePoint => point !== null);

      plottedSeries.setData(data);
      seriesRefs.current.set(entry.id, plottedSeries);
    });

    chart.priceScale('right').applyOptions({
      autoScale: false,
      mode: 0,
      scaleMargins: { top: 0.1, bottom: 0.12 },
    });
    chart.priceScale('right').setVisibleRange({
      from: minDomain,
      to: maxDomain,
    });
    chart.applyOptions({
      rightPriceScale: {
        autoScale: false,
      },
    });
    chart.timeScale().fitContent();

    const modelSeries = seriesRefs.current.get('sixsense-model');
    const recomputeAnnotationCoords = () => {
      if (!chartRef.current || !modelSeries) {
        setAnnotationCoords([]);
        return;
      }
      const coords = annotations
        .map((annotation) => {
          const x = chartRef.current?.timeScale().timeToCoordinate(toChartTime(annotation.timestamp));
          const y = modelSeries.priceToCoordinate(annotation.probability);
          if (x === null || y === null) return null;
          return { annotation, x, y };
        })
        .filter((item): item is { annotation: MovementAnnotation; x: Coordinate; y: Coordinate } => item !== null);
      setAnnotationCoords(coords);
      setSelectedMarker((current) => {
        if (!current) return current;
        const next = coords.find((item) => item.annotation.timestamp === current.annotation.timestamp);
        return next ?? null;
      });
    };

    recomputeAnnotationCoords();

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0 || !param.time) {
        setHoverState(null);
        return;
      }
      const hoveredValues = series
        .map((entry) => {
          const api = seriesRefs.current.get(entry.id);
          if (!api) return null;
          const data = param.seriesData.get(api);
          if (!isLineValueData(data)) return null;
          return {
            id: entry.id,
            label: entry.label,
            color: entry.color,
            value: data.value,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (hoveredValues.length === 0) {
        setHoverState(null);
        return;
      }

      setHoverState({
        x: param.point.x,
        y: param.point.y,
        timestamp: Number(param.time) * 1000,
        values: hoveredValues,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.timeScale().subscribeVisibleLogicalRangeChange(recomputeAnnotationCoords);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(recomputeAnnotationCoords);
    };
  }, [annotations, chartRows, maxDomain, minDomain, series, seriesStats]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale('right').applyOptions({
      autoScale: false,
      mode: 0,
      scaleMargins: { top: 0.1, bottom: 0.12 },
    });
    chart.applyOptions({
      localization: {
        priceFormatter: (value: number) => `${value.toFixed(1)}%`,
      },
      overlayPriceScales: {
        scaleMargins: { top: 0.1, bottom: 0.12 },
      },
    });
    chart.priceScale('right').setVisibleRange({
      from: minDomain,
      to: maxDomain,
    });
  }, [maxDomain, minDomain]);

  return (
    <>
      <div
        className={`relative ${heightClassName ?? 'h-40 sm:h-48 lg:h-56'}`}
        role="img"
        aria-label={ariaLabel}
      >
        <div ref={containerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0">
          {modelStats?.latest !== null && modelStats?.latest !== undefined && (
            <div className="absolute left-3 top-3 z-[1] rounded-2xl bg-[#0b1016]/78 px-3 py-2 backdrop-blur">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                SixSense
              </p>
              <div className="mt-1 flex items-end gap-2">
                <span className="font-mono text-[22px] font-black leading-none text-white">
                  {modelStats.latest.toFixed(1)}%
                </span>
                <span className={`pb-0.5 font-mono text-[11px] font-black ${
                  modelStats.delta === null || Math.abs(modelStats.delta) < 0.05
                    ? 'text-slate-400'
                    : modelStats.delta > 0
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                }`}>
                  {modelStats.delta === null || Math.abs(modelStats.delta) < 0.05
                    ? 'Flat'
                    : `${modelStats.delta > 0 ? '+' : ''}${modelStats.delta.toFixed(1)} pts`}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {comparisonStats?.latest !== null && comparisonStats?.latest !== undefined
                  ? `vs market ${comparisonStats.latest.toFixed(1)}%`
                  : chartWindowLabel}
              </p>
            </div>
          )}
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-500/24" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0c1218]/30 to-transparent" />
          {hoverState && (
            <div className="absolute left-2 top-2 rounded-xl border border-white/[0.08] bg-[#111820]/92 px-3 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                {formatMarketTimestamp(hoverState.timestamp)}
              </p>
              <div className="mt-2 space-y-1.5">
                {hoverState.values.map((entry) => (
                  <div key={`${entry.id}-hover`} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
                        {entry.label}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-black text-white">
                      {entry.value.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {annotationCoords.map(({ annotation, x, y }) => {
            const isSelected = annotation.timestamp === selectedMarker?.annotation.timestamp;
            return (
              <button
                key={`${annotation.timestamp}-marker`}
                type="button"
                data-annotation-trigger="true"
                onClick={() => setSelectedMarker((current) => (
                  current?.annotation.timestamp === annotation.timestamp
                    ? null
                    : { annotation, x, y }
                ))}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{ left: x, top: y }}
                aria-expanded={isSelected}
                aria-label={`${formatMarketTimestamp(annotation.timestamp)}: ${annotation.eventCount} input ${annotation.eventCount === 1 ? 'event' : 'events'} tied to this SixSense move`}
              >
                <span className="block h-4 w-4 rounded-full border-2 border-amber-400 bg-[#0b1016] shadow-[0_0_0_3px_rgba(245,158,11,0.14)]" />
              </button>
            );
          })}
        </div>
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
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        Charting by TradingView Lightweight Charts.
      </p>
    </>
  );
}
