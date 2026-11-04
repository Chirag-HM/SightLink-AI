import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, Volume2, Send } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';

const sampleResponses = {
  'which bus is nearby': 'Bus 507 is 357 meters away and approaching. Estimated arrival in 31 seconds.',
  'where am i': 'You are near Majestic Bus Stand, Bengaluru. Coordinates: 12.9716° N, 77.5946° E.',
  'what is ahead': 'A person is detected 2.4 meters ahead. The path is mostly clear.',
  'call for help': 'Initiating emergency protocol. Alerting 3 trusted contacts and nearby volunteers.',
};

export default function VoicePage() {
  const [messages, setMessages] = useState([
    { type: 'ai', text: 'Hello! I\'m your SIGHTLINK voice assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { type: 'user', text: userMsg }]);
    setInput('');

    const key = Object.keys(sampleResponses).find(k => userMsg.toLowerCase().includes(k));
    setTimeout(() => {
      setMessages(prev => [...prev, {
        type: 'ai',
        text: key ? sampleResponses[key] : `I heard "${userMsg}". In a live system, I would process this through the AI pipeline. Try asking: "Which bus is nearby?" or "Where am I?"`,
      }]);
    }, 800);
  };

  return (
    <DashboardShell title="Voice Assistant" subtitle="Natural language voice interaction with the system" icon={Mic}>
      <div className="max-w-3xl mx-auto">
        {/* Mic Visual */}
        <div className="flex justify-center mb-8">
          <motion.button
            onClick={() => setIsListening(!isListening)}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? 'bg-accent-violet/20 border-2 border-accent-violet shadow-[0_0_40px_rgba(139,92,246,0.3)]'
                : 'bg-dark-800 border border-white/10 hover:border-accent-violet/30'
            }`}
            whileTap={{ scale: 0.95 }}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
          >
            {isListening && (
              <>
                <motion.div className="absolute inset-0 rounded-full border border-accent-violet/30" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
                <motion.div className="absolute inset-0 rounded-full border border-accent-violet/20" animate={{ scale: [1, 1.8], opacity: [0.4, 0] }} transition={{ duration: 1.5, delay: 0.3, repeat: Infinity }} />
              </>
            )}
            <Mic className={`w-8 h-8 ${isListening ? 'text-accent-violet' : 'text-dark-200'}`} />
          </motion.button>
        </div>

        {/* Waveform */}
        {isListening && (
          <div className="flex items-center justify-center gap-0.5 h-12 mb-6">
            {[...Array(24)].map((_, i) => (
              <motion.div
                key={i}
                className="w-1 rounded-full bg-gradient-to-t from-accent-violet to-accent-cyan"
                animate={{ height: [4, 15 + Math.random() * 25, 4] }}
                transition={{ duration: 0.8 + Math.random() * 0.4, delay: i * 0.03, repeat: Infinity }}
              />
            ))}
          </div>
        )}

        {/* Chat Messages */}
        <div className="glass-card p-6 mb-4 max-h-[400px] overflow-y-auto space-y-4">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                msg.type === 'user'
                  ? 'bg-accent-blue/15 border border-accent-blue/20 text-white rounded-br-md'
                  : 'bg-accent-cyan/10 border border-accent-cyan/20 text-white rounded-bl-md'
              }`}>
                {msg.type === 'ai' && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Volume2 className="w-3 h-3 text-accent-cyan" />
                    <span className="text-[10px] text-accent-cyan/70">SIGHTLINK AI</span>
                  </div>
                )}
                {msg.text}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Input */}
        <div className="glass-card p-1.5 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type or speak a command..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-dark-400 px-4 py-3"
          />
          <button onClick={handleSend} className="p-3 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/20 transition-colors" aria-label="Send">
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Commands */}
        <div className="flex flex-wrap gap-2 mt-4">
          {Object.keys(sampleResponses).map((cmd) => (
            <button
              key={cmd}
              onClick={() => { setInput(cmd); }}
              className="px-3 py-1.5 rounded-full bg-dark-800 border border-white/[0.06] text-xs text-dark-200 hover:text-white hover:border-white/20 transition-colors capitalize"
            >
              "{cmd}"
            </button>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
