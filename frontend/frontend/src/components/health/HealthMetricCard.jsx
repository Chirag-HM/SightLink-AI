import { motion } from 'framer-motion';

export default function HealthMetricCard({
  icon: Icon,
  title,
  value,
  unit,
  secondary,
  status = 'neutral', // 'good' | 'warning' | 'neutral'
  badge,
  trend,
  className = '',
}) {
  const isAvailable = value !== null && value !== undefined;

  const statusColors = {
    good: 'border-[#065F46]/30 bg-[#065F46]/5 text-[#065F46]',
    warning: 'border-[#C59B42]/40 bg-[#FAF3E0] text-[#7D5B1C]',
    alert: 'border-red-200 bg-red-50 text-red-700',
    neutral: 'border-[#DCD2BF] bg-[#FAF7F0] text-[#354B40]',
  };

  const currentStatusClass = statusColors[status] || statusColors.neutral;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className={`rounded-2xl border p-5 shadow-sm transition-all duration-200 bg-[#FAF7F0] border-[#E5DEC9] hover:border-[#065F46]/40 hover:shadow-md ${className}`}
      role="region"
      aria-label={`${title} metric`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#065F46]/10 border border-[#065F46]/20 flex items-center justify-center text-[#065F46]">
            {Icon && <Icon className="w-5 h-5" aria-hidden="true" />}
          </div>
          <div>
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#354B40]">
              {title}
            </h3>
            {badge && (
              <span className="text-[10px] font-mono text-[#7D5B1C] bg-[#FBF3DF] px-1.5 py-0.5 rounded border border-[#C59B42]/30">
                {badge}
              </span>
            )}
          </div>
        </div>

        {isAvailable ? (
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${currentStatusClass}`}>
            Live Sync
          </span>
        ) : (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-gray-300 bg-gray-100/70 text-gray-500">
            No Data
          </span>
        )}
      </div>

      <div className="mt-2">
        {isAvailable ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-display font-bold text-[#12231B] tracking-tight">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {unit && <span className="text-xs font-medium text-[#718096]">{unit}</span>}
          </div>
        ) : (
          <div className="py-1">
            <span className="text-sm font-medium text-[#718096] italic">
              No data recorded today
            </span>
            <p className="text-[11px] text-[#A0AEC0] mt-0.5">
              Wearable or phone sensor not yet connected
            </p>
          </div>
        )}

        {secondary && (
          <div className="mt-2 text-xs text-[#4A5568] flex items-center justify-between border-t border-[#E5DEC9]/60 pt-2">
            <span>{secondary}</span>
            {trend && <span className="font-mono font-semibold text-[11px]">{trend}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

