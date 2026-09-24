import React from 'react';

const BAR_COUNT = 28;

/**
 * Live voice activity wave. Driven by the real microphone RMS level
 * (micLevel 0..1, already EMA-smoothed in useVoiceSession), so it moves
 * the moment the user speaks and reacts to barge-in/agent states.
 */
export function VoiceWave({ level = 0, agentState = 'IDLE', isMicActive = false, height = 44 }) {
  const agentSpeaking = agentState === 'SPEAKING';
  const analyzing = agentState === 'ANALYZING' || agentState === 'EMERGENCY_LOCK';
  const listening = agentState === 'LISTENING';

  // Deterministic per-bar multipliers -> organic wave instead of a flat block
  const shape = [0.35, 0.55, 0.8, 1.0, 0.85, 0.6, 0.45, 0.7, 0.95, 0.75, 0.5, 0.4, 0.65, 0.9, 1.0, 0.9, 0.65, 0.4, 0.55, 0.8, 0.95, 0.7, 0.5, 0.6, 0.8, 0.6, 0.45, 0.3];

  const color = agentSpeaking
    ? 'bg-indigo-500'
    : analyzing
    ? 'bg-amber-500'
    : listening && isMicActive
    ? 'bg-emerald-500'
    : 'bg-slate-300';

  return (
    <div
      className="flex items-center justify-center gap-[2.5px] px-3 select-none"
      style={{ height }}
      aria-hidden="true"
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const wobble = 1 + 0.25 * Math.sin(Date.now() / 90 + i * 1.7);
        const energy = level * shape[i % shape.length] * wobble;
        // Idle: tiny resting pulse so the bar is never invisible; active: real signal
        const idleFloor = 0.08;
        const h = Math.max(idleFloor, Math.min(1, agentSpeaking ? 0.55 + 0.35 * Math.sin(Date.now() / 70 + i) : energy));
        return (
          <div
            key={i}
            className={`${color} rounded-full transition-[height] duration-75 ease-out`}
            style={{ height: `${Math.max(8, h * 100)}%`, width: 3 }}
          />
        );
      })}
    </div>
  );
}
