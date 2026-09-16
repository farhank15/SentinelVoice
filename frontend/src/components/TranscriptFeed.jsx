import React, { useEffect, useRef } from 'react';
import { MessageSquare, Bot, User, AlertCircle } from 'lucide-react';

export function TranscriptFeed({ transcripts = [] }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col h-[520px]">
      {/* Feed Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          <h3 className="text-xs font-semibold font-mono tracking-wider uppercase text-zinc-300">
            Real-Time Voice Transcript
          </h3>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
          Sub-300ms Turn Stream
        </span>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto space-y-3.5 py-4 pr-1.5">
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs text-center">
            <Bot className="w-6 h-6 mb-2 opacity-30" />
            <span className="text-zinc-400">Voice transcript standby</span>
            <span className="text-[10px] text-zinc-400 mt-0.5">Run a scenario or speak into microphone</span>
          </div>
        ) : (
          transcripts.map((t) => {
            const isAgent = t.role === 'agent';
            const isAttack = String(t.speaker || '').toLowerCase().includes('deepfake');

            return (
              <div
                key={t.id}
                className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-mono text-zinc-400">
                  {isAgent ? (
                    <>
                      <span className="font-semibold text-indigo-400">SentinelVoice</span>
                      <span className="text-[10px] text-zinc-400">{t.timestamp}</span>
                    </>
                  ) : isAttack ? (
                    <>
                      <AlertCircle className="w-3 h-3 text-rose-400 inline" />
                      <span className="font-semibold text-rose-400">{t.speaker}</span>
                      <span className="text-[10px] text-zinc-400">{t.timestamp}</span>
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3 text-zinc-400 inline" />
                      <span className="font-semibold text-zinc-300">{t.speaker}</span>
                      <span className="text-[10px] text-zinc-400">{t.timestamp}</span>
                    </>
                  )}
                </div>

                <div
                  className={`max-w-[88%] rounded-xl px-4 py-2.5 text-xs leading-relaxed transition-all ${
                    isAgent
                      ? 'bg-indigo-950/40 border border-indigo-500/30 text-zinc-100 rounded-tr-none'
                      : isAttack
                      ? 'bg-rose-950/20 border border-rose-800/40 text-rose-100 rounded-tl-none'
                      : 'bg-zinc-800/80 border border-zinc-700/60 text-zinc-200 rounded-tl-none'
                  }`}
                >
                  {t.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
