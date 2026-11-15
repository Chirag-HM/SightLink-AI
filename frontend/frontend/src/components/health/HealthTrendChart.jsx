import { useState, useId } from 'react';
import { motion } from 'framer-motion';

export default function HealthTrendChart({ dataPoints = [], period = 'weekly', onPeriodChange }) {
  const [selectedMetric, setSelectedMetric] = useState('steps');
  const gradientId = useId();

  const metricsConfig = {
    steps: {
      label: 'Steps',
      unit: 'steps',
      color: '#065F46',
      accent: '#0D9488',
      getter: (d) => d.steps,
      formatter: (v) => (v !== null ? `${v.toLocaleString()} steps` : 'No data'),
    },
    heartRate: {
      label: 'Heart Rate',
      unit: 'bpm',
      color: '#DC2626',
      accent: '#F87171',
      getter: (d) => d.avg_heart_rate,
      formatter: (v) => (v !== null ? `${v} bpm` : 'No data'),
    },
    sleep: {
      label: 'Sleep Duration',
      unit: 'hrs',
      color: '#4F46E5',
      accent: '#818CF8',
      getter: (d) => (d.sleep_duration_minutes != null ? Math.round((d.sleep_duration_minutes / 60) * 10) / 10 : null),
      formatter: (v) => (v !== null ? `${v} hrs` : 'No data'),
    },
    calories: {
      label: 'Active Calories',
      unit: 'kcal',
      color: '#C59B42',
      accent: '#F59E0B',
      getter: (d) => d.active_calories,
      formatter: (v) => (v !== null ? `${v} kcal` : 'No data'),
    },
    distance: {
      label: 'Distance',
      unit: 'km',
      color: '#0284C7',
      accent: '#38BDF8',
      getter: (d) => (d.distance_meters != null ? Math.round((d.distance_meters / 1000) * 10) / 10 : null),
      formatter: (v) => (v !== null ? `${v} km` : 'No data'),
    },
  };

  const currentCfg = metricsConfig[selectedMetric] || metricsConfig.steps;
  const values = dataPoints.map((d) => currentCfg.getter(d));
  const numericValues = values.filter((v) => typeof v === 'number' && !isNaN(v));
  const maxVal = numericValues.length > 0 ? Math.max(...numericValues, 10) : 10;
  const minVal = 0;

  // Chart dimensions
  const width = 640;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = dataPoints.map((d, index) => {
    const val = currentCfg.getter(d);
    const x = padding.left + (dataPoints.length > 1 ? (index / (dataPoints.length - 1)) * chartW : chartW / 2);
    const y =
      val != null
        ? padding.top + chartH - ((val - minVal) / (maxVal - minVal || 1)) * chartH
        : null;
    return { x, y, val, date: d.date };
  });

  const validPoints = points.filter((p) => p.y !== null);

  // Generate SVG path for line and area
  let linePath = '';
  let areaPath = '';
  if (validPoints.length > 0) {
    linePath = `M ${validPoints[0].x} ${validPoints[0].y}`;
    for (let i = 1; i < validPoints.length; i++) {
      const prev = validPoints[i - 1];
      const cur = validPoints[i];
      const midX = (prev.x + cur.x) / 2;
      linePath += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`;
    }
    const first = validPoints[0];
    const last = validPoints[validPoints.length - 1];
    areaPath = `${linePath} L ${last.x} ${padding.top + chartH} L ${first.x} ${padding.top + chartH} Z`;
  }

  return (
    <div className="rounded-2xl border border-[#E5DEC9] bg-[#FAF7F0] p-6 shadow-sm">
      {/* Header with Metric Selector and Period Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DEC9]">
        <div>
          <h3 className="text-base font-display font-bold text-[#12231B]">Health Activity Trends</h3>
          <p className="text-xs text-[#718096]">Continuous historical tracking from Google Health Connect</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="inline-flex rounded-xl bg-[#EFE8DA]/80 p-1 border border-[#DCD2BF]">
            {['weekly', 'monthly'].map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange?.(p)}
                className={`px-3 py-1 text-xs font-mono font-medium rounded-lg capitalize transition-colors ${
                  period === p
                    ? 'bg-[#065F46] text-white shadow-sm'
                    : 'text-[#354B40] hover:text-[#12231B]'
                }`}
              >
                {p === 'weekly' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>

          {/* Metric Selector Pills */}
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="text-xs font-mono font-medium bg-[#EFE8DA]/80 border border-[#DCD2BF] rounded-xl px-3 py-1.5 text-[#12231B] focus:outline-none focus:ring-1 focus:ring-[#065F46]"
            aria-label="Select health metric for trend view"
          >
            <option value="steps">Steps</option>
            <option value="heartRate">Heart Rate</option>
            <option value="sleep">Sleep (Hours)</option>
            <option value="calories">Active Calories</option>
            <option value="distance">Distance (km)</option>
          </select>
        </div>
      </div>

      {/* SVG Responsive Chart */}
      <div className="mt-4 relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[500px]"
          aria-label={`Trend chart for ${currentCfg.label}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentCfg.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={currentCfg.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + chartH * ratio;
            const valLabel = Math.round(maxVal - ratio * (maxVal - minVal));
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartW}
                  y2={y}
                  stroke="#E5DEC9"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="monospace"
                  fill="#718096"
                >
                  {valLabel}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

          {/* Trend Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={currentCfg.color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {/* Data Points / Markers */}
          {points.map((p, idx) => {
            if (p.y === null) {
              return (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={padding.top + chartH}
                  r="2"
                  fill="#CBD5E0"
                  opacity="0.5"
                />
              );
            }
            return (
              <g key={idx}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#FAF7F0"
                  stroke={currentCfg.color}
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {/* X Axis Dates */}
          {dataPoints.map((d, index) => {
            // Show only a subset of date labels if monthly
            if (period === 'monthly' && index % 5 !== 0 && index !== dataPoints.length - 1) {
              return null;
            }
            const x =
              padding.left +
              (dataPoints.length > 1 ? (index / (dataPoints.length - 1)) * chartW : chartW / 2);
            const dateParts = d.date.split('-');
            const shortDate = `${dateParts[1]}/${dateParts[2]}`;

            return (
              <text
                key={d.date}
                x={x}
                y={padding.top + chartH + 18}
                textAnchor="middle"
                fontSize="10"
                fontFamily="monospace"
                fill="#4A5568"
              >
                {shortDate}
              </text>
            );
          })}
        </svg>

        {validPoints.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#FAF7F0]/70 backdrop-blur-xs">
            <span className="text-sm font-mono text-[#718096] bg-[#EFE8DA] px-4 py-2 rounded-xl border border-[#DCD2BF]">
              No {currentCfg.label} records found for this period
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

