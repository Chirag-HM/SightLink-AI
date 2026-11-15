import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Heart,
  Moon,
  Flame,
  Footprints,
  Wind,
  Navigation,
  RefreshCw,
  Smartphone,
  Plus,
  Trash2,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import HealthMetricCard from '../components/health/HealthMetricCard';
import HealthTrendChart from '../components/health/HealthTrendChart';
import DevicePairingModal from '../components/health/DevicePairingModal';
import { healthService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function HealthMonitoringPage() {
  const { user } = useAuth();

  const [currentDate, setCurrentDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [summaryData, setSummaryData] = useState(null);
  const [trendsData, setTrendsData] = useState(null);
  const [trendPeriod, setTrendPeriod] = useState('weekly');
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async (dateToFetch = currentDate, periodToFetch = trendPeriod) => {
    setLoading(true);
    try {
      const [sumRes, trendRes, devRes] = await Promise.allSettled([
        healthService.getSummary(dateToFetch),
        healthService.getTrends(periodToFetch),
        healthService.getDevices(),
      ]);

      if (sumRes.status === 'fulfilled' && sumRes.value) {
        setSummaryData(sumRes.value);
      }
      if (trendRes.status === 'fulfilled' && trendRes.value) {
        setTrendsData(trendRes.value);
      }
      if (devRes.status === 'fulfilled' && Array.isArray(devRes.value)) {
        setDevices(devRes.value);
      }
    } catch (err) {
      console.error('Failed to load health monitoring data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentDate, trendPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(currentDate, trendPeriod);
  };

  const handlePeriodChange = (newPeriod) => {
    setTrendPeriod(newPeriod);
    healthService.getTrends(newPeriod).then((res) => {
      if (res) setTrendsData(res);
    });
  };

  const changeDateBy = (days) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + days);
    const newDateStr = d.toISOString().split('T')[0];
    setCurrentDate(newDateStr);
    healthService.getSummary(newDateStr).then((res) => {
      if (res) setSummaryData(res);
    });
  };

  const handleUnlinkDevice = async (deviceId) => {
    if (!window.confirm('Disconnect this device? Background health sync will stop for this phone.')) {
      return;
    }
    try {
      await healthService.unlinkDevice(deviceId);
      showToast('Device disconnected successfully.');
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to disconnect device');
    }
  };

  const handlePurgeRecords = async () => {
    try {
      const res = await healthService.purgeHealthRecords();
      setDeleteConfirmOpen(false);
      showToast(res.message || 'Health records deleted.');
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete records');
    }
  };

  const metrics = summaryData?.metrics || {};
  const activeDevice = devices.length > 0 ? devices[0] : null;

  // Format Sleep stage display if available
  let sleepSecondary = null;
  if (metrics.sleep_stages) {
    const deep = metrics.sleep_stages.deep || 0;
    const rem = metrics.sleep_stages.rem || 0;
    const light = metrics.sleep_stages.light || 0;
    sleepSecondary = `Deep: ${deep}m · REM: ${rem}m · Light: ${light}m`;
  } else if (metrics.sleep_duration_minutes) {
    const hrs = Math.floor(metrics.sleep_duration_minutes / 60);
    const mins = metrics.sleep_duration_minutes % 60;
    sleepSecondary = `${hrs} hours ${mins} mins total sleep`;
  }

  // Blood Pressure Secondary
  let bpDisplay = null;
  let bpSecondary = null;
  if (metrics.systolic_avg != null && metrics.diastolic_avg != null) {
    bpDisplay = `${Math.round(metrics.systolic_avg)} / ${Math.round(metrics.diastolic_avg)}`;
    bpSecondary = 'Normal range: 90-120 / 60-80 mmHg';
  }

  return (
    <div className="min-h-screen bg-[#FAF7F0] text-[#12231B]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        {/* Toast Notification */}
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 rounded-xl bg-[#065F46] text-white px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-medium"
          >
            <CheckCircle2 className="w-5 h-5 text-[#FAF7F0]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E5DEC9]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#065F46] animate-pulse" />
              <span className="text-xs font-mono font-semibold tracking-wider text-[#065F46] uppercase">
                Google Health Connect Integration
              </span>
            </div>
            <h1 className="text-3xl font-display font-bold text-[#12231B] tracking-tight">
              Health Monitoring
            </h1>
            <p className="text-sm text-[#4A5568] mt-1 max-w-2xl">
              Automatic synchronization of biometric telemetry, vitals, mobility, and rest from your
              Android phone and compatible smartwatches.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-medium rounded-xl border border-[#DCD2BF] bg-[#FAF7F0] text-[#354B40] hover:bg-[#EFE8DA] transition-colors focus-visible-ring"
              title="Refresh health records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setIsPairModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-[#065F46] text-white hover:bg-[#064E3B] transition-colors shadow-sm focus-visible-ring"
            >
              <Smartphone className="w-4 h-4" />
              <span>{activeDevice ? 'Pair New Device' : 'Connect Android Phone'}</span>
            </button>
          </div>
        </div>

        {/* Status Banner / Device Connectivity */}
        <div className="mt-6 rounded-2xl bg-[#EFE8DA]/50 border border-[#DCD2BF] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeDevice ? 'bg-[#065F46]/10 text-[#065F46]' : 'bg-amber-100 text-amber-800'}`}>
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#12231B]">
                  {activeDevice ? activeDevice.device_name : 'No Android Device Connected'}
                </span>
                {activeDevice && (
                  <span className="text-[10px] font-mono bg-[#065F46]/10 text-[#065F46] px-2 py-0.5 rounded-full border border-[#065F46]/20">
                    Active Bridge
                  </span>
                )}
              </div>
              <p className="text-xs text-[#718096]">
                {activeDevice?.last_synced_at
                  ? `Last synchronized: ${new Date(activeDevice.last_synced_at).toLocaleString()}`
                  : 'Pair your device using the 6-digit code in the companion app to enable sync'}
              </p>
            </div>
          </div>

          {/* Date Picker Bar */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-[#FAF7F0] border border-[#DCD2BF] rounded-xl px-2 py-1 shadow-xs">
            <button
              onClick={() => changeDateBy(-1)}
              className="p-1 rounded-lg text-[#718096] hover:text-[#12231B] hover:bg-[#EFE8DA]"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <Calendar className="w-3.5 h-3.5 text-[#065F46]" />
              <span className="font-mono text-xs font-semibold text-[#12231B]">
                {currentDate === new Date().toISOString().split('T')[0] ? 'Today' : currentDate}
              </span>
            </div>
            <button
              onClick={() => changeDateBy(1)}
              disabled={currentDate >= new Date().toISOString().split('T')[0]}
              className="p-1 rounded-lg text-[#718096] hover:text-[#12231B] hover:bg-[#EFE8DA] disabled:opacity-30"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 9 Core Metric Cards Grid */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. Daily Steps */}
          <HealthMetricCard
            icon={Footprints}
            title="Daily Steps"
            value={metrics.steps}
            unit="steps"
            status={metrics.steps >= 6000 ? 'good' : 'neutral'}
            secondary={
              metrics.steps != null
                ? `${Math.round((metrics.steps / 8000) * 100)}% of 8,000 goal`
                : null
            }
          />

          {/* 2. Heart Rate */}
          <HealthMetricCard
            icon={Heart}
            title="Heart Rate"
            value={metrics.avg_heart_rate}
            unit="bpm (avg)"
            status={metrics.avg_heart_rate ? 'good' : 'neutral'}
            secondary={
              metrics.min_heart_rate && metrics.max_heart_rate
                ? `Range: ${Math.round(metrics.min_heart_rate)} - ${Math.round(metrics.max_heart_rate)} bpm`
                : null
            }
          />

          {/* 3. Resting Heart Rate */}
          <HealthMetricCard
            icon={Heart}
            title="Resting Heart Rate"
            value={metrics.resting_heart_rate}
            unit="bpm"
            status={metrics.resting_heart_rate ? 'good' : 'neutral'}
            secondary={metrics.resting_heart_rate ? 'Measured at rest / sleep' : null}
          />

          {/* 4. Sleep Duration & Quality */}
          <HealthMetricCard
            icon={Moon}
            title="Sleep Duration"
            value={
              metrics.sleep_duration_minutes != null
                ? `${Math.floor(metrics.sleep_duration_minutes / 60)}h ${metrics.sleep_duration_minutes % 60}m`
                : null
            }
            status={metrics.sleep_duration_minutes >= 420 ? 'good' : 'neutral'}
            secondary={sleepSecondary}
          />

          {/* 5. Active Calories Burned */}
          <HealthMetricCard
            icon={Flame}
            title="Active Energy"
            value={metrics.active_calories}
            unit="kcal burned"
            status={metrics.active_calories ? 'good' : 'neutral'}
            secondary={
              metrics.total_calories != null
                ? `Total Daily Energy: ${Math.round(metrics.total_calories)} kcal`
                : null
            }
          />

          {/* 6. Walking Distance */}
          <HealthMetricCard
            icon={Navigation}
            title="Walking Distance"
            value={
              metrics.distance_meters != null
                ? Math.round((metrics.distance_meters / 1000) * 100) / 100
                : null
            }
            unit="km"
            status={metrics.distance_meters ? 'good' : 'neutral'}
            secondary={
              metrics.distance_meters != null
                ? `Approx. ${Math.round(metrics.distance_meters)} meters covered`
                : null
            }
          />

          {/* 7. Blood Oxygen (SpO2) */}
          <HealthMetricCard
            icon={Wind}
            title="Blood Oxygen (SpO2)"
            value={metrics.spo2_avg}
            unit="%"
            status={metrics.spo2_avg >= 95 ? 'good' : (metrics.spo2_avg ? 'warning' : 'neutral')}
            secondary={metrics.spo2_avg ? 'Normal resting: 95% - 100%' : null}
          />

          {/* 8. Blood Pressure */}
          <HealthMetricCard
            icon={Activity}
            title="Blood Pressure"
            value={bpDisplay}
            unit="mmHg"
            status={bpDisplay ? 'good' : 'neutral'}
            secondary={bpSecondary}
          />

          {/* 9. Exercise Activity Sessions */}
          <HealthMetricCard
            icon={Activity}
            title="Exercise Activity"
            value={metrics.exercise_duration_minutes}
            unit="mins active"
            status={metrics.exercise_duration_minutes ? 'good' : 'neutral'}
            secondary={
              metrics.exercise_duration_minutes
                ? 'Recorded workout & active bouts'
                : null
            }
          />
        </div>

        {/* Interactive Trends Chart */}
        <div className="mt-10">
          <HealthTrendChart
            dataPoints={trendsData?.data_points || []}
            period={trendPeriod}
            onPeriodChange={handlePeriodChange}
          />
        </div>

        {/* Paired Devices & Privacy Management Section */}
        <div className="mt-12 rounded-2xl border border-[#E5DEC9] bg-[#FAF7F0] p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DEC9]">
            <div>
              <h3 className="text-lg font-display font-bold text-[#12231B]">
                Connected Health Devices
              </h3>
              <p className="text-xs text-[#718096]">
                Manage devices syncing with Google Health Connect
              </p>
            </div>

            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Purge Health Records</span>
            </button>
          </div>

          <div className="mt-4 divide-y divide-[#E5DEC9]/60">
            {devices.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#718096]">
                No Android companion devices paired yet. Click <strong>Connect Android Phone</strong> to link your device.
              </div>
            ) : (
              devices.map((dev) => (
                <div key={dev.id} className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#065F46]/10 text-[#065F46] flex items-center justify-center">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[#12231B]">{dev.device_name}</h4>
                      <p className="text-xs text-[#718096]">
                        {dev.device_model || 'Android'} · {dev.os_version || 'Android 14'}
                      </p>
                      <p className="text-[11px] text-[#A0AEC0] mt-0.5">
                        Connected since {new Date(dev.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-[#065F46] bg-[#065F46]/10 px-2 py-1 rounded-lg">
                      Sync Enabled
                    </span>
                    <button
                      onClick={() => handleUnlinkDevice(dev.id)}
                      className="text-xs text-[#718096] hover:text-red-600 transition-colors font-medium"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pairing Modal */}
        <DevicePairingModal
          isOpen={isPairModalOpen}
          onClose={() => setIsPairModalOpen(false)}
          onDeviceLinked={(newDev) => {
            showToast(`Connected ${newDev.device_name}!`);
            loadData();
          }}
        />

        {/* Privacy Purge Confirmation Dialog */}
        {deleteConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-[#FAF7F0] border border-red-200 p-6 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-display font-bold text-[#12231B]">
                Delete All Health Records?
              </h3>
              <p className="text-xs text-[#4A5568] mt-2 leading-relaxed">
                This will permanently delete all raw Health Connect measurements, daily summaries,
                and trend calculations associated with your account in compliance with GDPR privacy rules.
                This action cannot be undone.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#4A5568] hover:bg-[#EFE8DA] rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurgeRecords}
                  className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                >
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

