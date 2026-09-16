import React, { useState, useEffect, useRef } from 'react';
import {
  Workflow,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Sliders,
  Sparkles,
  ArrowRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Lock,
  PhoneCall,
  Database,
  Radio,
  BellRing,
  DollarSign,
  TrendingUp,
  Fingerprint,
  GitFork,
  Search,
  Filter,
  Check,
  ChevronRight,
  FileCheck2,
  Server,
  KeyRound,
  FileSearch,
  History,
  Award,
  RefreshCw,
  Flame
} from 'lucide-react';

/**
 * Enterprise 12-Node Institutional Banking & Treasury DAG Architecture
 * Formulated from NIST SP 800-63B, SWIFT Customer Security Programme (CSP),
 * Kyriba Treasury Management, and MITRE ATT&CK T1566/T1656.
 *
 * Tier 1: Telephony Signaling & Ingress Telemetry (N1)
 * Tier 2: Acoustic DSP & Biometric Voiceprint Match (N2, N3)
 * Tier 3: Semantic Intent & Behavioral BEC Classifier (N4, N5)
 * Tier 4: ERP Whitelist, AML/OFAC & SOX Liquidity (N6, N7, N8)
 * Tier 5: Zero-Knowledge Multi-Factor Interrogation (N9, N10)
 * Tier 6: Dual-Control Escrow & CISO SIEM Audit Vault (N11, N12)
 */
export function ReasoningTopologyStudio({
  toolCalls = [],
  escrowState = {},
  agentState = 'IDLE',
  latestThinking = null,
  activeScenarioMeta = null,
  onTriggerScenario,
  onReset
}) {
  // Navigation & View States
  const [selectedNodeId, setSelectedNodeId] = useState('n6');
  const [activeTab, setActiveTab] = useState('benchmark'); // 'patterns' | 'tuning' | 'predictive' | 'benchmark'
  const [patternCategory, setPatternCategory] = useState('all');
  const [patternSearchQuery, setPatternSearchQuery] = useState('');
  const [activePreset, setActivePreset] = useState('strict');

  // Progressive Traversal Animation Engine (Step 0 = Standby, 1-9 = Active Sequential Traversal)
  const [traversalStep, setTraversalStep] = useState(0);
  const [activeScenarioType, setActiveScenarioType] = useState(null); // 'threat' | 'clean' | null
  const [isPlayingAuto, setIsPlayingAuto] = useState(false);
  const autoStepTimerRef = useRef(null);

  // Bayesian Edge Weights & Pattern Sensitivity Calibration
  const [edgeWeights, setEdgeWeights] = useState({
    w_ingress_acoustic: 0.96,
    w_acoustic_bio: 0.94,
    w_bio_semantic: 0.91,
    w_semantic_erp: 0.95,
    w_erp_aml: 0.93,
    w_erp_bec: 0.94,
    w_sox_zk: 0.96,
    w_zk_oob: 0.92,
    w_oob_freeze: 0.99,
    w_zk_release: 0.98,
    w_terminal_siem: 0.99
  });

  const [patternSensitivities, setPatternSensitivities] = useState({
    coercionTolerance: 0.15,
    urgencyTolerance: 0.20,
    syntheticThreshold: 0.82,
    soxThresholdAmount: 50000,
    amlStrictness: 0.98
  });

  // Automated Benchmark Suite State
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [isLoadingBenchmark, setIsLoadingBenchmark] = useState(false);

  useEffect(() => {
    fetch('/api/benchmark/latest')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.summary) setBenchmarkData(data);
      })
      .catch((err) => console.warn('[Benchmark fetch error]', err));
  }, []);

  const runFullBenchmark = async () => {
    setIsLoadingBenchmark(true);
    try {
      const res = await fetch('/api/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tuning_config: patternSensitivities })
      });
      const data = await res.json();
      if (data && data.summary) {
        setBenchmarkData(data);
      }
    } catch (err) {
      console.error('[Run Benchmark error]', err);
    } finally {
      setIsLoadingBenchmark(false);
    }
  };

  // Particle animation ticker
  const [animTick, setAnimTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimTick((t) => (t + 1) % 100);
    }, 45);
    return () => clearInterval(timer);
  }, []);

  // Automated Sequential Traversal Timer across 9 Stages
  useEffect(() => {
    if (isPlayingAuto && activeScenarioType) {
      autoStepTimerRef.current = setTimeout(() => {
        setTraversalStep((prev) => {
          if (prev >= 9) {
            setIsPlayingAuto(false);
            return 9;
          }
          return prev + 1;
        });
      }, 1400); // 1.4s per stage
    }
    return () => {
      if (autoStepTimerRef.current) clearTimeout(autoStepTimerRef.current);
    };
  }, [isPlayingAuto, traversalStep, activeScenarioType]);

  // Sync with live session events if live call occurs
  const hasLedgerCheck = toolCalls.some((c) => c.toolName === 'verify_corporate_ledger');
  const hasChallenge = toolCalls.some((c) => c.toolName === 'issue_security_challenge');
  const hasOutOfBand = toolCalls.some((c) => c.toolName === 'trigger_out_of_band_verification');
  const isFrozen = escrowState.status === 'FROZEN' || toolCalls.some((c) => c.toolName === 'emergency_escrow_freeze');
  const isReleased = escrowState.status === 'RELEASED' || toolCalls.some((c) => c.toolName === 'release_escrow_transfer');

  // Trigger Progressive Scenario with sequential steps
  const startProgressiveScenario = (type) => {
    setActiveScenarioType(type);
    setTraversalStep(1);
    setIsPlayingAuto(true);
    if (type === 'threat') {
      onTriggerScenario && onTriggerScenario('ferrari_ceo_deepfake');
    } else {
      onTriggerScenario && onTriggerScenario('legit_routine_invoice');
    }
  };

  const handleReset = () => {
    if (autoStepTimerRef.current) clearTimeout(autoStepTimerRef.current);
    setIsPlayingAuto(false);
    setTraversalStep(0);
    setActiveScenarioType(null);
    onReset && onReset();
  };

  // Determine progressive node state based on current step in 12-Node Pipeline
  const getNodeState = (nodeId) => {
    if (traversalStep === 0) {
      if (isFrozen) return 'ANOMALY';
      if (isReleased) return 'VERIFIED';
      return 'IDLE';
    }

    const isThreat = activeScenarioType === 'threat' || isFrozen;

    switch (nodeId) {
      case 'n1': // SIP Telemetry
        return traversalStep >= 1 ? 'VERIFIED' : 'IDLE';
      case 'n2': // Acoustic Liveness DSP
        if (traversalStep === 1) return 'IDLE';
        if (traversalStep === 2) return 'ACTIVE';
        return isThreat ? 'ANOMALY' : 'VERIFIED';
      case 'n3': // Enrolled Voiceprint Biometrics
        if (traversalStep < 3) return 'IDLE';
        if (traversalStep === 3) return 'ACTIVE';
        return isThreat ? 'ANOMALY' : 'VERIFIED';
      case 'n4': // Semantic Intent Parsing
        if (traversalStep < 4) return 'IDLE';
        if (traversalStep === 4) return 'ACTIVE';
        return 'VERIFIED';
      case 'n5': // BEC Psychological Coercion
        if (!isThreat) return 'IDLE';
        if (traversalStep < 6) return 'IDLE';
        if (traversalStep === 6) return 'ACTIVE';
        return 'ANOMALY';
      case 'n6': // ERP Vendor Whitelist
        if (traversalStep < 5) return 'IDLE';
        if (traversalStep === 5) return 'ACTIVE';
        return isThreat ? 'ANOMALY' : 'VERIFIED';
      case 'n7': // AML / OFAC Screening
        if (traversalStep < 5) return 'IDLE';
        if (traversalStep === 5) return 'ACTIVE';
        return isThreat ? 'ANOMALY' : 'VERIFIED';
      case 'n8': // SOX Liquidity Threshold Gate
        if (isThreat) return 'IDLE';
        if (traversalStep < 6) return 'IDLE';
        if (traversalStep === 6) return 'ACTIVE';
        return 'VERIFIED';
      case 'n9': // Zero-Knowledge Verbal Challenge
        if (traversalStep < 7) return 'IDLE';
        if (traversalStep === 7) return 'ACTIVE';
        return isThreat ? 'ANOMALY' : 'VERIFIED';
      case 'n10': // Out-of-Band Hardware Alert
        if (!isThreat) return 'IDLE';
        if (traversalStep < 8) return 'IDLE';
        if (traversalStep === 8) return 'ACTIVE';
        return 'ANOMALY';
      case 'n11': // Escrow Settlement Engine
        if (traversalStep < 9) return 'IDLE';
        return isThreat ? 'ANOMALY' : 'VERIFIED';
      case 'n12': // CISO SIEM Audit Vault
        if (traversalStep < 9) return 'IDLE';
        return isThreat ? 'ANOMALY' : 'VERIFIED';
      default:
        return 'IDLE';
    }
  };

  // 12 Canonical Banking Nodes across 6 Governance Zones
  const nodes = [
    {
      id: 'n1',
      title: 'N1: SIP Telemetry',
      subtitle: 'RFC 8588 Ingress',
      tier: 'Zone 1: Telephony Ingress',
      icon: PhoneCall,
      x: 65,
      y: 120,
      state: getNodeState('n1'),
      guard: 'SIP_ORIGIN == WHITELISTED && Jitter < 30ms',
      nextProbabilities: [
        { target: 'n2', label: 'Acoustic DSP Stream', prob: 0.50, type: 'normal' },
        { target: 'n3', label: 'Voiceprint Match Probe', prob: 0.50, type: 'normal' }
      ],
      description: 'Intercepts incoming live telephony stream. Verifies STIR/SHAKEN cryptographic identity tokens, carrier latency jitter, and VoIP origin.'
    },
    {
      id: 'n2',
      title: 'N2: Acoustic Liveness',
      subtitle: 'ASVspoof Vocoder DSP',
      tier: 'Zone 2: Voice Biometrics (NIST)',
      icon: Radio,
      x: 185,
      y: 70,
      state: getNodeState('n2'),
      guard: 'Vocoder_Tilt < 0.30 && Respiratory_Breath == ORGANIC',
      nextProbabilities: [
        { target: 'n4', label: 'Semantic Extraction Gate', prob: 0.94, type: 'normal' }
      ],
      description: 'Continuous spectral analysis per ASVspoof standards. Detects neural speech generator artifacts and respiratory breath suppression.'
    },
    {
      id: 'n3',
      title: 'N3: Voiceprint 1:1',
      subtitle: 'NIST Biometrics Match',
      tier: 'Zone 2: Voice Biometrics (NIST)',
      icon: Fingerprint,
      x: 185,
      y: 170,
      state: getNodeState('n3'),
      guard: 'Cosine_Similarity(Embedding, Vault_Template) > 0.88',
      nextProbabilities: [
        { target: 'n4', label: 'Intent Extraction Gate', prob: 0.88, type: 'normal' },
        { target: 'n5', label: 'Biometric Mismatch ➔ BEC Classifier', prob: 0.12, type: 'threat' }
      ],
      description: 'Compares real-time Mel-Frequency Cepstral Coefficients (MFCC) embedding against the enrolled executive voiceprint template.'
    },
    {
      id: 'n4',
      title: 'N4: Wire Intent',
      subtitle: 'Semantic Entity Extraction',
      tier: 'Zone 3: Cognitive & Intent',
      icon: FileSearch,
      x: 310,
      y: 70,
      state: getNodeState('n4'),
      guard: 'Extract(Beneficiary, Amount, Currency) == COMPLETE',
      nextProbabilities: [
        { target: 'n6', label: 'ERP Master Whitelist Lookup', prob: 0.85, type: 'normal' },
        { target: 'n7', label: 'Sanctions / AML Screening', prob: 0.15, type: 'normal' }
      ],
      description: 'Natural language parsing of wire transfer instructions. Extracts beneficiary account number, vendor name, and dollar valuation.'
    },
    {
      id: 'n5',
      title: 'N5: BEC Classifier',
      subtitle: 'MITRE T1566 Defense',
      tier: 'Zone 3: Cognitive & Intent',
      icon: ShieldAlert,
      x: 310,
      y: 170,
      state: getNodeState('n5'),
      guard: 'Authority_Intimidation < 0.15 && Urgency_Pressure < 0.20',
      nextProbabilities: [
        { target: 'n9', label: 'Zero-Knowledge Verbal Interrogation', prob: 0.82, type: 'threat' },
        { target: 'n10', label: 'Direct Out-of-Band Incident Push', prob: 0.18, type: 'threat' }
      ],
      description: 'Real-time NLP sentiment and intent classifier. Flags psychological pressure, authority exploitation, and forced secrecy demands.'
    },
    {
      id: 'n6',
      title: 'N6: ERP Whitelist',
      subtitle: 'Master Vendor Database',
      tier: 'Zone 4: Treasury & Compliance',
      icon: Database,
      x: 435,
      y: 70,
      state: getNodeState('n6'),
      guard: 'ERP_RECORD_EXISTS == TRUE && IBAN_MATCH == TRUE',
      nextProbabilities: [
        { target: 'n8', label: 'Whitelisted ➔ SOX Threshold Gate', prob: 0.78, type: 'clean' },
        { target: 'n5', label: 'Unregistered ➔ BEC Threat Escalation', prob: 0.22, type: 'threat' }
      ],
      description: 'Cross-checks payee banking details against the corporate ERP master vendor database (SAP/NetSuite). Unregistered accounts escalate.'
    },
    {
      id: 'n7',
      title: 'N7: AML / OFAC',
      subtitle: 'Sanctions & Jurisdiction',
      tier: 'Zone 4: Treasury & Compliance',
      icon: Shield,
      x: 435,
      y: 170,
      state: getNodeState('n7'),
      guard: 'OFAC_Sanctions_Hit == FALSE && FATF_High_Risk == FALSE',
      nextProbabilities: [
        { target: 'n8', label: 'Sanctions Cleared ➔ SOX Gate', prob: 0.95, type: 'clean' },
        { target: 'n10', label: 'Sanctions Hit ➔ CISO Hardware Alert', prob: 0.05, type: 'threat' }
      ],
      description: 'Automated screening of beneficiary institution and routing country against US OFAC SDN and FATF anti-money laundering blacklists.'
    },
    {
      id: 'n8',
      title: 'N8: SOX Gate',
      subtitle: 'Dual-Control ($50k Cap)',
      tier: 'Zone 5: Zero-Trust Challenge',
      icon: DollarSign,
      x: 565,
      y: 65,
      state: getNodeState('n8'),
      guard: 'Amount <= 50,000 USD || Dual_Sign_Escrow == ARMED',
      nextProbabilities: [
        { target: 'n9', label: 'Exceeds $50k ➔ ZK Verbal Challenge', prob: 0.96, type: 'threat' },
        { target: 'n11', label: 'Sub-Threshold ➔ Fast-Track Release', prob: 0.04, type: 'clean' }
      ],
      description: 'Enforces Sarbanes-Oxley 404 corporate governance. Any transfer exceeding $50,000 requires multi-party dual authorization.'
    },
    {
      id: 'n9',
      title: 'N9: ZK Challenge',
      subtitle: 'Cryptographic Passphrase',
      tier: 'Zone 5: Zero-Trust Challenge',
      icon: KeyRound,
      x: 565,
      y: 120,
      state: getNodeState('n9'),
      guard: 'Spoken_PIN_Hash == Executive_Secret_Salt',
      nextProbabilities: [
        { target: 'n11', label: 'PIN Verified ➔ Clear Escrow Release', prob: 0.98, type: 'clean' },
        { target: 'n10', label: 'Challenge Refused / Failed ➔ OOB Push', prob: 0.92, type: 'threat' }
      ],
      description: 'Verbal zero-knowledge interrogation. Poses shared secrets known exclusively to the authentic executive. Synthetic clones fail.'
    },
    {
      id: 'n10',
      title: 'N10: OOB Alert',
      subtitle: 'FIDO2 / CISO Push Alert',
      tier: 'Zone 5: Zero-Trust Challenge',
      icon: BellRing,
      x: 565,
      y: 175,
      state: getNodeState('n10'),
      guard: 'Push_Status == DISPATCHED && Slack_Incident == TRUE',
      nextProbabilities: [
        { target: 'n11', label: 'Incident Confirmed ➔ EMERGENCY FREEZE', prob: 0.99, type: 'threat' }
      ],
      description: 'Bypasses voice telephony by broadcasting an encrypted emergency push verification alert to the genuine executive hardware token.'
    },
    {
      id: 'n11',
      title: 'N11: Dual Settlement',
      subtitle: 'SWIFT ISO 20022 Escrow',
      tier: 'Zone 6: Dual-Control Settlement',
      icon: Zap,
      x: 700,
      y: 70,
      state: getNodeState('n11'),
      guard: 'Escrow_State ∈ { HARD_FREEZE, DUAL_RELEASE }',
      nextProbabilities: [
        { target: 'n12', label: 'Dispatch Immutable Forensic Trail', prob: 1.0, type: 'normal' }
      ],
      description: 'The final settlement execution engine. Unilaterally FREEZES funds in escrow upon anomaly, or releases funds upon dual-sign.'
    },
    {
      id: 'n12',
      title: 'N12: SIEM Vault',
      subtitle: 'SHA-256 Audit Ledger',
      tier: 'Zone 6: Dual-Control Settlement',
      icon: Server,
      x: 700,
      y: 170,
      state: getNodeState('n12'),
      guard: 'SHA256_Audit_Hash == SIGNED && SIEM_Ingested == TRUE',
      nextProbabilities: [
        { target: 'terminal', label: 'Archival Retention Complete', prob: 1.0, type: 'normal' }
      ],
      description: 'Cryptographically locks forensic audio telemetry, session transcript, and tool decision traces into the immutable corporate SIEM ledger.'
    }
  ];

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[5];

  // 9-Stage Traversal Meta
  const traversalStagesMeta = [
    { num: 1, label: 'Ingress (N1)', node: 'n1' },
    { num: 2, label: 'Liveness (N2)', node: 'n2' },
    { num: 3, label: 'Voiceprint (N3)', node: 'n3' },
    { num: 4, label: 'Intent (N4)', node: 'n4' },
    { num: 5, label: 'ERP & AML (N6,N7)', node: 'n6' },
    { num: 6, label: 'Behavioral & SOX (N5,N8)', node: activeScenarioType === 'threat' ? 'n5' : 'n8' },
    { num: 7, label: 'ZK Challenge (N9)', node: 'n9' },
    { num: 8, label: 'OOB Alert (N10)', node: 'n10' },
    { num: 9, label: 'Settlement & SIEM (N11,N12)', node: 'n11' }
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#070b14] text-slate-100 overflow-hidden select-none font-sans">
      {/* 1. Header Toolbar */}
      <div className="border-b border-slate-800/80 bg-[#0b0f19] px-6 py-2 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold font-mono tracking-wider uppercase text-white">
                Enterprise Treasury DAG Architecture
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                12-Node Institutional Pipeline
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400 font-mono">
              6 Governance Zones • NIST SP 800-63B • SWIFT CSP • Kyriba TMS
            </p>
          </div>
        </div>

        {/* Action Controls: Sequential Scenario Launchers & Reset */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => startProgressiveScenario('threat')}
            className="px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-600/50 hover:bg-rose-900/60 text-rose-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Run Step-by-Step Deepfake BEC Coercion Scenario"
          >
            <Play className="w-3 h-3 text-rose-400 fill-rose-400" />
            <span>Simulate BEC Attack</span>
          </button>
          <button
            onClick={() => startProgressiveScenario('clean')}
            className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-600/50 hover:bg-emerald-900/60 text-emerald-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Run Step-by-Step Genuine CFO Dual-Approval Scenario"
          >
            <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
            <span>Simulate Genuine CFO</span>
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
            title="Reset Graph to Standby"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Traversal Scrubber Ribbon */}
      <div className="bg-[#090d16] border-b border-slate-800/80 px-6 py-2 flex items-center justify-between shrink-0 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
            Stage Sequence:
          </span>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setIsPlayingAuto((p) => !p)}
              disabled={traversalStep === 0}
              className="px-2 py-1 rounded text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer flex items-center gap-1"
            >
              {isPlayingAuto ? <Pause className="w-3 h-3 text-amber-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
              <span className="text-[10px]">{isPlayingAuto ? 'Pause' : 'Play'}</span>
            </button>
            <div className="h-3 w-px bg-slate-800 mx-1" />
            <button
              onClick={() => setTraversalStep((s) => Math.min(s + 1, 9))}
              disabled={traversalStep >= 9}
              className="px-2 py-1 rounded text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer flex items-center gap-1"
            >
              <span className="text-[10px]">Next Stage</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 9-Stage Scrubber Pills */}
        <div className="flex items-center gap-1 text-[10px] overflow-x-auto max-w-[65%] py-0.5">
          {traversalStagesMeta.map((stage) => {
            const isCompleted = traversalStep > stage.num;
            const isCurrent = traversalStep === stage.num;
            return (
              <button
                key={stage.num}
                onClick={() => setTraversalStep(stage.num)}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap border ${
                  isCurrent
                    ? 'bg-indigo-600 border-indigo-400 text-white font-bold shadow-sm shadow-indigo-950/80 animate-pulse'
                    : isCompleted
                    ? 'bg-slate-800/90 border-slate-700 text-slate-300'
                    : 'bg-slate-900/50 border-slate-800/60 text-slate-500 hover:text-slate-300'
                }`}
              >
                <span>{stage.num}.</span>
                <span>{stage.label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-400">
          {traversalStep === 0 ? (
            <span className="text-slate-500 italic">Standby • Click Simulate above</span>
          ) : (
            <span className="text-cyan-300 font-semibold">
              Stage {traversalStep}/9 Active
            </span>
          )}
        </div>
      </div>

      {/* 3. Main Workspace: Canvas (60%) + Pattern & Governance Hub (40%) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* Left Column: Structured 6-Zone 12-Node Directed Acyclic Graph Canvas */}
        <div className="xl:col-span-7 flex flex-col min-h-0 bg-[#080c16] border border-slate-800/80 rounded-xl shadow-xl overflow-hidden relative">
          <div className="px-4 py-2 border-b border-slate-800/70 bg-slate-900/60 flex items-center justify-between shrink-0 font-mono text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Structured 6-Zone Banking Architecture</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-600" /> Idle
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" /> Active
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Verified
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Anomaly
              </span>
            </div>
          </div>

          {/* SVG Canvas with 6 Structured Columns (Zones) */}
          <div className="flex-1 relative flex items-center justify-center p-2 min-h-0 bg-[#070a12]">
            <svg
              viewBox="0 0 780 250"
              className="w-full h-full max-h-[520px]"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <marker id="arrowActive" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 1, 6 3, 0 5" fill="#6366f1" />
                </marker>
                <marker id="arrowThreat" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 1, 6 3, 0 5" fill="#f43f5e" />
                </marker>
                <marker id="arrowVerified" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 1, 6 3, 0 5" fill="#10b981" />
                </marker>
                <marker id="arrowIdle" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 1, 6 3, 0 5" fill="#334155" />
                </marker>
                <marker id="arrowBranch" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <polygon points="0 1, 6 3, 0 5" fill="#38bdf8" />
                </marker>
              </defs>

              {/* 6 STRUCTURED GOVERNANCE ZONE CONTAINERS */}
              {/* Zone 1: Ingress */}
              <rect x="15" y="15" width="100" height="215" rx="8" fill="#090d16" stroke="#1e293b" strokeDasharray="3 3" />
              <text x="65" y="32" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace" fontWeight="bold">ZONE 1: INGRESS</text>

              {/* Zone 2: Biometrics */}
              <rect x="125" y="15" width="115" height="215" rx="8" fill="#090d16" stroke="#1e293b" strokeDasharray="3 3" />
              <text x="182" y="32" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace" fontWeight="bold">ZONE 2: BIOMETRICS</text>

              {/* Zone 3: Cognitive */}
              <rect x="250" y="15" width="115" height="215" rx="8" fill="#090d16" stroke="#1e293b" strokeDasharray="3 3" />
              <text x="307" y="32" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace" fontWeight="bold">ZONE 3: COGNITIVE</text>

              {/* Zone 4: Treasury */}
              <rect x="375" y="15" width="115" height="215" rx="8" fill="#090d16" stroke="#1e293b" strokeDasharray="3 3" />
              <text x="432" y="32" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace" fontWeight="bold">ZONE 4: TREASURY</text>

              {/* Zone 5: Challenge */}
              <rect x="500" y="15" width="125" height="215" rx="8" fill="#090d16" stroke="#1e293b" strokeDasharray="3 3" />
              <text x="562" y="32" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace" fontWeight="bold">ZONE 5: ZERO-TRUST</text>

              {/* Zone 6: Settlement */}
              <rect x="635" y="15" width="130" height="215" rx="8" fill="#090d16" stroke="#1e293b" strokeDasharray="3 3" />
              <text x="700" y="32" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace" fontWeight="bold">ZONE 6: SETTLEMENT</text>

              {/* DIRECTED EDGES (Strictly Left-to-Right, No Spaghetti) */}
              {/* 1. N1 Ingress Fork: N1 -> N2 (Top) & N1 -> N3 (Bottom) */}
              <path d="M 85 110 L 165 70" stroke={traversalStep >= 2 ? '#10b981' : '#1e293b'} strokeWidth="1.5" markerEnd={traversalStep >= 2 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} fill="none" />
              <path d="M 85 130 L 165 170" stroke={traversalStep >= 3 ? (activeScenarioType === 'threat' ? '#f43f5e' : '#10b981') : '#1e293b'} strokeWidth="1.5" markerEnd={traversalStep >= 3 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} fill="none" />

              {/* 2. Biometric to Cognitive: N2 -> N4 & N3 -> N5 */}
              <line x1="205" y1="70" x2="290" y2="70" stroke={traversalStep >= 4 ? '#10b981' : '#1e293b'} strokeWidth="1.5" markerEnd={traversalStep >= 4 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} />
              <line x1="205" y1="170" x2="290" y2="170" stroke={activeScenarioType === 'threat' && traversalStep >= 6 ? '#f43f5e' : '#1e293b'} strokeWidth="1.5" markerEnd={activeScenarioType === 'threat' && traversalStep >= 6 ? 'url(#arrowThreat)' : 'url(#arrowIdle)'} />

              {/* 3. Cognitive to Treasury: N4 -> N6 & N4 -> N7 */}
              <line x1="330" y1="70" x2="415" y2="70" stroke={traversalStep >= 5 ? '#10b981' : '#1e293b'} strokeWidth="1.5" markerEnd={traversalStep >= 5 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} />
              <path d="M 330 75 L 415 165" stroke={activeScenarioType === 'clean' && traversalStep >= 5 ? '#10b981' : '#1e293b'} strokeWidth="1.5" markerEnd={activeScenarioType === 'clean' && traversalStep >= 5 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} fill="none" />

              {/* 4. Treasury to Zero-Trust: */}
              {/* N6 (Whitelisted) -> N8 (SOX Gate) */}
              <line x1="455" y1="70" x2="545" y2="65" stroke={activeScenarioType === 'clean' && traversalStep >= 6 ? '#10b981' : '#1e293b'} strokeWidth="1.5" markerEnd={activeScenarioType === 'clean' && traversalStep >= 6 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} />
              {/* N6 (Threat/Unregistered) -> N5/N10 */}
              <path d="M 435 88 L 435 125 L 330 165" stroke={activeScenarioType === 'threat' && traversalStep >= 6 ? '#f43f5e' : '#1e293b'} strokeWidth="2" strokeDasharray={activeScenarioType === 'threat' && traversalStep >= 6 ? '3 3' : 'none'} markerEnd={activeScenarioType === 'threat' && traversalStep >= 6 ? 'url(#arrowThreat)' : 'url(#arrowIdle)'} fill="none" />

              {/* N8 -> N9 (SOX to ZK PIN) */}
              <line x1="565" y1="83" x2="565" y2="102" stroke={activeScenarioType === 'clean' && traversalStep >= 7 ? '#10b981' : '#1e293b'} strokeWidth="1.5" markerEnd={activeScenarioType === 'clean' && traversalStep >= 7 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} />
              {/* N5 -> N10 (BEC to OOB Alert) */}
              <line x1="330" y1="170" x2="545" y2="175" stroke={activeScenarioType === 'threat' && traversalStep >= 8 ? '#f43f5e' : '#1e293b'} strokeWidth="2" markerEnd={activeScenarioType === 'threat' && traversalStep >= 8 ? 'url(#arrowThreat)' : 'url(#arrowIdle)'} />

              {/* 5. Zero-Trust to Settlement: */}
              {/* N9 -> N11 (Verified Release) */}
              <path d="M 585 115 L 680 75" stroke={activeScenarioType === 'clean' && traversalStep >= 9 ? '#10b981' : '#1e293b'} strokeWidth="2" markerEnd={activeScenarioType === 'clean' && traversalStep >= 9 ? 'url(#arrowVerified)' : 'url(#arrowIdle)'} fill="none" />
              {/* N9 -> N10 (Failed Challenge) */}
              <line x1="565" y1="138" x2="565" y2="157" stroke={activeScenarioType === 'threat' && traversalStep >= 8 ? '#f43f5e' : '#1e293b'} strokeWidth="2" markerEnd={activeScenarioType === 'threat' && traversalStep >= 8 ? 'url(#arrowThreat)' : 'url(#arrowIdle)'} />
              {/* N10 -> N11 (Threat Freeze) */}
              <path d="M 585 175 L 680 80" stroke={activeScenarioType === 'threat' && traversalStep >= 9 ? '#f43f5e' : '#1e293b'} strokeWidth="2.5" markerEnd={activeScenarioType === 'threat' && traversalStep >= 9 ? 'url(#arrowThreat)' : 'url(#arrowIdle)'} fill="none" />
              {/* N11 -> N12 (SIEM Audit Trail) */}
              <line x1="700" y1="88" x2="700" y2="152" stroke={traversalStep >= 9 ? '#6366f1' : '#1e293b'} strokeWidth="2" markerEnd={traversalStep >= 9 ? 'url(#arrowActive)' : 'url(#arrowIdle)'} />

              {/* PREDICTIVE FORWARD BRANCH PROJECTIONS */}
              {selectedNode && (
                <g>
                  {selectedNode.nextProbabilities.map((branch, i) => {
                    const targetNode = nodes.find((n) => n.id === branch.target);
                    if (!targetNode) return null;
                    const strokeColor =
                      branch.type === 'threat'
                        ? '#f43f5e'
                        : branch.type === 'clean'
                        ? '#10b981'
                        : '#38bdf8';
                    return (
                      <g key={i}>
                        <line
                          x1={selectedNode.x}
                          y1={selectedNode.y}
                          x2={targetNode.x}
                          y2={targetNode.y}
                          stroke={strokeColor}
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                          markerEnd="url(#arrowBranch)"
                        />
                        <rect
                          x={(selectedNode.x + targetNode.x) / 2 - 14}
                          y={(selectedNode.y + targetNode.y) / 2 - 7}
                          width="28"
                          height="14"
                          rx="3"
                          fill="#090d16"
                          stroke={strokeColor}
                          strokeWidth="1"
                        />
                        <text
                          x={(selectedNode.x + targetNode.x) / 2}
                          y={(selectedNode.y + targetNode.y) / 2 + 3}
                          textAnchor="middle"
                          fill={strokeColor}
                          fontSize="8"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {Math.round(branch.prob * 100)}%
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* RENDER 12 NODES (Structured Geometric Discs) */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                let bgCircle = '#1e293b';
                let borderStroke = '#475569';

                if (node.state === 'VERIFIED') {
                  bgCircle = '#064e3b';
                  borderStroke = '#10b981';
                } else if (node.state === 'ANOMALY') {
                  bgCircle = '#881337';
                  borderStroke = '#f43f5e';
                } else if (node.state === 'ACTIVE') {
                  bgCircle = '#1e1b4b';
                  borderStroke = '#6366f1';
                }

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer transition-all duration-200"
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="22"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="3 2"
                      />
                    )}

                    <circle
                      cx={node.x}
                      cy={node.y}
                      r="16"
                      fill={bgCircle}
                      stroke={borderStroke}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />

                    <text
                      x={node.x}
                      y={node.y + 3.5}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="8.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {node.id.toUpperCase()}
                    </text>

                    <text
                      x={node.x}
                      y={node.y + 26}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="7.5"
                      fontFamily="sans-serif"
                      fontWeight="600"
                    >
                      {node.title.split(': ')[1]}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + 35}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="6.5"
                      fontFamily="monospace"
                    >
                      {node.state}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Canvas Footer */}
          <div className="px-4 py-2 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between font-mono text-[10.5px] text-slate-400 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 uppercase font-semibold">Active Node:</span>
              <span className="text-white font-bold">{selectedNode.title}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">{selectedNode.tier}</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Pipeline: 12-Node Multi-Tier Banking Standard
            </div>
          </div>
        </div>

        {/* Right Column: Node Inspector & Governance Hub (5 cols) */}
        <div className="xl:col-span-5 flex flex-col min-h-0 gap-2">
          {/* Switcher Tabs */}
          <div className="bg-[#0b0f19] border border-slate-800/90 rounded-lg p-1 flex items-center justify-between shrink-0 font-mono text-xs shadow-md">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('patterns')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'patterns'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Fingerprint className="w-3.5 h-3.5" />
                <span>Node Inspector</span>
              </button>
              <button
                onClick={() => setActiveTab('tuning')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'tuning'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Edge Tuning</span>
              </button>
              <button
                onClick={() => setActiveTab('predictive')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'predictive'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Branch Radar</span>
              </button>
              <button
                onClick={() => setActiveTab('benchmark')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'benchmark'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>Benchmark Matrix (10)</span>
              </button>
            </div>
          </div>

          {/* TAB 1: SELECTED NODE DEEP INSPECTOR */}
          {activeTab === 'patterns' && (
            <div className="bg-[#0b0f19] border border-slate-800/90 rounded-xl p-3.5 shadow-xl flex-1 flex flex-col min-h-0 overflow-y-auto font-mono text-xs">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-950/80 border border-indigo-700/60 flex items-center justify-center text-indigo-400">
                    <selectedNode.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wide">
                      {selectedNode.title}
                    </h3>
                    <span className="text-[10px] text-slate-400">{selectedNode.subtitle}</span>
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    selectedNode.state === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : selectedNode.state === 'ANOMALY'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : selectedNode.state === 'ACTIVE'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {selectedNode.state}
                </span>
              </div>

              {/* Node Specifications */}
              <div className="py-2.5 flex flex-col gap-2.5 font-sans">
                <p className="text-slate-300 text-[11.5px] leading-relaxed">
                  {selectedNode.description}
                </p>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1 font-mono text-[10.5px]">
                  <span className="text-slate-400 uppercase font-bold text-[9.5px]">
                    NIST / SWIFT Compliance Tier:
                  </span>
                  <span className="text-cyan-300 font-semibold">{selectedNode.tier}</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1 font-mono text-[10.5px]">
                  <span className="text-slate-400 uppercase font-bold text-[9.5px]">
                    Boolean Activation Guard:
                  </span>
                  <code className="text-emerald-400 bg-slate-950 p-1 rounded border border-slate-800 break-all text-[10px]">
                    {selectedNode.guard}
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BAYESIAN EDGE TUNING */}
          {activeTab === 'tuning' && (
            <div className="bg-[#0b0f19] border border-slate-800/90 rounded-xl p-3 shadow-xl flex-1 flex flex-col min-h-0 overflow-y-auto font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 shrink-0">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  12-Node Transition Tuning
                </span>
                <span className="text-[10px] text-slate-400">Bayesian Matrix</span>
              </div>

              <div className="flex flex-col gap-2.5 py-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-300">w_ingress_acoustic: N1 ➔ N2</span>
                  <span className="text-indigo-400 font-bold">{edgeWeights.w_ingress_acoustic}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.01"
                  value={edgeWeights.w_ingress_acoustic}
                  onChange={(e) => setEdgeWeights((p) => ({ ...p, w_ingress_acoustic: parseFloat(e.target.value) }))}
                  className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded appearance-none"
                />

                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-300">w_erp_bec: N6 ➔ N5</span>
                  <span className="text-rose-400 font-bold">{edgeWeights.w_erp_bec}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.01"
                  value={edgeWeights.w_erp_bec}
                  onChange={(e) => setEdgeWeights((p) => ({ ...p, w_erp_bec: parseFloat(e.target.value) }))}
                  className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded appearance-none"
                />

                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-300">w_oob_freeze: N10 ➔ N11</span>
                  <span className="text-rose-500 font-bold">{edgeWeights.w_oob_freeze}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.01"
                  value={edgeWeights.w_oob_freeze}
                  onChange={(e) => setEdgeWeights((p) => ({ ...p, w_oob_freeze: parseFloat(e.target.value) }))}
                  className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded appearance-none"
                />
              </div>
            </div>
          )}

          {/* TAB 3: PREDICTIVE DECISION RADAR */}
          {activeTab === 'predictive' && (
            <div className="bg-[#0b0f19] border border-slate-800/90 rounded-xl p-3 shadow-xl flex-1 flex flex-col min-h-0 overflow-y-auto font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 shrink-0">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Predictive Decision Radar
                </span>
                <span className="text-[10px] text-cyan-300">{selectedNode.id.toUpperCase()}</span>
              </div>

              <div className="py-2 flex flex-col gap-2.5">
                <p className="text-slate-400 text-[11px] font-sans leading-relaxed">
                  Proyeksi percabangan keputusan dari <span className="text-white font-bold">{selectedNode.title}</span>:
                </p>

                {selectedNode.nextProbabilities.map((branch, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-lg border flex flex-col gap-1.5 ${
                      branch.type === 'threat'
                        ? 'bg-rose-950/20 border-rose-600/40 text-rose-200'
                        : branch.type === 'clean'
                        ? 'bg-emerald-950/20 border-emerald-600/40 text-emerald-200'
                        : 'bg-indigo-950/20 border-indigo-600/40 text-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span className="flex items-center gap-1.5">
                        <ArrowRight className="w-3 h-3" />
                        <span>➔ {branch.target.toUpperCase()} ({branch.label})</span>
                      </span>
                      <span className="text-sm font-extrabold">{Math.round(branch.prob * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full ${
                          branch.type === 'threat' ? 'bg-rose-500' : branch.type === 'clean' ? 'bg-emerald-500' : 'bg-cyan-500'
                        }`}
                        style={{ width: `${branch.prob * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: BENCHMARK MATRIX */}
          {activeTab === 'benchmark' && (
            <div className="bg-[#0b0f19] border border-slate-800/90 rounded-xl p-3 shadow-xl flex-1 flex flex-col min-h-0 overflow-y-auto font-mono text-xs space-y-3">
              {/* Header & Run Suite Button */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 shrink-0">
                <div>
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    Treasury Fraud Benchmark Matrix
                  </span>
                  <span className="text-[10px] text-slate-400 block font-sans">
                    NIST SP 800-63B / MITRE ATT&CK 10-Vector Suite
                  </span>
                </div>
                <button
                  onClick={runFullBenchmark}
                  disabled={isLoadingBenchmark}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/50 text-white font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingBenchmark ? 'animate-spin' : ''}`} />
                  <span>{isLoadingBenchmark ? 'Evaluating...' : 'Run 10-Case Suite'}</span>
                </button>
              </div>

              {/* Live Scorecard Metrics */}
              {benchmarkData?.summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 flex flex-col">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400">Accuracy</span>
                    <span className="text-lg font-black text-emerald-400">
                      {benchmarkData.summary.accuracy}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans">
                      {benchmarkData.summary.passedCount} / {benchmarkData.summary.totalScenarios} Passed
                    </span>
                  </div>
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 flex flex-col">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400">False Positive Rate</span>
                    <span className="text-lg font-black text-cyan-400">
                      {benchmarkData.summary.fpr}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans">False Alarm Rate</span>
                  </div>
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 flex flex-col">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400">False Negative Rate</span>
                    <span className="text-lg font-black text-emerald-400">
                      {benchmarkData.summary.fnr}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans">Zero Tolerance</span>
                  </div>
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 flex flex-col">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400">Avg Latency</span>
                    <span className="text-lg font-black text-indigo-300">
                      {benchmarkData.summary.avgLatencyMs || 120}ms
                    </span>
                    <span className="text-[9px] text-slate-500 font-sans">Per Turn Timing</span>
                  </div>
                </div>
              )}

              {/* Confusion Matrix Breakdown */}
              {benchmarkData?.summary?.confusionMatrix && (
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 text-[11px] font-mono space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Confusion Matrix Breakdown
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80 flex items-center justify-between">
                      <span className="text-slate-300">Attacks Intercepted (TP):</span>
                      <span className="font-bold text-rose-400">{benchmarkData.summary.confusionMatrix.truePositives} / 5</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80 flex items-center justify-between">
                      <span className="text-slate-300">Legit Cleared (TN):</span>
                      <span className="font-bold text-emerald-400">{benchmarkData.summary.confusionMatrix.trueNegatives} / 5</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80 flex items-center justify-between">
                      <span className="text-slate-300">False Alarms (FP):</span>
                      <span className="font-bold text-cyan-400">{benchmarkData.summary.confusionMatrix.falsePositives}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80 flex items-center justify-between">
                      <span className="text-slate-300">Fraud Escaped (FN):</span>
                      <span className="font-bold text-emerald-400">{benchmarkData.summary.confusionMatrix.falseNegatives}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 10-Scenario Matrix Table */}
              <div className="space-y-1.5 flex-1 min-h-0">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Canonical Test Cases Log (10)</span>
                  <span className="text-slate-500 font-sans">Live Click to Test</span>
                </div>
                <div className="space-y-1.5 overflow-y-auto max-h-72 pr-1">
                  {benchmarkData?.results?.map((tc) => {
                    const isAttack = tc.category === 'ADVERSARIAL_DEEPFAKE';
                    return (
                      <div
                        key={tc.id}
                        className="bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 rounded-lg p-2 flex flex-col gap-1 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded font-mono ${
                              isAttack ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}>
                              {tc.id}
                            </span>
                            <span className="font-semibold text-slate-200 text-xs truncate">{tc.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              tc.passed
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              {tc.passed ? '✓ PASS' : '✗ FAIL'}
                            </span>
                            <button
                              onClick={() => onTriggerScenario(tc.key || tc.id)}
                              className="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white text-[10px] font-mono transition-all cursor-pointer"
                            >
                              Simulate Live
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/60 font-sans">
                          <span className="truncate text-slate-400">{tc.reference}</span>
                          <span className="text-slate-500 shrink-0 font-mono">Expected: {tc.expected} ➔ Outcome: {tc.predicted}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
