import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  History,
  Video,
  Users,
  ShieldAlert,
  Bell,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  LogIn,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { useAuth } from '../context/AuthContext';
import {
  assistanceService,
  liveAssistService,
  familyService,
} from '../services/api';

const eventTypeStyles = {
  assistance: {
    bg: 'bg-[#ECF7F2] border-[#065F46]/25 text-[#065F46]',
    icon: Users,
    label: 'In-Person Help',
  },
  live_assist: {
    bg: 'bg-[#FBF3DF] border-[#C59B42]/35 text-[#7D5B1C]',
    icon: Video,
    label: 'Eyes on Demand',
  },
  family: {
    bg: 'bg-[#ECF7F2] border-[#065F46]/30 text-[#064E3B]',
    icon: ShieldAlert,
    label: 'Family Event',
  },
  alerts: {
    bg: 'bg-[#FBF3DF] border-[#C59B42]/40 text-[#7D5B1C]',
    icon: Bell,
    label: 'Alert Delivery',
  },
};

function parseTimestamp(iso) {
  if (!iso) return 0;
  const normalized = /(Z|[+-]\d{2}:\d{2})$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? 0 : t;
}

function formatClock(iso) {
  const ts = parseTimestamp(iso);
  if (!ts) return '--';
  const dt = new Date(ts);
  return `${dt.toLocaleDateString()} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all'); // 'all' | '24h' | '7d'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [counts, setCounts] = useState({
    assistance: 0,
    liveAssist: 0,
    familyEvents: 0,
    alertsSent: 0,
    alertsTotal: 0,
  });

  const loadHistory = useCallback(async () => {
    if (!user) {
      setEvents([]);
      setCounts({ assistance: 0, liveAssist: 0, familyEvents: 0, alertsSent: 0, alertsTotal: 0 });
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const [assistRows, liveRows, famTimeline, alertLogs] = await Promise.all([
        user.role === 'family' ? Promise.resolve([]) : assistanceService.getHistory().catch(() => []),
        user.role === 'family' ? Promise.resolve([]) : liveAssistService.getHistory().catch(() => []),
        user.role === 'blind_user' ? familyService.getMyTimeline().catch(() => []) : Promise.resolve([]),
        user.role === 'blind_user' || user.role === 'family'
          ? familyService.getDeliveryLogs().catch(() => [])
          : Promise.resolve([]),
      ]);

      const aList = Array.isArray(assistRows) ? assistRows : [];
      const lList = Array.isArray(liveRows) ? liveRows : [];
      const fList = Array.isArray(famTimeline) ? famTimeline : [];
      const dList = Array.isArray(alertLogs) ? alertLogs : [];

      setCounts({
        assistance: aList.length,
        liveAssist: lList.length,
        familyEvents: fList.length,
        alertsSent: dList.filter((l) => l.status === 'sent').length,
        alertsTotal: dList.length,
      });

      const normalized = [
        ...aList.map((r) => ({
          id: `assist-${r.id}`,
          type: 'assistance',
          timeLabel: formatClock(r.created_at),
          sortMs: parseTimestamp(r.created_at),
          title: `${(r.assistance_type || 'Assistance').replace(/_/g, ' ')} — ${r.status}`,
          source: r.accepted_volunteer?.full_name
            ? `Volunteer: ${r.accepted_volunteer.full_name}`
            : `Radius ${r.radius_km} km`,
          badge: r.status,
          detail: r,
        })),
        ...lList.map((s) => ({
          id: `live-${s.id}`,
          type: 'live_assist',
          timeLabel: formatClock(s.created_at),
          sortMs: parseTimestamp(s.created_at),
          title: `Live video call (${s.connection_mode || 'video'}) — ${s.outcome || s.status}`,
          source: s.accepted_volunteer?.full_name
            ? `Guided by ${s.accepted_volunteer.full_name}`
            : `${s.duration_sec}s session`,
          badge: s.status,
          detail: s,
        })),
        ...fList.map((ev) => ({
          id: `fam-${ev.id}`,
          type: 'family',
          timeLabel: formatClock(ev.updated_at || ev.created_at),
          sortMs: parseTimestamp(ev.updated_at || ev.created_at),
          title: ev.summary || ev.title,
          source: ev.place_name ? `Place: ${ev.place_name}` : ev.event_type,
          badge: ev.urgent ? 'URGENT' : ev.category,
          detail: ev,
        })),
        ...dList.map((log) => ({
          id: `log-${log.id}`,
          type: 'alerts',
          timeLabel: formatClock(log.created_at),
          sortMs: parseTimestamp(log.created_at),
          title: `${log.event_type} via ${String(log.channel || '').toUpperCase()} (${log.recipient_scope || 'family'})`,
          source: `${log.destination_masked || 'Configured destination'}${
            log.error_detail ? ` · ${log.error_detail}` : ''
          }`,
          badge: String(log.status || '').toUpperCase(),
          detail: log,
        })),
      ].sort((a, b) => b.sortMs - a.sortMs);

      setEvents(normalized);
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to load activity history.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const cutoff =
      dateRange === '24h'
        ? now - 24 * 60 * 60 * 1000
        : dateRange === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : 0;

    return events.filter((item) => {
      if (selectedFilter !== 'all' && item.type !== selectedFilter) return false;
      if (cutoff && item.sortMs < cutoff) return false;
      return true;
    });
  }, [events, selectedFilter, dateRange]);

  const handleExportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      user: user ? { username: user.username, role: user.role } : null,
      count: filteredHistory.length,
      events: filteredHistory,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sightlink-activity-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardShell
      title="Activity & Session History"
      subtitle="Live audit trail of assistance sessions, video calls, calm family updates, and SOS alert deliveries"
      icon={History}
    >
      {!user && (
        <div className="glass-card p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#C59B42]/40 bg-[#FBF3DF]/60">
          <div>
            <h2 className="font-display font-bold text-[#12231B] text-base">
              Sign In to View Your Real Session History
            </h2>
            <p className="text-xs text-[#4F6358] mt-1">
              Assistance requests, Eyes on Demand calls, and SOS delivery logs require an authenticated session.
            </p>
          </div>
          <Link
            to="/login?redirect=/history"
            className="px-5 py-2.5 rounded-full bg-[#065F46] text-white text-xs font-bold inline-flex items-center gap-2 shrink-0 hover:bg-[#054D39]"
          >
            <LogIn className="w-4 h-4" /> Sign In
          </Link>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Records', value: String(events.length), change: 'Synced from DB', color: '#065F46' },
          { label: 'Help Sessions', value: String(counts.assistance), change: 'In-person requests', color: '#8C6A23' },
          { label: 'Live Video Calls', value: String(counts.liveAssist), change: 'Eyes on Demand', color: '#047857' },
          {
            label: 'Alerts Sent',
            value: `${counts.alertsSent}/${counts.alertsTotal}`,
            change: 'Telegram / Email / Push',
            color: '#8C6A23',
          },
        ].map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="glass-card p-4"
          >
            <span className="text-[11px] font-mono text-[#4F6358] block mb-1">{metric.label}</span>
            <div className="text-xl md:text-2xl font-display font-bold text-[#12231B] mb-0.5">{metric.value}</div>
            <span className="text-[10px] font-mono font-semibold" style={{ color: metric.color }}>{metric.change}</span>
          </motion.div>
        ))}
      </div>

      {/* Filter and Action Header */}
      <div className="glass-card p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-[#4F6358] flex items-center gap-1.5 mr-1 font-mono">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {[
            { id: 'all', label: 'All Events' },
            { id: 'assistance', label: 'Help Requests' },
            { id: 'live_assist', label: 'Live Video' },
            { id: 'family', label: 'Family Timeline' },
            { id: 'alerts', label: 'Alert Logs' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                selectedFilter === f.id
                  ? 'bg-[#065F46] text-white border border-[#065F46] shadow-glow-sm'
                  : 'bg-[#F6F1E6] text-[#354B40] hover:text-[#12231B] border border-[#E2D9C8]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F6F1E6] border border-[#E2D9C8] text-xs font-mono text-[#354B40]">
            <Calendar className="w-3.5 h-3.5 text-[#065F46]" />
            <select
              aria-label="Filter time range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>
          </div>

          <button
            type="button"
            onClick={loadHistory}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#F6F1E6] border border-[#D7CEBC] text-xs text-[#12231B] transition-all font-mono disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#065F46] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            disabled={filteredHistory.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#F6F1E6] border border-[#D7CEBC] text-xs text-[#12231B] transition-all font-mono disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[#065F46]" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E2D9C8]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#065F46]" />
            <h3 className="font-display font-semibold text-[#12231B] text-base">Recorded Activity Stream</h3>
          </div>
          <span className="text-xs font-mono text-[#4F6358]">
            {filteredHistory.length} {filteredHistory.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="text-center py-12 text-[#4F6358] space-y-2">
            <History className="w-8 h-8 mx-auto text-[#8C6A23]/60" />
            <p className="text-sm font-medium text-[#12231B]">
              {loading ? 'Loading recorded events…' : 'No matching records found yet.'}
            </p>
            <p className="text-xs">
              Events appear here automatically after you trigger SOS, request volunteer assistance, or start Eyes on Demand.
            </p>
          </div>
        ) : (
          <div className="relative pl-6 md:pl-8 space-y-5 before:absolute before:left-3 md:before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-[#065F46]/40 before:via-[#C59B42]/35 before:to-transparent">
            {filteredHistory.map((item, index) => {
              const style = eventTypeStyles[item.type] || eventTypeStyles.assistance;
              const Icon = style.icon;
              const isOpen = expandedId === item.id;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  className="relative group"
                >
                  <div
                    className={`absolute -left-6 md:-left-8 top-1.5 w-6 h-6 md:w-7 md:h-7 rounded-full border flex items-center justify-center transform -translate-x-1/2 bg-white shadow-sm ${style.bg}`}
                  >
                    <Icon className="w-3 md:w-3.5 h-3 md:h-3.5" />
                  </div>

                  <div className="p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] group-hover:border-[#065F46]/30 group-hover:bg-[#FAF7F0] transition-all space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-[#12231B] px-2 py-0.5 rounded bg-white border border-[#E2D9C8]">
                            {item.timeLabel}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${style.bg}`}>
                            {style.label}
                          </span>
                          {item.badge && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-[#DCD2BF] text-[#354B40]">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#12231B] font-medium pt-1">{item.title}</p>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <span className="text-[11px] font-mono text-[#4F6358] max-w-[240px] truncate">
                          {item.source}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : item.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Hide event details' : 'Show event details'}
                          className="p-1.5 rounded-lg bg-white border border-[#E2D9C8] text-[#4F6358] hover:text-[#065F46] transition-colors"
                          title="Event details"
                        >
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <pre className="p-3 rounded-lg bg-white border border-[#E2D9C8] text-[11px] font-mono text-[#354B40] overflow-x-auto">
                        {JSON.stringify(item.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
