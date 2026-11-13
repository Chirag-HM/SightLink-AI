import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Send,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Unlink,
  AlertCircle,
  Copy,
  Check,
  Globe,
} from 'lucide-react';
import { telegramService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function TelegramConnectCard({
  title = 'Connect Telegram Alerts (Free)',
  subtitle = 'Get instant SOS, no-volunteer warnings, and safety updates directly in Telegram.',
  className = '',
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [connectInfo, setConnectInfo] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user || user.email_verified === false) return;
    try {
      const data = await telegramService.getStatus();
      setStatus(data);
    } catch {
      // ignore if unauthenticated
    }
  }, [user]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!user || !connectInfo?.connect_url || status?.connected) return undefined;
    const onFocus = () => loadStatus();
    const timer = window.setInterval(loadStatus, 4000);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, connectInfo?.connect_url, status?.connected, loadStatus]);

  const handleGenerateLink = async () => {
    setError('');
    setNotice('');
    setCopiedCmd(false);
    setBusy(true);
    try {
      const res = await telegramService.createConnectLink();
      setConnectInfo(res);
      setNotice(
        'Link ready! Scan the QR code on your phone, open Telegram Web below, or copy the /start command and send it to @' +
          res.bot_username +
          '.'
      );
      if (res.connect_url) {
        const qr = await QRCode.toDataURL(res.connect_url, {
          width: 168,
          margin: 2,
          color: { dark: '#065F46', light: '#FAF7F0' },
        });
        setQrUrl(qr);
      }
    } catch (err) {
      setError(err.message || 'Could not generate Telegram connect link.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCommand = async () => {
    const cmd = connectInfo?.start_command || (connectInfo?.token ? `/start ${connectInfo.token}` : '');
    if (!cmd) return;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 2500);
    } catch {
      setError('Could not copy automatically — please select and copy the /start command manually.');
    }
  };

  const handleDisconnect = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await telegramService.disconnect();
      setConnectInfo(null);
      setQrUrl('');
      setNotice('Telegram alerts disconnected cleanly.');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Could not disconnect Telegram.');
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <section
      aria-label="Telegram alert channel connection"
      className={`glass-card p-6 border border-[#DCD2BF] space-y-4 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#ECF7F2] border border-[#065F46]/25 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-[#12231B] flex flex-wrap items-center gap-2">
              <span>{title}</span>
              {status?.connected ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46] text-xs font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Connected
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-[#F6F1E6] border border-[#DCD2BF] text-[#4F6358] text-xs font-mono">
                  Not connected
                </span>
              )}
            </h3>
            <p className="text-xs sm:text-sm text-[#4F6358] mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={loadStatus}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#D7CEBC] text-xs font-semibold text-[#354B40] hover:text-[#12231B] inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Check Status</span>
          </button>

          {status?.connected ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleDisconnect}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-100 inline-flex items-center gap-1.5"
            >
              <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Disconnect Telegram</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={handleGenerateLink}
              className="min-h-[44px] px-5 py-2 rounded-full bg-[#065F46] text-white font-bold text-xs hover:bg-[#054D39] shadow-glow-sm inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{busy ? 'Generating…' : 'Connect Telegram'}</span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="p-3 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-xs text-[#064E3B] font-medium">
          {notice}
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {status?.connected ? (
        <div className="p-4 rounded-2xl bg-[#ECF7F2]/75 border border-[#065F46]/20 text-xs text-[#064E3B] flex flex-wrap items-center justify-between gap-2">
          <span>
            Active bot: <strong className="font-mono">@{status.bot_username}</strong>
            {status.telegram_username ? ` · Linked account @${status.telegram_username}` : ''}
            {status.chat_id_masked ? ` · Chat ${status.chat_id_masked}` : ''}
          </span>
          <span className="font-mono text-[#354B40]">Send /stop in Telegram anytime to pause alerts.</span>
        </div>
      ) : connectInfo?.connect_url ? (
        <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#DCD2BF] grid sm:grid-cols-12 gap-4 items-center">
          <div className="sm:col-span-8 space-y-2.5">
            <p className="text-xs font-semibold text-[#12231B]">
              Connect with <code className="font-mono text-[#065F46]">@{connectInfo.bot_username}</code> in your browser or phone:
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={connectInfo.web_url || `https://web.telegram.org/k/#@${connectInfo.bot_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#065F46] text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#054D39]"
              >
                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open Telegram Web (Browser)</span>
              </a>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="min-h-[44px] px-4 py-2 rounded-full bg-white border border-[#D7CEBC] text-[#065F46] text-xs font-semibold inline-flex items-center gap-1.5 hover:border-[#065F46]"
              >
                {copiedCmd ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#065F46]" aria-hidden="true" />
                    <span>Copied /start command!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy /start command</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={loadStatus}
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#FBF3DF] border border-[#C59B42]/45 text-[#7D5B1C] text-xs font-semibold"
              >
                I pressed Start — Refresh Status
              </button>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-[#E2D9C8] space-y-1.5">
              <p className="text-[11px] text-[#354B40]">
                <strong>Why does <code>START BOT</code> on <code>t.me</code> stay stuck?</strong> Clicking it launches the{' '}
                <code>tg://</code> desktop app, which isn&apos;t installed on this PC. Instead, scan the QR code on your{' '}
                <strong>phone</strong>, OR click{' '}
                <a
                  href={connectInfo.web_chat_url || `https://web.telegram.org/k/#@${connectInfo.bot_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-[#065F46]"
                >
                  Open Bot in Telegram Web
                </a>{' '}
                and paste this exact command:
              </p>
              <p className="text-[11px] font-mono font-bold text-[#065F46] break-all select-all">
                {connectInfo.start_command || `/start ${connectInfo.token}`}
              </p>
            </div>
          </div>
          {qrUrl && (
            <div className="sm:col-span-4 flex flex-col items-center gap-1.5">
              <img
                src={qrUrl}
                alt={`QR code to connect Telegram bot ${connectInfo.bot_username}`}
                className="w-32 h-32 rounded-xl border border-[#E2D9C8]"
              />
              <span className="text-[10px] font-mono text-[#4F6358]">Scan on phone camera</span>
              <a
                href={connectInfo.connect_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-[#065F46] underline inline-flex items-center gap-1"
              >
                <span>Phone / Desktop App Link (t.me)</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      ) : null}

      {status && !status.configured && (
        <p className="text-[11px] font-mono text-[#7D5B1C]">
          Note: Bot token is configured via <code>TELEGRAM_BOT_TOKEN</code> &amp; <code>TELEGRAM_BOT_USERNAME</code> (created via @BotFather).
        </p>
      )}
    </section>
  );
}

