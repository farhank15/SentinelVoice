import React from 'react';
import { Terminal, CheckCircle2, AlertTriangle, Loader2, Wrench, ShieldAlert, Cpu } from 'lucide-react';

export function ToolExecutionHUD({ toolCalls = [] }) {
  const registeredTools = [
    'verify_corporate_ledger',
    'issue_security_challenge',
    'trigger_out_of_band_verification',
    'emergency_escrow_freeze',
    'release_escrow_transfer'
  ];

  return (
    <div className="bg-[#0f1422]/95 border border-slate-700/60 rounded-2xl p-4 flex flex-col flex-1 min-h-0 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center text-indigo-400 shadow-sm">
            <Terminal className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono tracking-wider uppercase text-slate-100">
              Autonomous Tool Execution Console
            </h3>
            <span className="text-[10px] text-slate-400 font-mono block">
              Autonomous Real-Time Function Calling
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700 text-[10px] font-mono text-slate-300">
          <Cpu className="w-3 h-3 text-indigo-400" />
          <span>Real-Time Tool Calling</span>
        </div>
      </div>

      {/* Tool Call Stream */}
      <div className="flex-1 overflow-y-auto space-y-2.5 py-2.5 pr-1 my-1 min-h-0">
        {toolCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 font-mono text-xs text-center py-6">
            <div className="w-11 h-11 rounded-2xl bg-slate-800/70 border border-slate-700/80 flex items-center justify-center mb-2.5 shadow-inner">
              <Wrench className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-slate-200 font-semibold text-xs">Awaiting Agentic Intent</span>
            <p className="text-[11px] text-slate-400 max-w-xs mt-1 leading-relaxed">
              When the voice agent detects wire amounts, unverified vendors, or executive challenges, autonomous governance tools execute in real time.
            </p>
          </div>
        ) : (
          toolCalls.map((call, idx) => {
            const isFrozen = call.toolName === 'emergency_escrow_freeze';
            const isReleased = call.toolName === 'release_escrow_transfer';
            const isCalling = call.status === 'CALLING';

            return (
              <div
                key={call.id || idx}
                className={`p-3 rounded-xl border font-mono text-xs transition-all animate-slide-up ${
                  isCalling
                    ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                    : isFrozen
                    ? 'bg-rose-950/25 border-rose-500/40 text-rose-200 shadow-md shadow-rose-950/20'
                    : isReleased
                    ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200 shadow-md shadow-emerald-950/20'
                    : 'bg-slate-800/40 border-slate-700/70 text-slate-200'
                }`}
              >
                {/* Tool Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {isCalling ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    ) : isFrozen ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span className="font-bold text-slate-100 text-xs">
                      {call.toolName}()
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">{call.timestamp}</span>
                </div>

                {/* Input Arguments */}
                {call.args && (
                  <div className="mt-1 bg-[#090d16] rounded-lg p-2 text-[10px] text-slate-300 overflow-x-auto border border-slate-800 font-mono">
                    <span className="text-slate-400">args: </span>
                    <span className="text-cyan-300 font-semibold">{JSON.stringify(call.args)}</span>
                  </div>
                )}

                {/* Execution Result */}
                {call.result && (
                  <div
                    className={`mt-1.5 rounded-lg p-2 text-[11px] border font-mono ${
                      call.result.anomaly_detected || call.result.status === 'SUCCESS_FROZEN'
                        ? 'bg-rose-950/30 text-rose-200 border-rose-700/50'
                        : 'bg-emerald-950/25 text-emerald-200 border-emerald-700/50'
                    }`}
                  >
                    <div className="font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        {call.result.anomaly_detected && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                        <span>Status: {call.result.status || call.result.escrow_state}</span>
                      </span>
                      {call.result.anomaly_detected && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/40 uppercase font-bold">
                          Anomaly Blocked
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-300 leading-normal font-sans">
                      {call.result.freeze_reason || call.result.reason || call.result.action_taken || 'Execution returned valid response.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Available Tools Tags Footer */}
      <div className="pt-2.5 border-t border-slate-800/80 shrink-0">
        <span className="text-[10px] text-slate-400 font-mono block mb-1.5 font-medium">
          Declared Enforcement Tools ({registeredTools.length}):
        </span>
        <div className="flex flex-wrap gap-1.5">
          {registeredTools.map((name) => (
            <span
              key={name}
              className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600 transition-colors shadow-sm"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
