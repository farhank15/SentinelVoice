import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  ChevronDown,
  Layers,
  Shield,
  Flame,
  FileCheck2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

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
  }
];

export function SimulationControls({
  onTriggerScenario,
  isMicActive,
  onToggleMic,
  activeScenarioMeta = null
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSelectAndRun = (scenario) => {
    setIsDropdownOpen(false);
    onTriggerScenario(scenario.key);
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl px-4 py-2 flex items-center justify-between gap-3 shadow-xs relative select-none z-30">
      {/* Left: Section Indicator & Active Scenario status */}
      <div className="flex items-center gap-2.5 text-xs min-w-0">
        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
        <span className="font-semibold tracking-tight text-slate-900 shrink-0">
          Red-Team Benchmark Suite
        </span>

        {activeScenarioMeta ? (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono truncate">
            <span className="font-bold text-indigo-600">[{activeScenarioMeta.id}]</span>
            <span className="truncate">{activeScenarioMeta.name}</span>
          </div>
        ) : (
          <span className="text-slate-400 text-xs hidden sm:inline">
            Select a benchmark scenario from the library to test autonomous defense
          </span>
        )}
      </div>

      {/* Right: Clean Dropdown & Microphone Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Full 10-Scenario Dropdown (Drops DOWNWARDS) */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/90 transition-all cursor-pointer shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="font-semibold">Scenario Library (10)</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isDropdownOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsDropdownOpen(false)}
              />

              {/* Dropdown Menu - Opens DOWNWARDS below button */}
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 max-h-96 overflow-y-auto space-y-2 text-left font-sans animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 border-b border-slate-100 flex items-center justify-between">
                  <span>Canonical Attack & Treasury Matrix</span>
                  <span className="text-[10px] font-mono text-indigo-600">10 Scenarios</span>
                </div>

                {/* Group 1: Attacks */}
                <div>
                  <div className="px-2 py-1 text-[10.5px] font-semibold text-rose-700 flex items-center gap-1.5">
                    <Flame className="w-3 h-3 text-rose-600" />
                    <span>Adversarial Deepfake / BEC Attacks (5)</span>
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {SCENARIOS.filter((s) => s.group === 'ADVERSARIAL_ATTACK').map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectAndRun(s)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-rose-50/70 border border-transparent hover:border-rose-100 flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 group-hover:text-rose-900 truncate">
                            <span className="font-mono text-[10px] text-rose-600 font-bold mr-1.5">
                              {s.id}
                            </span>
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
                        onClick={() => handleSelectAndRun(s)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-emerald-50/70 border border-transparent hover:border-emerald-100 flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 group-hover:text-emerald-900 truncate">
                            <span className="font-mono text-[10px] text-emerald-600 font-bold mr-1.5">
                              {s.id}
                            </span>
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
                    <span>Stress & Governance Edge Cases (2)</span>
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {SCENARIOS.filter((s) => s.group === 'EDGE_CASE_TEST').map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectAndRun(s)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all hover:bg-amber-50/70 border border-transparent hover:border-amber-100 flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 group-hover:text-amber-900 truncate">
                            <span className="font-mono text-[10px] text-amber-600 font-bold mr-1.5">
                              {s.id}
                            </span>
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

        <div className="h-4 w-px bg-slate-200 hidden sm:block mx-0.5" />

        {/* Live Microphone Channel */}
        <button
          onClick={onToggleMic}
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
          <span>{isMicActive ? 'Mute Mic' : 'Live Mic'}</span>
        </button>
      </div>
    </div>
  );
}
