'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CargoDocket } from '@/types/cargo';

const IST_TZ = 'Asia/Kolkata';

/** Today's date as YYYY-MM-DD in IST, matching how booking dates are stored. */
function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST_TZ });
}

/** Adds `days` (may be negative) to a YYYY-MM-DD string, UTC-safe. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday = 0 ... Sunday = 6, for a YYYY-MM-DD string. */
function weekdayIndexMon0(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

interface ChartsProps {
  dockets: CargoDocket[];
}

/**
 * Shown instead of a chart when there is no data to plot. Previously these
 * charts fell back to hardcoded sample figures, which made an empty database
 * look like a busy month.
 */
function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="h-[180px] flex flex-col items-center justify-center gap-1 text-center">
      <p className="text-xs font-medium text-slate-500">{message}</p>
      <p className="text-[11px] text-slate-400">Create an LR to start seeing figures here.</p>
    </div>
  );
}

export function RevenueLineChart({ dockets }: ChartsProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Generate last 6 months
  const monthlyData: { month: string; yearMonth: string; revenue: number }[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthShort = d.toLocaleString('en-US', { month: 'short' });
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyData.push({ month: monthShort, yearMonth, revenue: 0 });
  }

  // Aggregate active dockets into monthly revenue
  const activeDockets = dockets.filter((doc) => doc.status === 'issued');

  let hasRealMonthlyData = false;
  activeDockets.forEach((doc) => {
    const dateStr = doc.booking_date || doc.created_at;
    if (dateStr) {
      const docYM = dateStr.slice(0, 7);
      const match = monthlyData.find((m) => m.yearMonth === docYM);
      if (match) {
        match.revenue += Number(doc.grand_total || 0);
        hasRealMonthlyData = true;
      }
    }
  });

  // No invented trend line. If there is nothing in the last six months, say so.
  if (!hasRealMonthlyData) {
    return <ChartEmptyState message="No revenue recorded in the last 6 months." />;
  }

  // Smart Y-Axis Scaling: Scales tightly with highest monthly revenue value
  const revenues = monthlyData.map((m) => m.revenue);
  const maxRevenue = Math.max(...revenues, 1000);
  const targetMax = maxRevenue * 1.25;

  let step = 1000;
  if (targetMax >= 1000000) step = 200000;
  else if (targetMax >= 200000) step = 50000;
  else if (targetMax >= 50000) step = 10000;
  else if (targetMax >= 10000) step = 2500;
  else step = 1000;

  const maxScale = Math.ceil(targetMax / step) * step || 10000;

  const yTicks = [
    maxScale,
    maxScale * 0.75,
    maxScale * 0.5,
    maxScale * 0.25,
    0,
  ];

  const formatLakh = (val: number) => {
    if (val === 0) return '₹0';
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
    return `₹${val}`;
  };

  // SVG Canvas Dimensions for 2/3 width container
  const W = 600;
  const H = 200;
  const pxLeft = 55;
  const pxRight = 25;
  const pyTop = 25;
  const pyBottom = 35;

  const points = monthlyData.map((m, i) => {
    const x = pxLeft + i * ((W - pxLeft - pxRight) / (monthlyData.length - 1));
    const y = H - pyBottom - (m.revenue / maxScale) * (H - pyTop - pyBottom);
    return { x, y, month: m.month, revenue: m.revenue };
  });

  // Smooth Bezier Curve Path
  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = points[i - 1];
    const cx1 = prev.x + (pt.x - prev.x) / 2;
    const cy1 = prev.y;
    const cx2 = prev.x + (pt.x - prev.x) / 2;
    const cy2 = pt.y;
    return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${H - pyBottom} L ${points[0].x} ${H - pyBottom} Z`;

  const activePt = hoveredIdx !== null ? points[hoveredIdx] : null;
  const isRightEdge = activePt ? activePt.x > W * 0.65 : false;

  return (
    <div
      className="relative w-full select-none"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48 overflow-visible">
        <defs>
          <linearGradient id="revenueGradMockup" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Dynamic Y-Axis Labels & Dashed Grid Lines */}
        {yTicks.map((val, i) => {
          const ratio = val / maxScale;
          const y = H - pyBottom - ratio * (H - pyTop - pyBottom);
          return (
            <g key={i}>
              <text
                x={pxLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="text-xs fill-slate-500 font-mono font-medium"
              >
                {formatLakh(val)}
              </text>
              <line
                x1={pxLeft}
                y1={y}
                x2={W - pxRight}
                y2={y}
                stroke="#F1F5F9"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
            </g>
          );
        })}

        {/* Soft Area Gradient Fill */}
        <motion.path
          d={areaD}
          fill="url(#revenueGradMockup)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5, ease: 'easeOut' }}
        />

        {/* Smooth Curved Blue Line */}
        <motion.path
          d={pathD}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />

        {/* Static Vertical Guideline Line */}
        {activePt && (
          <line
            x1={activePt.x}
            y1={pyTop}
            x2={activePt.x}
            y2={H - pyBottom}
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />
        )}

        {/* Static Circle Dot on Hover */}
        {activePt && (
          <circle
            cx={activePt.x}
            cy={activePt.y}
            r="5.5"
            fill="#2563EB"
            stroke="#FFFFFF"
            strokeWidth="2.5"
          />
        )}

        {/* Interactive Hover Columns */}
        {points.map((pt, i) => (
          <rect
            key={i}
            x={pt.x - (W - pxLeft - pxRight) / (monthlyData.length - 1) / 2}
            y={pyTop}
            width={(W - pxLeft - pxRight) / (monthlyData.length - 1)}
            height={H - pyTop - pyBottom}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {/* X-Axis Month Labels */}
        {points.map((pt, i) => (
          <text
            key={i}
            x={pt.x}
            y={H - 10}
            textAnchor="middle"
            className={`text-xs font-semibold font-sans transition-colors ${
              hoveredIdx === i ? 'fill-slate-900 font-bold' : 'fill-slate-500'
            }`}
          >
            {pt.month}
          </text>
        ))}
      </svg>

      {/* Framer Motion Floating Tooltip Card */}
      <AnimatePresence>
        {activePt && (
          <motion.div
            key="tooltip-card"
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute z-30 bg-white border border-slate-200/90 shadow-lg rounded-xl p-2 px-2.5 text-left font-sans pointer-events-none"
            style={{
              left: `${(activePt.x / W) * 100}%`,
              top: `${(activePt.y / H) * 100}%`,
              transform: isRightEdge ? 'translate(-105%, -100%)' : 'translate(10px, -100%)',
              minWidth: '100px',
            }}
          >
            <div className="text-xs font-bold text-slate-900 mb-0.5">{activePt.month}</div>
            <div className="text-xs font-semibold text-[#2563EB] font-mono">
              Revenue : {formatLakh(activePt.revenue)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ShipmentsBarChart({ dockets }: ChartsProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  // 0 = current week (Mon-Sun, IST), 1 = last week, 2 = two weeks ago, etc.
  const [weekOffset, setWeekOffset] = useState(0);

  // Tracks the chart's actual rendered width so the SVG viewBox can match it
  // 1:1 — keeps text/bars a constant physical size instead of the viewBox
  // being letterboxed (admin's 1/3-col layout) or stretched (staff's full-width one).
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const currentWeekMonday = addDays(todayIST(), -weekdayIndexMon0(todayIST()));
  const weekStart = addDays(currentWeekMonday, -7 * weekOffset);
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel = `${formatDateLabel(weekStart)} – ${formatDateLabel(weekEnd)}, ${weekEnd.slice(0, 4)}`;

  // Only dockets booked within the selected Mon-Sun window.
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  let hasRealCounts = false;
  dockets.forEach((doc) => {
    const dateStr = (doc.booking_date || doc.created_at || '').slice(0, 10);
    if (!dateStr || dateStr < weekStart || dateStr > weekEnd) return;
    dayCounts[weekdayIndexMon0(dateStr)] += 1;
    hasRealCounts = true;
  });

  const finalCounts = dayCounts;
  const maxCount = Math.max(...finalCounts, 10);
  const targetMax = Math.ceil((maxCount * 1.15) / 10) * 10 || 80;

  const yTicks = [
    targetMax,
    targetMax * 0.75,
    targetMax * 0.5,
    targetMax * 0.25,
    0,
  ];

  // SVG canvas width matches the actual rendered container (see containerWidth
  // above) so text/bars stay a constant physical size at any column width.
  const W = containerWidth;
  const H = 180;
  const pxLeft = 32;
  const pxRight = 12;
  const pyTop = 20;
  const pyBottom = 28;

  const barWidth = 14;
  const colWidth = (W - pxLeft - pxRight) / daysOfWeek.length;

  const bars = daysOfWeek.map((day, i) => {
    const count = finalCounts[i];
    const x = pxLeft + i * colWidth + colWidth / 2;
    const barHeight = (count / targetMax) * (H - pyTop - pyBottom);
    const y = H - pyBottom - barHeight;
    return { x, y, barHeight, day, count };
  });

  const activeBar = hoveredIdx !== null ? bars[hoveredIdx] : null;
  const isSaturdayOrSunday = activeBar ? (activeBar.day === 'Sat' || activeBar.day === 'Sun') : false;

  const weekNav = (
    <div className="flex items-center justify-between mb-2">
      <button
        onClick={() => setWeekOffset((o) => o + 1)}
        aria-label="Previous week"
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span className="text-[11px] font-semibold text-slate-500 font-mono">
        {rangeLabel}
        {weekOffset === 0 && <span className="text-[#2563EB]"> · This Week</span>}
      </span>
      <button
        onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
        disabled={weekOffset === 0}
        aria-label="Next week"
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  if (!hasRealCounts) {
    return (
      <div className="w-full" ref={containerRef}>
        {weekNav}
        <div className="h-[150px] flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-xs font-medium text-slate-500">No shipments booked this week.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full select-none">
      {weekNav}
      <div className="relative" ref={containerRef} onMouseLeave={() => setHoveredIdx(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48 overflow-visible">
        {/* Dynamic Y-Axis Labels & Dashed Horizontal Grid Lines */}
        {yTicks.map((val, i) => {
          const ratio = val / targetMax;
          const y = H - pyBottom - ratio * (H - pyTop - pyBottom);
          return (
            <g key={i}>
              <text
                x={pxLeft - 6}
                y={y + 4}
                textAnchor="end"
                className="text-[12px] fill-slate-500 font-mono font-medium"
              >
                {Math.round(val)}
              </text>
              <line
                x1={pxLeft}
                y1={y}
                x2={W - pxRight}
                y2={y}
                stroke="#F1F5F9"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
            </g>
          );
        })}

        {/* Light Gray Column Highlight Background on Hover */}
        {activeBar && (
          <rect
            x={activeBar.x - colWidth * 0.42}
            y={pyTop}
            width={colWidth * 0.84}
            height={H - pyTop - pyBottom}
            fill="#CBD5E1"
            opacity="0.4"
            rx="4"
            ry="4"
          />
        )}

        {/* Framer Motion Animated Pillar Bars */}
        {bars.map((bar, i) => {
          const isHovered = hoveredIdx === i;
          const displayHeight = isHovered ? bar.barHeight * 1.04 : bar.barHeight;
          const displayY = isHovered ? bar.y - (bar.barHeight * 0.04) : bar.y;

          return (
            <g key={bar.day}>
              <motion.rect
                x={bar.x - barWidth / 2}
                width={barWidth}
                rx="4"
                ry="4"
                initial={{ height: 0, y: H - pyBottom }}
                animate={{
                  height: displayHeight,
                  y: displayY,
                  fill: isHovered ? '#1D4ED8' : '#2563EB',
                }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              />
            </g>
          );
        })}

        {/* Interactive Full-Column Hover Targets */}
        {bars.map((bar, i) => (
          <rect
            key={`hover-col-${i}`}
            x={pxLeft + i * colWidth}
            y={pyTop}
            width={colWidth}
            height={H - pyTop - pyBottom}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {/* X-Axis Day Labels */}
        {bars.map((bar, i) => (
          <text
            key={bar.day}
            x={bar.x}
            y={H - 6}
            textAnchor="middle"
            className={`text-[12px] font-semibold font-sans transition-colors ${
              hoveredIdx === i ? 'fill-slate-900 font-bold' : 'fill-slate-500'
            }`}
          >
            {bar.day}
          </text>
        ))}
      </svg>

      {/* Compact Framer Motion Floating Tooltip Card */}
      <AnimatePresence>
        {activeBar && (
          <motion.div
            key="bar-tooltip-compact"
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute z-30 bg-white border border-slate-200/90 shadow-lg rounded-xl p-2 px-2.5 text-left font-sans pointer-events-none"
            style={{
              left: `${(activeBar.x / W) * 100}%`,
              top: `${(activeBar.y / H) * 100}%`,
              transform: isSaturdayOrSunday ? 'translate(-105%, -40%)' : 'translate(12px, -40%)',
              minWidth: '100px',
            }}
          >
            <div className="text-xs font-bold text-slate-900 mb-0.5">{activeBar.day}</div>
            <div className="text-xs font-semibold text-[#2563EB] font-mono">
              count : {activeBar.count}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
