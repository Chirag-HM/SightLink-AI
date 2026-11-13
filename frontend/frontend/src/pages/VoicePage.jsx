import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, MicOff, Volume2, Send, Loader2, Trash2, Radio } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { useAuth } from '../context/AuthContext';
import useStickGps from '../hooks/useStickGps';
import { parseFamilyVoiceCommand, primeSharedAudioContext } from '../hooks/useVoiceAssistant';
import { useAssistant } from '../assistant/AssistantContext';
import {
  assistantMsg,
  detectLanguageFromText,
  getQuickCommandsForLang,
  getWelcomeMessage,
} from '../assistant/i18n';
import {
  familyService,
  visionService,
  ultrasonicService,
} from '../services/api';

function isAheadOrObstacleQuery(text = '') {
  const lower = String(text || '').toLowerCase();
  const keywords = [
    'ahead', 'obstacle', 'vision', 'in front', 'what is in front',
    'आगे क्या', 'सामने क्या', 'अवरोध', 'aage kya', 'samne kya',
    'முன்னால்', 'தடை', 'munnadi', 'எதிரில்',
    'ముందు', 'అడ్డంకి', 'mundu em', 'mundu emundi',
    'ಮುಂದೆ', 'ಅಡೆತಡೆ', 'munde enide',
  ];
  return keywords.some((k) => lower.includes(k));
}

export default function VoicePage() {
  const navigate = useNavigate();
  const { user, reducedMotion } = useAuth();
  const { location: stickGps } = useStickGps();
  const assistant = useAssistant();

  const [messages, setMessages] = useState(() => [
    {
      type: 'ai',
      isWelcome: true,
      text: getWelcomeMessage(assistant.language),
    },
  ]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);

  // Keep initial welcome card localized when user switches language before chatting
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].isWelcome
        ? [{ ...prev[0], text: getWelcomeMessage(assistant.language) }]
        : prev
    );
  }, [assistant.language]);

  const appendAi = useCallback(
    (text, lang) => {
      assistant.speak(text, lang ? { lang } : undefined);
      setMessages((prev) => [...prev, { type: 'ai', text }]);
    },
    [assistant]
  );

  const handleCommandText = useCallback(
    async (rawText) => {
      const userMsg = rawText.trim();
      if (!userMsg) return;

      assistant.vibrate?.('tap');
      setMessages((prev) => [...prev, { type: 'user', text: userMsg }]);
      const replyLang = detectLanguageFromText(userMsg, assistant.language);

      setProcessing(true);
      try {
        // Legacy Family Sharing Settings commands preserved cleanly (multilingual replies)
        const famCmd = parseFamilyVoiceCommand(userMsg);
        if (famCmd) {
          if (user?.role !== 'blind_user') {
            appendAi(assistantMsg(replyLang, 'family_signin_required'), replyLang);
            return;
          }
          if (famCmd.action === 'read_settings') {
            const s = await familyService.getSharing();
            const status = !s.is_sharing ? 'off' : s.is_paused ? 'paused' : 'live';
            appendAi(
              assistantMsg(replyLang, 'family_sharing_status', {
                status,
                code: s.invite_code,
                count: s.members_count ?? 0,
              }),
              replyLang
            );
            return;
          }
          if (famCmd.action === 'pause_1h' || famCmd.action === 'pause') {
            await familyService.updateConsent({
              consent_given: true,
              is_sharing: true,
              is_paused: true,
              pause_minutes: famCmd.action === 'pause_1h' ? 60 : undefined,
            });
            appendAi(
              assistantMsg(replyLang, famCmd.action === 'pause_1h' ? 'family_paused_1h' : 'family_paused'),
              replyLang
            );
            return;
          }
          if (famCmd.action === 'resume') {
            await familyService.updateConsent({
              consent_given: true,
              is_sharing: true,
              is_paused: false,
            });
            appendAi(assistantMsg(replyLang, 'family_resumed'), replyLang);
            return;
          }
          if (famCmd.action === 'confirm_invite' || famCmd.action === 'decline_invite') {
            await familyService.confirmLatestInvite(famCmd.action === 'confirm_invite');
            appendAi(assistantMsg(replyLang, 'family_invite_updated'), replyLang);
            return;
          }
          appendAi(assistantMsg(replyLang, 'family_opening_controls'), replyLang);
          setTimeout(() => navigate('/contacts'), 700);
          return;
        }

        // Legacy Obstacle / AI Vision query ("what is ahead") preserved cleanly across languages
        if (isAheadOrObstacleQuery(userMsg)) {
          const [visionRes, ultraRes] = await Promise.all([
            visionService.getDetections(),
            ultrasonicService.getDistance(),
          ]);
          const parts = [];
          const stickDist = stickGps?.distance_cm;
          if (Number.isFinite(stickDist) && stickDist < 900) {
            parts.push(assistantMsg(replyLang, 'ahead_ultrasonic', { meters: (Number(stickDist) / 100).toFixed(1) }));
          } else if (ultraRes?.distance != null) {
            parts.push(assistantMsg(replyLang, 'ahead_ultrasonic', { meters: ultraRes.distance }));
          }
          if (Array.isArray(visionRes?.detections) && visionRes.detections.length > 0) {
            const top = visionRes.detections[0];
            parts.push(assistantMsg(replyLang, 'ahead_camera', { label: top.label, distance: top.distance || '' }));
          }
          if (parts.length > 0) {
            appendAi(parts.join(' '), replyLang);
          } else {
            appendAi(assistantMsg(replyLang, 'ahead_no_sensor'), replyLang);
          }
          return;
        }

        // Delegate to central Voice Assistant Intent Engine + Modular Handlers
        const outcome = await assistant.processTranscript(userMsg, { source: 'voice_page' });
        if (outcome?.spoken) {
          setMessages((prev) => [...prev, { type: 'ai', text: outcome.spoken }]);
        }
      } catch (err) {
        appendAi(`${assistantMsg(replyLang, 'unknown_fallback')} (${err?.message || 'error'})`, replyLang);
      } finally {
        setProcessing(false);
      }
    },
    [user?.role, stickGps, navigate, appendAi, assistant]
  );

  const quickCommands = getQuickCommandsForLang(assistant.language);

  const handleSend = () => {
    if (!input.trim() || processing) return;
    primeSharedAudioContext();
    const text = input;
    setInput('');
    handleCommandText(text);
  };

  return (
    <DashboardShell
      title="Voice Assistant"
      subtitle="Hands-free voice, ESP32 button, walking navigation, transit arrivals, volunteer dispatch & SOS controller"
      icon={Mic}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Status Bar & Language Selector */}
        <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5" role="status" aria-live="polite">
            <span className="px-3 py-1 rounded-full bg-[#065F46]/10 border border-[#065F46]/30 text-xs font-mono font-bold text-[#065F46]">
              State: {assistant.assistantState}
            </span>
            {assistant.micActive && (
              <span className="px-3 py-1 rounded-full bg-red-50 border border-red-300 text-xs font-mono font-bold text-red-700 inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" aria-hidden="true" />
                Microphone on
              </span>
            )}
            <span className="px-3 py-1 rounded-full bg-[#F6F1E6] border border-[#DCD2BF] text-xs font-mono text-[#354B40] inline-flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#065F46]" aria-hidden="true" />
              {assistant.hardwareConnected ? 'ESP32 Hardware Button Connected' : 'WebSocket Hardware Listener Active'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="voice-page-lang" className="text-xs font-semibold text-[#354B40]">
              Speech Language
            </label>
            <select
              id="voice-page-lang"
              value={assistant.language}
              onChange={(e) => assistant.setLanguage(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#D7CEBC] text-xs font-medium text-[#12231B]"
            >
              {assistant.languages.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Glowing Reactive Talk Orb */}
        <div className="flex flex-col items-center justify-center gap-3">
          <motion.button
            type="button"
            onClick={assistant.triggerTalkButton}
            animate={
              reducedMotion
                ? {}
                : { scale: assistant.micActive ? 1 + Math.min(0.18, assistant.micLevel * 0.25) : 1 }
            }
            className={`relative w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1 transition-all focus-visible-ring ${
              assistant.micActive
                ? 'bg-[#065F46] text-white border-2 border-[#E6CB8F] shadow-glow-lg'
                : 'bg-white border-2 border-[#065F46]/40 hover:border-[#065F46] text-[#065F46] shadow-card'
            }`}
            aria-pressed={assistant.micActive}
            aria-keyshortcuts="Space Enter"
            aria-label={assistant.micActive ? 'Stop listening and cancel' : 'Talk to Voice Assistant'}
          >
            {assistant.micActive ? (
              <Mic className="w-9 h-9 text-[#F4E3BC]" aria-hidden="true" />
            ) : (
              <MicOff className="w-9 h-9 text-[#065F46]" aria-hidden="true" />
            )}
            <span className="text-xs font-bold">
              {assistant.micActive ? 'Cancel' : 'Talk'}
            </span>
          </motion.button>
          <span className="text-xs font-mono text-[#4F6358]">
            {processing
              ? 'Processing command…'
              : assistant.micActive
              ? `Listening (${assistant.language})… ${assistant.interimTranscript || ''}`
              : assistant.lastHeard
              ? `Last heard: “${assistant.lastHeard}”`
              : 'Press Talk button, Space/Enter when focused, or press physical ESP32 button'}
          </span>
        </div>

        {/* Transcript & Caption Feed */}
        <div
          aria-live="polite"
          className="glass-card p-6 max-h-[340px] overflow-y-auto space-y-4"
        >
          {messages.map((msg, i) => (
            <div
              key={`${msg.type}-${i}`}
              className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[82%] px-4 py-3 rounded-2xl text-sm ${
                  msg.type === 'user'
                    ? 'bg-[#FBF3DF] border border-[#C59B42]/35 text-[#12231B] rounded-br-md'
                    : 'bg-[#ECF7F2] border border-[#065F46]/25 text-[#12231B] rounded-bl-md'
                }`}
              >
                {msg.type === 'ai' && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Volume2 className="w-3.5 h-3.5 text-[#065F46]" aria-hidden="true" />
                    <span className="text-[10px] font-mono font-semibold text-[#065F46]">SIGHTLINK AI</span>
                  </div>
                )}
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="glass-card p-1.5 flex items-center gap-2">
          <input
            type="text"
            aria-label="Type a voice command"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type or speak in English, हिंदी, தமிழ், తెలుగు, or ಕನ್ನಡ (e.g. “मैं कहाँ हूँ”, “बस 400”, “Check bus 400”)..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-[#12231B] placeholder:text-[#697D72] px-4 py-3"
          />
          <button
            type="button"
            disabled={processing}
            onClick={handleSend}
            className="min-w-[44px] min-h-[44px] p-3 rounded-xl bg-[#065F46] text-white hover:bg-[#054D39] transition-colors flex items-center justify-center disabled:opacity-50"
            aria-label="Send command"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Commands */}
        <div className="flex flex-wrap gap-2">
          {quickCommands.map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={processing}
              onClick={() => handleCommandText(cmd)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-white border border-[#D7CEBC] text-xs text-[#354B40] hover:text-[#065F46] hover:border-[#065F46]/50 transition-colors disabled:opacity-50"
            >
              “{cmd}”
            </button>
          ))}
        </div>

        {/* Command History Debug Log */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-[#12231B]">
                Command Log ({assistant.commandLog.length})
              </h3>
              <p className="text-xs text-[#4F6358]">
                Recorded time, transcript, resolved intent, and assistant result
              </p>
            </div>
            {assistant.commandLog.length > 0 && (
              <button
                type="button"
                onClick={assistant.deleteHistory}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete History
              </button>
            )}
          </div>

          {assistant.commandLog.length === 0 ? (
            <p className="text-xs text-[#697D72] py-2">No commands recorded yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2D9C8] text-[#4F6358] font-mono">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Transcript</th>
                    <th className="py-2 pr-3">Intent</th>
                    <th className="py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {assistant.commandLog.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-b border-[#F2ECE0]">
                      <td className="py-2 pr-3 font-mono text-[11px] text-[#697D72] whitespace-nowrap">
                        {new Date(row.time).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-3 font-medium text-[#12231B]">{row.transcript}</td>
                      <td className="py-2 pr-3 font-mono font-bold text-[#065F46] whitespace-nowrap">
                        {row.intent}
                      </td>
                      <td className="py-2 text-[#354B40]">{row.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
