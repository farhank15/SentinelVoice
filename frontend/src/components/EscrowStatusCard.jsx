import React from 'react';
import {
  Lock,
  Unlock,
  ShieldAlert,
  Shield,
  Building2,
  Landmark,
  CheckCircle2,
  XCircle,
  BellRing
} from 'lucide-react';
import { ExecutiveHardwareTokenCard } from './ExecutiveHardwareTokenCard';

export function EscrowStatusCard({ escrowState }) {
  const isFrozen = escrowState.status === 'FROZEN';
  const isReleased = escrowState.status === 'RELEASED';
  const isPending = escrowState.status === 'PENDING_VERIFICATION';
  const isStandby = !isFrozen && !isReleased && !isPending;

  return (
    <div
      className={`rounded-2xl p-4 border transition-all duration-200 bg-white shrink-0 shadow-xs ${
        isFrozen
          ? 'border-rose-300 ring-1 ring-rose-200'
          : isReleased
          ? 'border-emerald-300 ring-1 ring-emerald-200'
          : isPending
          ? 'border-amber-300 ring-1 ring-amber-200'
          : 'border-slate-200'
      }`}
    >
      {/* Header with Title and Escrow Status Pill */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
              isFrozen
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : isReleased
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : isPending
                ? 'bg-amber-50 border-amber-200 text-amber-600'
                : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}
          >
            {isFrozen ? (
              <ShieldAlert className="w-4 h-4" />
            ) : isReleased ? (
              <Unlock className="w-4 h-4" />
            ) : isPending ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono">
              Treasury Escrow Ledger
            </h3>
            <span className="text-[10px] text-slate-500 font-medium block">
              Automated Dual-Control Settlement
            </span>
          </div>
        </div>

        <span
          className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border flex items-center gap-1.5 shadow-2xs ${
            isFrozen
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : isReleased
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : isPending
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isFrozen
                ? 'bg-rose-600'
                : isReleased
                ? 'bg-emerald-600'
                : isPending
                ? 'bg-amber-500 animate-pulse'
                : 'bg-slate-400'
            }`}
          />
          {isFrozen
            ? 'ESCROW FROZEN'
            : isReleased
            ? 'CLEARED & SETTLED'
            : isPending
            ? 'HOLD / AUDITING'
            : 'ESCROW STANDBY'}
        </span>
      </div>

      {/* Hero Financial Metric */}
      <div className="py-3 flex items-baseline justify-between">
        <div>
          <span className="text-[10.5px] font-mono text-slate-500 block font-medium">
            {isStandby ? 'MONITORED INTERCEPT AMOUNT' : 'TRANSACTION INTERCEPT AMOUNT'}
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className={`text-2xl font-bold tracking-tight font-mono ${
                isStandby ? 'text-slate-400' : 'text-slate-950'
              }`}
            >
              ${Number(escrowState.amount || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2
              })}
            </span>
            <span className="text-xs font-mono text-slate-500 font-semibold">USD</span>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
          SOX Cap: $50,000 USD
        </span>
      </div>

      {/* Structured Metadata Grid */}
      <div className="grid grid-cols-2 gap-2 font-mono text-xs pb-2">
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-[10px] text-slate-500 block font-medium">TRANSACTION ID</span>
          <span className="font-semibold text-slate-800 text-xs truncate block">
            {escrowState.txId || 'None (Standby)'}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-[10px] text-slate-500 block font-medium">RISK ASSESSMENT</span>
          <span
            className={`font-semibold text-xs ${
              isFrozen
                ? 'text-rose-600 font-bold'
                : isReleased
                ? 'text-emerald-600 font-bold'
                : isPending
                ? 'text-amber-600 font-bold'
                : 'text-slate-500'
            }`}
          >
            {isFrozen
              ? 'CRITICAL (98/100)'
              : isReleased
              ? 'NOMINAL (12/100)'
              : isPending
              ? 'EVALUATING'
              : 'NORMAL (0/100)'}
          </span>
        </div>
      </div>

      {/* Beneficiary Details */}
      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 font-mono text-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1.5 font-sans">
            <Building2 className="w-3.5 h-3.5 text-slate-400" /> Beneficiary:
          </span>
          <span
            className={`font-semibold truncate max-w-[210px] text-xs ${
              isStandby ? 'text-slate-400 italic' : 'text-slate-900'
            }`}
            title={escrowState.vendorName}
          >
            {escrowState.vendorName || 'No Active Intercept'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1.5 font-sans">
            <Landmark className="w-3.5 h-3.5 text-slate-400" /> Account #:
          </span>
          <span className="text-slate-700 font-mono text-xs">
            {escrowState.accountNumber || '--'}
          </span>
        </div>
      </div>

      {/* Dynamic SOX 404 Executive Hardware Security Token (RFC 6238 TOTP) */}
      <div className="mt-2.5">
        <ExecutiveHardwareTokenCard />
      </div>

      {/* Compliance & Fraud Interception Audit Card */}
      {isFrozen ? (
        <div className="mt-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-mono text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-rose-800 font-bold text-xs">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>SOX 404 & BEC Interception Report</span>
          </div>
          <div className="space-y-1 text-xs text-rose-800 leading-tight pl-1 font-sans">
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Identity Challenge: Failed Zero-Knowledge Verification</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>ERP Whitelist: Unregistered mule / offshore account</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>OOB Security Dispatch sent to CISO & Treasury Head</span>
            </div>
          </div>
          {escrowState.reason && (
            <div className="pt-1.5 border-t border-rose-200 text-xs text-rose-700 italic font-sans">
              Reason: {escrowState.reason}
            </div>
          )}
        </div>
      ) : isReleased ? (
        <div className="mt-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Corporate Compliance Clearance</span>
          </div>
          <div className="space-y-0.5 text-xs text-emerald-800 leading-tight pl-1 font-sans">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>ERP Verified: Beneficiary vendor whitelisted in database</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>SOX Compliant: Dual-control approval authenticated</span>
            </div>
          </div>
        </div>
      ) : isPending ? (
        <div className="mt-2.5 p-2 rounded-xl bg-amber-50 border border-amber-200 font-mono text-xs text-amber-800 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Cross-referencing ERP ledger and dual-authorization policy...</span>
        </div>
      ) : (
        <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span>Autonomous treasury escrow active. Ready to intercept inbound wires.</span>
        </div>
      )}
    </div>
  );
}
