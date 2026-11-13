// WebRTC ICE configuration + accessible audio/haptic cues for Eyes on Demand
import { triggerHaptic } from './haptics';

export function getIceServers() {
  const stunUrl = import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302';
  const servers = [{ urls: stunUrl }];
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    const entry = { urls: turnUrl };
    if (import.meta.env.VITE_TURN_USERNAME) entry.username = import.meta.env.VITE_TURN_USERNAME;
    if (import.meta.env.VITE_TURN_CREDENTIAL) entry.credential = import.meta.env.VITE_TURN_CREDENTIAL;
    servers.push(entry);
  }
  return servers;
}

export function vibrateHaptic(pattern = [80]) {
  return triggerHaptic(pattern, { category: 'interactions' });
}

export function playCueTone(kind = 'camera_live') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const scheduleNote = (freq, startOffset, dur, gainPeak = 0.14) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.02);
    };

    if (kind === 'camera_live') {
      scheduleNote(523.25, 0, 0.12, 0.16);
      scheduleNote(659.25, 0.13, 0.16, 0.16);
    } else if (kind === 'incoming_call') {
      scheduleNote(587.33, 0, 0.18, 0.18);
      scheduleNote(880.0, 0.2, 0.25, 0.18);
    } else if (kind === 'escalated') {
      scheduleNote(440.0, 0, 0.14, 0.15);
      scheduleNote(587.33, 0.16, 0.14, 0.15);
      scheduleNote(783.99, 0.32, 0.22, 0.15);
    } else {
      scheduleNote(480, 0, 0.08, 0.08);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Blocked before user gesture; ignore gracefully
  }
}

export function startRingtoneLoop() {
  playCueTone('incoming_call');
  const id = setInterval(() => {
    playCueTone('incoming_call');
  }, 2400);
  return () => clearInterval(id);
}

