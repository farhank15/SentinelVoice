import React from 'react';
import { Radio, Volume2, ShieldAlert, Sparkles, Mic } from 'lucide-react';

export function AudioOrb({ state = 'IDLE', isMicActive = false }) {
  const getStateInfo = () => {
    switch (state) {
      case 'SPEAKING':
        return {
          label: 'SentinelVoice Responding',
          color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
          dot: 'bg-indigo-400',
          waveColor: 'bg-indigo-400',
          icon: <Volume2 className="w-4 h-4 text-indigo-400" />
        };
      case 'ANALYZING':
        return {
          label: 'Verifying Compliance & Tool Execution',
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          dot: 'bg-amber-400',
          waveColor: 'bg-amber-400',
          icon: <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
        };
      case 'EMERGENCY_LOCK':
        return {
          label: 'Transaction Locked (SOX Escrow Freeze)',
          color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
          dot: 'bg-rose-400',
          waveColor: 'bg-rose-400',
          icon: <ShieldAlert className="w-4 h-4 text-rose-400" />
        };
      case 'LISTENING':
      default:
        return {
          label: isMicActive ? 'Listening to Microphone' : 'Agent Ready (Standby)',
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          dot: 'bg-emerald-400',
          waveColor: 'bg-emerald-400',
          icon: isMicActive ? <Mic className="w-4 h-4 text-emerald-400" /> : <Radio className="w-4 h-4 text-emerald-400" />
        };
    }
  };

  const info = getStateInfo();
  const isInteracting = state === 'SPEAKING' || state === 'ANALYZING' || isMicActive;

  return (
    <div className="flex flex-col items-center justify-between p-6 bg-zinc-900/60 border border-zinc-800 rounded-xl relative overflow-hidden">
      {/* Top Status Header */}
      <div className="w-full flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider">
            Voice Agent Stream
          </span>
        </div>

        <div className={`px-2.5 py-1 rounded-full border text-xs font-mono font-medium flex items-center gap-1.5 ${info.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${info.dot} ${isInteracting ? 'animate-ping' : ''}`} />
          <span>{info.label}</span>
        </div>
      </div>

      {/* Modern Waveform Visualizer */}
      <div className="h-16 flex items-center justify-center gap-1.5 w-full my-2">
        <div className={`w-1 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-1' : 'h-2 opacity-30'}`} />
        <div className={`w-1 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-2' : 'h-3 opacity-30'}`} />
        <div className={`w-1 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-3' : 'h-5 opacity-40'}`} />
        <div className={`w-1.5 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-4' : 'h-7 opacity-60'}`} />
        <div className={`w-1.5 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-5' : 'h-10 opacity-80'}`} />
        <div className={`w-1.5 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-3' : 'h-7 opacity-60'}`} />
        <div className={`w-1 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-2' : 'h-5 opacity-40'}`} />
        <div className={`w-1 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-4' : 'h-3 opacity-30'}`} />
        <div className={`w-1 rounded-full transition-all duration-300 ${info.waveColor} ${isInteracting ? 'animate-wave-1' : 'h-2 opacity-30'}`} />
      </div>

      {/* Bottom Subtext */}
      <div className="w-full flex items-center justify-between pt-4 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400">
        <span>Duplex Telephony Audio Engine</span>
        <span>Server VAD Turn-Taking</span>
      </div>
    </div>
  );
}
