"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { SignalEvent } from "@/lib/events";
import { truncateAddress, formatBps } from "@/lib/types";

const SPORT_COLORS: Record<string, string> = {
  NBA: "#f97316",
  NFL: "#22c55e",
  MLB: "#ef4444",
  NHL: "#3b82f6",
  Soccer: "#a855f7",
};

const SPORT_COLOR_ENTRIES = Object.entries(SPORT_COLORS);

const PADDING = { top: 24, right: 24, bottom: 48, left: 56 };
const DOT_RADIUS = 12;
const DOT_HOVER_RADIUS = 16;

// Fee axis: 0 to 500 bps (0% to 5%)
const FEE_MIN = 0;
const FEE_MAX = 500;
// SLA axis: 10000 to 30000 bps (100% to 300%)
const SLA_MIN = 10000;
const SLA_MAX = 30000;

const FEE_TICKS = [0, 100, 200, 300, 400, 500];
const SLA_TICKS = [10000, 15000, 20000, 25000, 30000];

interface SignalPlotProps {
  signals: SignalEvent[];
  onSelect: (signalId: string) => void;
}

interface TooltipData {
  sport: string;
  genius: string;
  fee: string;
  sla: string;
  hoursLeft: number;
  x: number;
  y: number;
}

export default function SignalPlot({ signals, onSelect }: SignalPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = Math.max(300, entry.contentRect.width);
        const h = Math.max(280, Math.min(500, w * 0.6));
        setDimensions({ width: w, height: h });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plotWidth = dimensions.width - PADDING.left - PADDING.right;
  const plotHeight = dimensions.height - PADDING.top - PADDING.bottom;

  const toX = useCallback(
    (feeBps: number) => {
      const clamped = Math.max(FEE_MIN, Math.min(FEE_MAX, feeBps));
      return PADDING.left + (clamped / FEE_MAX) * plotWidth;
    },
    [plotWidth],
  );

  const toY = useCallback(
    (slaBps: number) => {
      const clamped = Math.max(SLA_MIN, Math.min(SLA_MAX, slaBps));
      return (
        PADDING.top +
        plotHeight -
        ((clamped - SLA_MIN) / (SLA_MAX - SLA_MIN)) * plotHeight
      );
    },
    [plotHeight],
  );

  const dots = useMemo(
    () =>
      signals.map((s) => {
        const fee = Number(s.maxPriceBps);
        const sla = Number(s.slaMultiplierBps);
        const expires = new Date(Number(s.expiresAt) * 1000);
        const hoursLeft = Math.max(
          0,
          (expires.getTime() - Date.now()) / 3_600_000,
        );
        return {
          signal: s,
          cx: toX(fee),
          cy: toY(sla),
          color: SPORT_COLORS[s.sport] || "#6b7280",
          fee,
          sla,
          hoursLeft,
        };
      }),
    [signals, toX, toY],
  );

  const handleDotEnter = (
    dot: (typeof dots)[0],
    event: React.MouseEvent | React.TouchEvent,
  ) => {
    setHoveredId(dot.signal.signalId);
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;

    let clientX: number, clientY: number;
    if ("touches" in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    setTooltip({
      sport: dot.signal.sport,
      genius: truncateAddress(dot.signal.genius),
      fee: `${(dot.fee / 100).toFixed(1)}%`,
      sla: formatBps(BigInt(dot.sla)),
      hoursLeft: dot.hoursLeft,
      x: clientX - svgRect.left,
      y: clientY - svgRect.top,
    });
  };

  const handleDotLeave = () => {
    setHoveredId(null);
    setTooltip(null);
  };

  const formatTimeLeft = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)}m left`;
    if (hours < 24) return `${Math.round(hours)}h left`;
    return `${Math.floor(hours / 24)}d left`;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="select-none"
        role="img"
        aria-label="Signal scatter plot showing fee vs SLA by sport"
      >
        {/* Grid lines */}
        {FEE_TICKS.map((tick) => (
          <line
            key={`gx-${tick}`}
            x1={toX(tick)}
            y1={PADDING.top}
            x2={toX(tick)}
            y2={PADDING.top + plotHeight}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}
        {SLA_TICKS.map((tick) => (
          <line
            key={`gy-${tick}`}
            x1={PADDING.left}
            y1={toY(tick)}
            x2={PADDING.left + plotWidth}
            y2={toY(tick)}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}

        {/* Axes */}
        <line
          x1={PADDING.left}
          y1={PADDING.top + plotHeight}
          x2={PADDING.left + plotWidth}
          y2={PADDING.top + plotHeight}
          stroke="#94a3b8"
          strokeWidth={1}
        />
        <line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + plotHeight}
          stroke="#94a3b8"
          strokeWidth={1}
        />

        {/* X axis labels */}
        {FEE_TICKS.map((tick) => (
          <text
            key={`lx-${tick}`}
            x={toX(tick)}
            y={PADDING.top + plotHeight + 20}
            textAnchor="middle"
            className="fill-slate-500 text-[11px]"
          >
            {tick / 100}%
          </text>
        ))}
        <text
          x={PADDING.left + plotWidth / 2}
          y={dimensions.height - 4}
          textAnchor="middle"
          className="fill-slate-400 text-[11px]"
        >
          Fee (% of notional)
        </text>

        {/* Y axis labels */}
        {SLA_TICKS.map((tick) => (
          <text
            key={`ly-${tick}`}
            x={PADDING.left - 8}
            y={toY(tick) + 4}
            textAnchor="end"
            className="fill-slate-500 text-[11px]"
          >
            {tick / 100}%
          </text>
        ))}
        <text
          x={12}
          y={PADDING.top + plotHeight / 2}
          textAnchor="middle"
          className="fill-slate-400 text-[11px]"
          transform={`rotate(-90, 12, ${PADDING.top + plotHeight / 2})`}
        >
          SLA (skin in game)
        </text>

        {/* Dots */}
        {dots.map((dot) => {
          const isHovered = hoveredId === dot.signal.signalId;
          return (
            <g key={dot.signal.signalId}>
              {/* Invisible larger hit area for mobile tap targets */}
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r={22}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onSelect(dot.signal.signalId)}
                onMouseEnter={(e) => handleDotEnter(dot, e)}
                onMouseLeave={handleDotLeave}
                onTouchStart={(e) => {
                  handleDotEnter(dot, e);
                }}
                onTouchEnd={() => {
                  handleDotLeave();
                  onSelect(dot.signal.signalId);
                }}
              />
              <circle
                cx={dot.cx}
                cy={dot.cy}
                r={isHovered ? DOT_HOVER_RADIUS : DOT_RADIUS}
                fill={dot.color}
                fillOpacity={isHovered ? 1 : 0.8}
                stroke={isHovered ? "#1e293b" : "white"}
                strokeWidth={isHovered ? 2 : 1.5}
                className="pointer-events-none transition-all duration-150"
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 rounded-lg bg-slate-900 text-white px-3 py-2 text-xs shadow-lg pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 16, dimensions.width - 160),
            top: tooltip.y - 80,
          }}
        >
          <p className="font-semibold">{tooltip.sport}</p>
          <p className="text-slate-300">by {tooltip.genius}</p>
          <div className="flex gap-3 mt-1">
            <span>Fee: {tooltip.fee}</span>
            <span>SLA: {tooltip.sla}</span>
          </div>
          <p className="text-slate-400 mt-0.5">
            {formatTimeLeft(tooltip.hoursLeft)}
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 px-1">
        {SPORT_COLOR_ENTRIES.map(([sport, color]) => (
          <div key={sport} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-slate-500">{sport}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
