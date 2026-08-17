'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  createChart,
  createSeriesMarkers,
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
  value: number;
}

interface HoverState {
  x: number;
  y: number;
  timestamp: number | null;
  rows: HoverRow[];
}

interface EndpointLabel {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
}

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
  const [endpointLabels, setEndpointLabels] = useState<EndpointLabel[]>([]);

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
    data: chartRows
      .map((row) => {
        const timestamp = Number(row.timestamp);
        const value = row[entry.id];
        if (!Number.isFinite(timestamp) || typeof value !== 'number' || !Number.isFinite(value)) return null;
        return { time: toChartTime(timestamp), value } satisfies LineData<Time>;
      })
      .filter((row): row is LineData<Time> => row !== null),
  })), [chartRows, series]);

  const annotationMarkers = useMemo(() => annotations.map((annotation) => ({
    id: `annotation-${annotation.timestamp}`,
    time: toChartTime(annotation.timestamp),
    position: 'atPriceMiddle' as const,
    shape: 'circle' as const,
    color: '#fbbf24',
    size: 1.35,
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
    if (preparedSeries.every((entry) => entry.data.length === 0)) {
      setEndpointLabels([]);
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
        scaleMargins: { top: 0.16, bottom: 0.18 },
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
        rightOffset: 7,
        barSpacing: preparedSeries.some((entry) => entry.data.length >= 5) ? 26 : 42,
        minBarSpacing: 20,
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
        priceFormatter: (value: number) => `${value.toFixed(0)}%`,
      },
    });

    const seriesApiById = new Map<string, ISeriesApi<'Line', Time>>();

    preparedSeries.forEach((entry) => {
      const line = chart.addSeries(LineSeries, {
        color: entry.color,
        lineWidth: entry.kind === 'model' ? 3 : 2,
        lineType: LineType.Simple,
        lineStyle: entry.kind === 'model' ? LineStyle.Solid : LineStyle.LargeDashed,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: entry.kind === 'model' ? 5 : 4,
        crosshairMarkerBorderColor: entry.color,
        crosshairMarkerBackgroundColor: '#050b13',
        lastValueVisible: false,
        priceLineVisible: false,
        pointMarkersVisible: entry.data.length <= 2,
        pointMarkersRadius: entry.kind === 'model' ? 3 : 2,
        priceScaleId: 'left',
      });
      line.setData(entry.data);
      seriesApiById.set(entry.id, line);

      if (entry.kind === 'model') {
        createSeriesMarkers(line, annotationMarkers);
        line.createPriceLine({
          price: 50,
          color: 'rgba(100, 116, 139, 0.32)',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: false,
          title: '',
        });
      }
    });

    chart.priceScale('left').applyOptions({
      autoScale: false,
      mode: 0,
    });
    chart.timeScale().fitContent();
    chart.priceScale('left').setVisibleRange({ from: minDomain, to: maxDomain });

    const updateEndpointPositions = () => {
      const labels = preparedSeries
        .map((entry) => {
          const api = seriesApiById.get(entry.id);
          const latestPoint = entry.data[entry.data.length - 1];
          if (!api || !latestPoint) return null;
          const x = chart.timeScale().timeToCoordinate(latestPoint.time);
          const y = api.priceToCoordinate(latestPoint.value);
          if (x === null || y === null) return null;
          return {
            id: entry.id,
            x: Number(x),
            y: Number(y),
            color: entry.color,
            label: `${entry.kind === 'model' ? 'SixSense' : 'Market'} ${latestPoint.value.toFixed(1)}%`,
          };
        })
        .filter((entry): entry is EndpointLabel => entry !== null);
      setEndpointLabels(labels);
    };

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0 || !container) {
        setHoverState(null);
        return;
      }

      const rows = preparedSeries
        .map((entry) => {
          const api = seriesApiById.get(entry.id);
          if (!api) return null;
          const dataPoint = param.seriesData.get(api);
          if (!dataPoint || !('value' in dataPoint) || typeof dataPoint.value !== 'number') return null;
          return {
            id: entry.id,
            label: entry.kind === 'model' ? 'SixSense' : 'Market',
            color: entry.color,
            value: dataPoint.value,
          } satisfies HoverRow;
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
      requestAnimationFrame(updateEndpointPositions);
    });
    resizeObserver.observe(container);

    requestAnimationFrame(updateEndpointPositions);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
    };
  }, [annotationMarkers, annotationsById, maxDomain, minDomain, preparedSeries]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
            Cleaner finance-style view
          </span>
          {annotations.length > 0 && (
            <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
              Gold markers = explained SixSense moves
            </span>
          )}
        </div>
        {timestampLabel && (
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            {timestampLabel}
          </span>
        )}
      </div>

      <div
        className={`relative mt-3 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(7,12,20,0.96),rgba(5,9,16,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${heightClassName ?? 'h-40 sm:h-48 lg:h-56'}`}
        role="img"
        aria-label={ariaLabel}
      >
        <div ref={chartHostRef} className="h-full w-full" />

        {endpointLabels.map((entry) => (
          <div
            key={entry.id}
            className="pointer-events-none absolute z-[2]"
            style={{
              left: `clamp(0.75rem, ${entry.x + 12}px, calc(100% - 8.75rem))`,
              top: `clamp(0.5rem, ${entry.y - 14}px, calc(100% - 2.5rem))`,
            }}
          >
            <div
              className="rounded-full border bg-[#0b1016]/95 px-3 py-1.5 text-[11px] font-black tracking-[0.02em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.32)]"
              style={{ borderColor: entry.color }}
            >
              {entry.label}
            </div>
          </div>
        ))}

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
              {hoverState.timestamp !== null ? formatMarketTimestamp(hoverState.timestamp) : 'Snapshot'}
            </p>
            <div className="mt-2 space-y-2">
              {hoverState.rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-2 text-slate-300">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.label}
                  </span>
                  <span className="font-mono font-black text-white">{row.value.toFixed(1)}%</span>
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
      </div>

      <ul className="sr-only">
        {accessibleSummaries.map((summary, index) => (
          <li key={series[index].id}>{summary}</li>
        ))}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Chart legend">
        {seriesSummaries.map((entry) => (
          <div
            key={`${entry.id}-legend`}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
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
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                {entry.hasData ? `${entry.latest?.toFixed(1)}% now` : 'building'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {entry.delta === null || entry.opening === null || entry.latest === null
                ? 'Waiting for enough snapshots to summarize this line.'
                : `${entry.opening.toFixed(1)}% to ${entry.latest.toFixed(1)}% (${formatSignedDelta(entry.delta)}) since the first tracked snapshot.`}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        {insightCaption ?? 'Hover for exact values. Tap a gold marker to inspect the input changes tied to that SixSense move.'}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        Chart rendering by TradingView Lightweight Charts
      </p>
    </>
  );
}
