import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Shield,
  ShieldAlert,
  Radio,
  Lock,
  User,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { VoiceWave } from './VoiceWave';

export function LiveVoiceRoom({
  agentState,
  transcripts = [],
  toolCalls = [],
  escrowState = {},
  isMicActive,
  isScenarioRunning = false,
  latestThinking = null,
  activeScenarioMeta = null,
  micLevel = 0,
  onToggleMic,
  onTriggerScenario,
  onReset
}) {
  const [callDuration, setCallDuration] = useState(0);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);
  const feedRef = useRef(null);

  const isCallEnded = escrowState.status === 'FROZEN' || escrowState.status === 'RELEASED';
  const isTimerRunning = isMicActive || (isScenarioRunning && !isCallEnded);

  useEffect(() => {
    if (!isTimerRunning) return;
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isTimerRunning]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [transcripts]);

  const formatTimer = (secs) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const isThreatScenario = activeScenarioMeta
    ? activeScenarioMeta.category === 'ADVERSARIAL_DEEPFAKE'
    : (escrowState.status === 'FROZEN' || escrowState.riskLevel === 'CRITICAL' || transcripts.some((t) => String(t.speaker || '').toLowerCase().includes('deepfake')));

  const isCleanScenario = activeScenarioMeta
    ? (activeScenarioMeta.category === 'LEGITIMATE_TREASURY' || activeScenarioMeta.category === 'EDGE_CASE_TEST')
    : (escrowState.status === 'RELEASED' || escrowState.riskLevel === 'LOW' || transcripts.some((t) => String(t.speaker || '').toLowerCase().includes('elena') || String(t.speaker || '').toLowerCase().includes('genuine')));

  const callerProfileName = activeScenarioMeta?.executiveClaimed
    ? activeScenarioMeta.executiveClaimed
    : (isThreatScenario ? 'Claimed Executive (Spoofed)' : isCleanScenario ? 'Verified Executive' : 'Inbound Wire Channel');

  const callerTagLabel = isThreatScenario
    ? (activeScenarioMeta ? `${activeScenarioMeta.id} • Threat Vector` : 'Spoofed Caller ID')
    : isCleanScenario
    ? (activeScenarioMeta ? `${activeScenarioMeta.id} • Authenticated Caller` : 'Verified VIP Trunk')
    : 'Zero-Trust Standby';

  const callerSubtitle = activeScenarioMeta
    ? `${activeScenarioMeta.name} • ${activeScenarioMeta.reference}`
    : (isThreatScenario
        ? '+1 (415) 890-2144 • Adversarial Synthetic Voice Vector'
        : isCleanScenario
        ? '+1 (212) 555-0199 • Authorized Corporate Executive'
        : 'Zero-Trust Telephony Gateway Active');

  const getStateConfig = () => {
    switch (agentState) {
      case 'SPEAKING':
        return {
          label: 'Sentinel Responding',
          badge: 'text-indigo-700 bg-indigo-50 border-indigo-200',
          dot: 'bg-indigo-600 animate-pulse'
        };
      case 'ANALYZING':
        return {
          label: 'Auditing Intent',
          badge: 'text-amber-800 bg-amber-50 border-amber-200',
          dot: 'bg-amber-600 animate-ping'
        };
      case 'EMERGENCY_LOCK':
        return {
          label: 'Escrow Locked',
          badge: 'text-rose-800 bg-rose-50 border-rose-200',
          dot: 'bg-rose-600'
        };
      case 'LISTENING':
      default:
        return {
          label: isMicActive ? 'Listening' : 'Standby',
          badge: 'text-emerald-700 bg-emerald-50 border-emerald-200',
          dot: 'bg-emerald-500'
        };
    }
  };

  const stateCfg = getStateConfig();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl flex flex-col h-full min-h-0 shadow-xs overflow-hidden relative">
      {/* 1. Sleek Caller Profile Header */}
      <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 transition-all ${
              isThreatScenario
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : isCleanScenario
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            {isThreatScenario ? (
              <ShieldAlert className="w-5 h-5" />
            ) : isCleanScenario ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 truncate">
                {callerProfileName}
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 font-medium ${
                  isThreatScenario
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : isCleanScenario
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {callerTagLabel}
              </span>
            </div>
            <span className="text-[11.5px] text-slate-400 font-medium block truncate">
              {callerSubtitle}
            </span>
          </div>
        </div>

        {/* State Badge & Call Timer */}
        <div className="flex items-center gap-2 font-mono shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold">{formatTimer(callDuration)}</span>
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold ${stateCfg.badge}`}>
            <span className={`w-2 h-2 rounded-full ${stateCfg.dot}`} />
            <span>{stateCfg.label}</span>
          </div>
        </div>
      </div>

      {/* 1b. Live Voice Activity Wave (real mic RMS / agent speaking indicator) */}
      <div className="shrink-0 border-b border-slate-100 bg-white py-1">
        <VoiceWave
          level={micLevel}
          agentState={agentState}
          isMicActive={isMicActive}
        />
      </div>

      {/* 2. Autonomous Forensic Reasoning Accordion (Collapsible, takes zero space if collapsed) */}
      {latestThinking && (() => {
        const assessment = latestThinking.threatAssessment || {};
        const pVectors = assessment.persuasion_vectors || {
          authority_pressure: assessment.coercion_score || 0.15,
          urgency_scarcity: assessment.urgency_score || 0.20,
          smooth_rapport_liking: 0.05,
          protocol_evasion: 0.05
        };
        const attackProfile = assessment.attack_profile || (
          assessment.verdict === 'CRITICAL_FRAUD' ? 'CRUSH / COERCIVE INTIMIDATION' :
          assessment.verdict === 'NOMINAL' ? 'AUTHENTIC HUMAN ENTITY' : null
        );
        const asvScore = assessment.synthetic_confidence !== undefined
          ? assessment.synthetic_confidence
          : (activeScenarioMeta?.telemetry?.asvSpoofScore || 0.04);

        return (
          <div className="mx-4 my-2 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shrink-0 transition-all">
            <div
              onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
              className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors select-none gap-2"
            >
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="font-bold text-slate-800 tracking-tight">
                  Autonomous Forensic Trace
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white text-slate-700 border border-slate-200 font-semibold shadow-2xs">
                  DAG: {latestThinking.dagNode ? latestThinking.dagNode.toUpperCase() : 'N6'}
                </span>
                {attackProfile && (
                  <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                    attackProfile.includes('CRUSH') || attackProfile.includes('SYNTHETIC')
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : attackProfile.includes('SMOOTH') || attackProfile.includes('BUREAUCRATIC')
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {attackProfile}
                  </span>
                )}
                {assessment.verdict && (
                  <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                    assessment.verdict === 'CRITICAL_FRAUD'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : assessment.verdict === 'SUSPICIOUS'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {assessment.verdict}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-slate-400 text-xs shrink-0">
                <span className="text-[10.5px] font-mono">{latestThinking.timestamp}</span>
                {isThinkingExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                )}
              </div>
            </div>

            {isThinkingExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-slate-200/80 space-y-2">
                {/* 5-Column Cialdini & Acoustic Biometrics Micro-Gauges */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 font-mono text-[10px]">
                  {/* 1. Authority Pressure */}
                  <div className="bg-white border border-slate-200 rounded-md p-1.5 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                      <span className="truncate">Authority</span>
                      <span className={`font-bold ${pVectors.authority_pressure > 0.6 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {(pVectors.authority_pressure * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${pVectors.authority_pressure > 0.6 ? 'bg-rose-500' : 'bg-slate-400'}`}
                        style={{ width: `${Math.min(100, Math.max(0, pVectors.authority_pressure * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* 2. Urgency / Scarcity */}
                  <div className="bg-white border border-slate-200 rounded-md p-1.5 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                      <span className="truncate">Urgency</span>
                      <span className={`font-bold ${pVectors.urgency_scarcity > 0.6 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {(pVectors.urgency_scarcity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${pVectors.urgency_scarcity > 0.6 ? 'bg-amber-500' : 'bg-slate-400'}`}
                        style={{ width: `${Math.min(100, Math.max(0, pVectors.urgency_scarcity * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* 3. Smooth Rapport / Liking */}
                  <div className="bg-white border border-slate-200 rounded-md p-1.5 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                      <span className="truncate">Smooth / Liking</span>
                      <span className={`font-bold ${pVectors.smooth_rapport_liking > 0.5 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {(pVectors.smooth_rapport_liking * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${pVectors.smooth_rapport_liking > 0.5 ? 'bg-amber-500' : 'bg-slate-400'}`}
                        style={{ width: `${Math.min(100, Math.max(0, pVectors.smooth_rapport_liking * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* 4. Protocol Evasion */}
                  <div className="bg-white border border-slate-200 rounded-md p-1.5 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                      <span className="truncate">Token Evasion</span>
                      <span className={`font-bold ${pVectors.protocol_evasion > 0.5 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {(pVectors.protocol_evasion * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${pVectors.protocol_evasion > 0.5 ? 'bg-rose-500' : 'bg-slate-400'}`}
                        style={{ width: `${Math.min(100, Math.max(0, pVectors.protocol_evasion * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* 5. ASVspoof DSP */}
                  <div className="bg-white border border-slate-200 rounded-md p-1.5 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                      <span className="truncate">ASVspoof DSP</span>
                      <span className={`font-bold ${asvScore > 0.5 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {(asvScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${asvScore > 0.5 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, Math.max(0, asvScore * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Reasoning Text */}
                <div className="text-xs font-mono text-slate-700 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs max-h-28 overflow-y-auto">
                  <span className="text-indigo-600 font-bold mr-1.5">&gt;</span>
                  {latestThinking.thinking}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 3. Conversational Message Stream (Maximized height) */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-white">
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs text-center py-12 px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-3 text-indigo-600 shadow-xs">
              <Radio className="w-6 h-6" />
            </div>
            <h4 className="text-slate-900 text-sm font-semibold mb-1">
              Telephony Intercept Gateway Ready
            </h4>
            <p className="text-slate-500 max-w-sm text-xs leading-relaxed mb-4">
              Select any benchmark scenario from the header library or activate the microphone to test live defense against voice cloning and wire fraud.
            </p>
          </div>
        ) : (
          transcripts.map((t, idx) => {
            const isAgent = t.role === 'agent';
            return (
              <div
                key={t.id || idx}
                className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-medium text-slate-400">
                  {isAgent ? (
                    <>
                      <Bot className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="font-semibold text-slate-700">SentinelVoice AI</span>
                      <span>•</span>
                      <span>{t.timestamp}</span>
                    </>
                  ) : (
                    <>
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-semibold text-slate-700">{t.speaker || 'Caller'}</span>
                      <span>•</span>
                      <span>{t.timestamp}</span>
                    </>
                  )}
                </div>

                <div
                  className={`px-4 py-2.5 text-xs leading-relaxed max-w-[85%] shadow-2xs ${
                    isAgent
                      ? 'bg-indigo-50/80 text-slate-900 border border-indigo-200/80 rounded-2xl rounded-tr-sm'
                      : 'bg-slate-100/90 text-slate-900 border border-slate-200/80 rounded-2xl rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  {t.isStreaming && (
                    <span className="inline-block w-1.5 h-3 ml-1 bg-indigo-600 animate-pulse" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
