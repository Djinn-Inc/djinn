"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { SignalEvent } from "@/lib/events";
import type { GeniusLeaderboardEntry } from "@/lib/types";
import { truncateAddress, formatBps } from "@/lib/types";

const SPORT_COLORS: Record<string, string> = {
  NBA: "#f97316",
  NFL: "#22c55e",
  MLB: "#ef4444",
  NHL: "#3b82f6",
  Soccer: "#a855f7",
};

const SPORT_COLOR_ENTRIES = Object.entries(SPORT_COLORS);

const PADDING = { top: 28, right: 24, bottom: 52, left: 60 };

// Genius Confidence axis: 0 to 6
// Confidence = winRate * log2(N + 1)
// - 60% WR with 30 signals = 0.6 * 4.95 = 2.97
// - 55% WR with 100 signals = 0.55 * 6.66 = 3.66
// - New genius with 0 signals = 0
const CONF_MIN = 0;
const CONF_MAX = 6;
const CONF_TICKS = [0, 1, 2, 3, 4, 5, 6];

// SLA axis: 10000 to 30000 bps (100% to 300%)
const SLA_MIN = 10000;
const SLA_MAX = 30000;
const SLA_TICKS = [10000, 15000, 20000, 25000, 30000];

// Dot sizing: radius 8 to 18 based on inverse fee
const MIN_DOT_R = 8;
const MAX_DOT_R = 18;
const HOVER_EXTRA = 4;

export interface GeniusStats {
  qualityScore: number;
  totalSignals: number;
  roi: number;
  proofCount: number;
  favCount: number;
  unfavCount: number;
}

interface SignalPlotProps {
  signals: SignalEvent[];
  onSelect: (signalId: string) => void;
  geniusScoreMap?: Map<string, GeniusStats>;
}

interface TooltipData {
  sport: string;
  genius: string;
  fee: string;
  sla: string;
  hoursLeft: number;
  confidence: number;
  winRate: string;
  n: number;
  roi: string;
  x: number;
  y: number;
}

function computeConfidence(stats: GeniusStats | undefined): number {
  if (!stats) return 0;
  const n = stats.favCount + stats.unfavCount;
  if (n === 0) return 0;
  const winRate = stats.favCount / n;
  return winRate * Math.log2(n + 1);
}

function feeToRadius(feeBps: number): number {
  // Cheaper signals get bigger dots (more attractive)
  // Fee range: 50 bps (0.5%) to 500 bps (5%)
  const normalized = 1 - Math.min(1, Math.max(0, (feeBps - 50) / 450));
  return MIN_DOT_R + normalized * (MAX_DOT_R - MIN_DOT_R);
}

export default function SignalPlot({
  signals,
  onSelect,
  geniusScoreMap,
}: SignalPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 420 });

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const w = Math.max(320, entry.contentRect.width);
        const h = Math.max(300, Math.min(520, w * 0.65));
        setDimensions({ width: w, height: h });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plotWidth = dimensions.width - PADDING.left - PADDING.right;
  const plotHeight = dimensions.height - PADDING.top - PADDING.bottom;

  const toX = useCallback(
    (confidence: number) => {
      const clamped = Math.max(CONF_MIN, Math.min(CONF_MAX, confidence));
      return PADDING.left + (clamped / CONF_MAX) * plotWidth;
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
        const stats = geniusScoreMap?.get(s.genius.toLowerCase());
        const confidence = computeConfidence(stats);
        const n = stats ? stats.favCount + stats.unfavCount : 0;
        const winRate =
          n > 0 && stats ? ((stats.favCount / n) * 100).toFixed(0) : "—";
        const roi = stats ? `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%` : "—";
        const r = feeToRadius(fee);
        return {
          signal: s,
          cx: toX(confidence),
          cy: toY(sla),
          r,
          color: SPORT_COLORS[s.sport] || "#6b7280",
          fee,
          sla,
          hoursLeft,
          confidence,
          winRate,
          n,
          roi,
        };
      }),
    [signals, toX, toY, geniusScoreMap],
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
      confidence: dot.confidence,
      winRate: dot.winRate,
      n: dot.n,
      roi: dot.roi,
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
      {/* Quadrant hint: top-right is the sweet spot */}
      <div className="absolute top-0 right-0 text-[10px] text-slate-300 pr-2 pt-1 pointer-events-none select-none hidden sm:block">
        best &uarr;&rarr;
      </div>

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="select-none"
        role="img"
        aria-label="Signal scatter plot: genius confidence vs SLA, colored by sport, sized by fee"
      >
        {/* Background quadrant shading — top-right is "ideal" */}
        <rect
          x={toX(CONF_MAX / 2)}
          y={PADDING.top}
          width={plotWidth / 2}
          height={plotHeight / 2}
          fill="#f0fdf4"
          opacity={0.4}
        />

        {/* Grid lines */}
        {CONF_TICKS.map((tick) => (
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
        {CONF_TICKS.map((tick) => (
          <text
            key={`lx-${tick}`}
            x={toX(tick)}
            y={PADDING.top + plotHeight + 20}
            textAnchor="middle"
            className="fill-slate-500 text-[11px]"
          >
            {tick}
          </text>
        ))}
        <text
          x={PADDING.left + plotWidth / 2}
          y={dimensions.height - 4}
          textAnchor="middle"
          className="fill-slate-400 text-[11px]"
        >
          Genius Confidence (win rate x track record depth)
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
          x={14}
          y={PADDING.top + plotHeight / 2}
          textAnchor="middle"
          className="fill-slate-400 text-[11px]"
          transform={`rotate(-90, 14, ${PADDING.top + plotHeight / 2})`}
        >
          SLA (skin in game)
        </text>

        {/* Dots — sorted so smaller dots render on top for clickability */}
        {[...dots]
          .sort((a, b) => b.r - a.r)
          .map((dot) => {
            const isHovered = hoveredId === dot.signal.signalId;
            const r = isHovered ? dot.r + HOVER_EXTRA : dot.r;
            // Urgency opacity: expires <2h = full, >24h = slightly faded
            const urgencyOpacity = Math.max(
              0.55,
              Math.min(1, 1 - (dot.hoursLeft - 2) / 48),
            );
            return (
              <g key={dot.signal.signalId}>
                <circle
                  cx={dot.cx}
                  cy={dot.cy}
                  r={r + 8}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => onSelect(dot.signal.signalId)}
                  onMouseEnter={(e) => handleDotEnter(dot, e)}
                  onMouseLeave={handleDotLeave}
                  onTouchStart={(e) => handleDotEnter(dot, e)}
                  onTouchEnd={() => {
                    handleDotLeave();
                    onSelect(dot.signal.signalId);
                  }}
                />
                <circle
                  cx={dot.cx}
                  cy={dot.cy}
                  r={r}
                  fill={dot.color}
                  fillOpacity={isHovered ? 1 : urgencyOpacity}
                  stroke={isHovered ? "#1e293b" : "white"}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="pointer-events-none transition-all duration-150"
                />
                {/* Fee label inside dot if large enough */}
                {dot.r >= 12 && (
                  <text
                    x={dot.cx}
                    y={dot.cy + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none fill-white font-semibold"
                    fontSize={dot.r >= 15 ? 10 : 8}
                  >
                    {(dot.fee / 100).toFixed(0)}%
                  </text>
                )}
              </g>
            );
          })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 rounded-lg bg-slate-900 text-white px-3 py-2 text-xs shadow-lg pointer-events-none min-w-[180px]"
          style={{
            left: Math.min(tooltip.x + 16, dimensions.width - 200),
            top: Math.max(0, tooltip.y - 100),
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{tooltip.sport}</span>
            <span className="text-slate-400">{formatTimeLeft(tooltip.hoursLeft)}</span>
          </div>
          <p className="text-slate-300 mb-1.5">by {tooltip.genius}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
            <span className="text-slate-400">Fee</span>
            <span>{tooltip.fee}</span>
            <span className="text-slate-400">SLA</span>
            <span>{tooltip.sla}</span>
            <span className="text-slate-400">Win Rate</span>
            <span>{tooltip.winRate}{tooltip.n > 0 ? `% (${tooltip.n})` : ""}</span>
            <span className="text-slate-400">ROI</span>
            <span>{tooltip.roi}</span>
            <span className="text-slate-400">Confidence</span>
            <span>{tooltip.confidence.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 px-1">
        <div className="flex flex-wrap gap-3">
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
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#94a3b8" /></svg>
          <span>expensive</span>
          <svg width="22" height="22"><circle cx="11" cy="11" r="9" fill="#94a3b8" /></svg>
          <span>cheap</span>
        </div>
      </div>
    </div>
  );
}
