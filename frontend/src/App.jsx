import React, { useState } from 'react';
import {
  Shield,
  Radio,
  Lock,
  RotateCcw,
  Mic,
  MicOff,
  ChevronDown,
  Layers,
  Flame,
  FileCheck2,
  Fingerprint
} from 'lucide-react';
import { useVoiceSession } from './hooks/useVoiceSession';
import { LiveVoiceRoom } from './components/LiveVoiceRoom';
import { VoiceWave } from './components/VoiceWave';
import { EscrowStatusCard } from './components/EscrowStatusCard';
import { ReasoningGraphHUD } from './components/ReasoningGraphHUD';
import { VoiceEnrollmentModal } from './components/VoiceEnrollmentModal';

const SCENARIOS = [
  // 1. Adversarial Attacks
  {
    id: 'TC-01',
    key: 'ferrari_ceo_deepfake',
    name: 'Ferrari M&A Deepfake ($500k)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'Ferrari CEO 2024 WhatsApp Incident',
    amount: '$500,000',
    type: 'threat',
    badge: 'Deepfake Voice'
  },
  {
    id: 'TC-02',
    key: 'arup_multihop_syndicate',
    name: 'Arup HK Syndicate ($2.4M Wire)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'Arup $25.6M Multi-Person Deepfake',
    amount: '$2,400,000',
    type: 'threat',
    badge: 'Shell Syndicate'
  },
  {
    id: 'TC-03',
    key: 'uk_energy_coercion',
    name: 'UK Energy Firm Voice Clone ($243k)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'UK Energy CEO Voice Fraud 2019',
    amount: '$243,000',
    type: 'threat',
    badge: 'Coercive Urgency'
  },
  {
    id: 'TC-04',
    key: 'fbi_vendor_switch',
    name: 'Master Vendor Account Hijack ($185k)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'FBI IC3 Vendor Redirection Alert',
    amount: '$185,000',
    type: 'threat',
    badge: 'ERP Routing Hijack'
  },
  {
    id: 'TC-05',
    key: 'spoofed_token_guess',
    name: 'Hardware Token Guessing ($320k)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'MITRE T1566 Impersonation & Bypass',
    amount: '$320,000',
    type: 'threat',
    badge: 'PIN Brute-Force'
  },
  {
    id: 'TC-11',
    key: 'smooth_polite_ceo_clone',
    name: 'Ultra-Smooth Polite CEO ($190k)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'Zero-Coercion Soft Diplomacy Clone',
    amount: '$190,000',
    type: 'threat',
    badge: 'Soft Diplomacy'
  },
  {
    id: 'TC-12',
    key: 'multiturn_executive_payroll_grooming',
    name: 'Payroll Diversion (4 Turns)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'Multi-Turn Persona Grooming (Extended)',
    amount: '$340,000',
    type: 'threat',
    badge: '4-Turn Grooming'
  },
  {
    id: 'TC-13',
    key: 'supply_chain_invoice_spoof',
    name: 'Supply Chain Vendor Switch ($410k)',
    group: 'ADVERSARIAL_ATTACK',
    reference: 'Polite Enterprise IBAN Redirection',
    amount: '$410,000',
    type: 'threat',
    badge: 'Supply Chain BEC'
  },

  // 2. Legitimate Treasury
  {
    id: 'TC-06',
    key: 'legit_routine_invoice',
    name: 'Routine Cloud Invoice ($45k)',
    group: 'LEGITIMATE_TREASURY',
    reference: 'Elena Rostova CFO • Whitelisted Vendor',
    amount: '$45,000',
    type: 'clean',
    badge: 'ERP Whitelisted'
  },
  {
    id: 'TC-07',
    key: 'legit_high_value_ma',
    name: 'High-Value M&A Wire ($750k)',
    group: 'LEGITIMATE_TREASURY',
    reference: 'Robert Sterling CEO • SOX ZK Challenge',
    amount: '$750,000',
    type: 'clean',
    badge: 'Dual-Control ZK'
  },
  {
    id: 'TC-09',
    key: 'legit_sub_threshold',
    name: 'Operational Fast-Track ($12k)',
    group: 'LEGITIMATE_TREASURY',
    reference: 'Standard Logistics Sub-Cap Disbursement',
    amount: '$12,000',
    type: 'clean',
    badge: 'Sub-SOX Fast-Track'
  },

  // 3. Stress & False Positive Testing
  {
    id: 'TC-08',
    key: 'legit_stressed_outage',
    name: 'Stressed CFO Cloud Outage ($120k)',
    group: 'EDGE_CASE_TEST',
    reference: 'False Positive Resistance Benchmark',
    amount: '$120,000',
    type: 'clean',
    badge: 'Stress Resilient'
  },
  {
    id: 'TC-10',
    key: 'legit_legal_retainer',
    name: 'Corporate Legal Retainer ($85k)',
    group: 'EDGE_CASE_TEST',
    reference: 'Adidharma & Partners LLP Dual Sign',
    amount: '$85,000',
    type: 'clean',
    badge: 'Legal Dual-Sign'
  },
  {
    id: 'TC-14',
    key: 'legit_hesitant_board_wire',
    name: 'Hesitant Board Wire ($250k)',
    group: 'EDGE_CASE_TEST',
    reference: 'Human Latency & Natural Retrieval Pause',
    amount: '$250,000',
    type: 'clean',
    badge: 'Hesitation FP Test'
  }
];

export default function App() {
  const {
    connectionStatus,
    agentState,
    transcripts,
    toolCalls,
    escrowState,
    isMicActive,
    isScenarioRunning,
    latestThinking,
    activeScenarioMeta,
    triggerScenario,
    resetSession,
    startMic,
    stopMic,
    micLevel
  } = useVoiceSession();

  const [isScenarioMenuOpen, setIsScenarioMenuOpen] = useState(false);
  const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);

  const handleToggleMic = () => {
    if (isMicActive) {
      stopMic();
    } else {
      startMic();
    }
  };

  const handleSelectScenario = (key) => {
    setIsScenarioMenuOpen(false);
    triggerScenario(key);
  };

  const isConnected = connectionStatus === 'CONNECTED';

  return (
    <div className="h-screen max-h-screen bg-[#f8fafc] text-slate-900 flex flex-col overflow-hidden font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* 1. Sleek Minimalist Header (Single unified control bar) */}
      <header className="border-b border-slate-200/90 bg-white shrink-0 z-40 px-5 h-14 flex items-center justify-between shadow-2xs">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-xs">
            <Shield className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-900">
                SentinelVoice
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                Treasury Defense
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium block">
              Autonomous Wire Fraud & Deepfake Interrogator
            </span>
          </div>
        </div>

        {/* Center: Integrated Scenario Benchmark Selector (Opens DOWNWARDS) */}
        <div className="relative">
          <button
            onClick={() => setIsScenarioMenuOpen(!isScenarioMenuOpen)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 transition-all cursor-pointer shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="font-semibold">
              {activeScenarioMeta ? (
                <span className="text-slate-900">
                  <strong className="text-indigo-600 mr-1">[{activeScenarioMeta.id}]</strong>
                  {activeScenarioMeta.name}
                </span>
              ) : (
                'Benchmark Scenario Library (14)'
              )}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                isScenarioMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isScenarioMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsScenarioMenuOpen(false)}
              />
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 max-h-96 overflow-y-auto space-y-2 text-left font-sans animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 border-b border-slate-100 flex items-center justify-between">
                  <span>Red-Team Attack & Treasury Matrix</span>
                  <span className="text-[10px] font-mono text-indigo-600">14 Scenarios</span>
                </div>

                {/* Group 1: Attacks */}
                <div>
                  <div className="px-2 py-1 text-[10.5px] font-semibold text-rose-700 flex items-center gap-1.5">
                    <Flame className="w-3 h-3 text-rose-600" />
                    <span>Adversarial Deepfake / BEC Attacks (8)</span>
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {SCENARIOS.filter((s) => s.group === 'ADVERSARIAL_ATTACK').map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectScenario(s.key)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-rose-50/70 border border-transparent hover:border-rose-100 flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 group-hover:text-rose-900 truncate">
                            <span className="font-mono text-[10px] text-rose-600 font-bold mr-1.5">{s.id}</span>
                            {s.name}
                          </div>
                          <div className="text-[10.5px] text-slate-500 truncate">{s.reference}</div>
                        </div>
                        <span className="text-[9.5px] font-mono bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">
                          {s.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Group 2: Legitimate */}
                <div>
                  <div className="px-2 py-1 text-[10.5px] font-semibold text-emerald-700 flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-emerald-600" />
                    <span>Legitimate Treasury Clearances (3)</span>
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {SCENARIOS.filter((s) => s.group === 'LEGITIMATE_TREASURY').map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectScenario(s.key)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-emerald-50/70 border border-transparent hover:border-emerald-100 flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 group-hover:text-emerald-900 truncate">
                            <span className="font-mono text-[10px] text-emerald-600 font-bold mr-1.5">{s.id}</span>
                            {s.name}
                          </div>
                          <div className="text-[10.5px] text-slate-500 truncate">{s.reference}</div>
                        </div>
                        <span className="text-[9.5px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                          {s.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Group 3: Edge Case / False Positive */}
                <div>
                  <div className="px-2 py-1 text-[10.5px] font-semibold text-amber-700 flex items-center gap-1.5">
                    <FileCheck2 className="w-3 h-3 text-amber-600" />
                    <span>Stress & False Positive Tests (3)</span>
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {SCENARIOS.filter((s) => s.group === 'EDGE_CASE_TEST').map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectScenario(s.key)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-amber-50/70 border border-transparent hover:border-amber-100 flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 group-hover:text-amber-900 truncate">
                            <span className="font-mono text-[10px] text-amber-600 font-bold mr-1.5">{s.id}</span>
                            {s.name}
                          </div>
                          <div className="text-[10.5px] text-slate-500 truncate">{s.reference}</div>
                        </div>
                        <span className="text-[9.5px] font-mono bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                          {s.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Actions (Enroll Voice, Reset, Mic, Status) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEnrollmentOpen(true)}
            title="Enroll / Calibrate Executive Voiceprint (SQLite Vault)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
          >
            <Fingerprint className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Enroll Voice</span>
          </button>

          <button
            onClick={resetSession}
            title="Reset active call and escrow state"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition-all cursor-pointer shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            onClick={handleToggleMic}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border cursor-pointer active:scale-[0.98] shadow-2xs ${
              isMicActive
                ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            {isMicActive ? (
              <MicOff className="w-3.5 h-3.5 text-white" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>{isMicActive ? 'Mute' : 'Live Mic'}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-600 shadow-2xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="text-[11px] font-medium hidden md:inline">
              {isConnected ? 'Active' : 'Connecting'}
            </span>
          </div>
        </div>
      </header>

      {/* 2. Main High-Efficiency 2-Column Workspace (100% visible height, no outer scrollbar) */}
      <main className="flex-1 min-h-0 p-3.5 grid grid-cols-1 xl:grid-cols-12 gap-3.5 overflow-hidden">
        {/* Left Column (7 cols): Full-Height Interrogation Stage & Conversation */}
        <div className="xl:col-span-7 flex flex-col min-h-0 h-full">
          <LiveVoiceRoom
            agentState={agentState}
            transcripts={transcripts}
            toolCalls={toolCalls}
            escrowState={escrowState}
            isMicActive={isMicActive}
            isScenarioRunning={isScenarioRunning}
            latestThinking={latestThinking}
            activeScenarioMeta={activeScenarioMeta}
            micLevel={micLevel}
            onToggleMic={handleToggleMic}
            onTriggerScenario={triggerScenario}
            onReset={resetSession}
          />
        </div>

        {/* Right Column (5 cols): Banking Vault & Decision Graph */}
        <div className="xl:col-span-5 flex flex-col gap-3.5 min-h-0 h-full overflow-hidden">
          <EscrowStatusCard escrowState={escrowState} />
          <ReasoningGraphHUD
            toolCalls={toolCalls}
            escrowState={escrowState}
            latestThinking={latestThinking}
            activeScenarioMeta={activeScenarioMeta}
            onTriggerScenario={triggerScenario}
          />
        </div>
      </main>

      {/* 3. Executive Voiceprint Enrollment Modal (SQLite Biometric Vault) */}
      <VoiceEnrollmentModal
        isOpen={isEnrollmentOpen}
        onClose={() => setIsEnrollmentOpen(false)}
      />
    </div>
  );
}
