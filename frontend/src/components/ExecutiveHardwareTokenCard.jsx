import React, { useState, useEffect } from 'react';
import { KeyRound, Clock } from 'lucide-react';
import { apiUrl } from '../config/api.js';

export function ExecutiveHardwareTokenCard({ executiveId = 'EXEC-001' }) {
  const [token, setToken] = useState('------');
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  const fetchToken = async () => {
    try {
      const res = await fetch(apiUrl(`/api/token/current?exec_id=${executiveId}`));
      const data = await res.json();
      if (data && data.success) {
        setToken(data.token);
        setSecondsRemaining(data.seconds_remaining);
      }
    } catch {
      // Fallback calculation if offline
      const epoch = Math.floor(Date.now() / 1000);
      setSecondsRemaining(60 - (epoch % 60));
    }
  };

  useEffect(() => {
    fetchToken();
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchToken();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [executiveId]);

  // Format 6 digits with a center space: "782 771"
  const formattedToken = token && token.length === 6
    ? `${token.slice(0, 3)} ${token.slice(3)}`
    : token;

  const progressPercent = Math.round((secondsRemaining / 60) * 100);

  return (
    <div className="rounded-xl border border-indigo-200/90 bg-linear-to-r from-indigo-50/90 via-slate-50 to-indigo-50/60 p-2.5 shadow-2xs">
      <div className="flex items-center justify-between">
        {/* Left: Device Label */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white shadow-2xs shrink-0">
            <KeyRound className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-900 font-mono tracking-tight">
                RSA SecurID Token
              </span>
              <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold border border-indigo-200">
                SOX Dual-Key
              </span>
            </div>
            <span className="text-[10px] text-slate-500 block leading-tight">
              RFC 6238 TOTP Rolling Passcode
            </span>
          </div>
        </div>

        {/* Right: Live LCD Token Display */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-base font-extrabold tracking-widest text-indigo-950 bg-white px-2.5 py-0.5 rounded-lg border border-indigo-200 shadow-inner inline-block">
              {formattedToken}
            </div>
            <div className="flex items-center justify-end gap-1 mt-0.5 text-[9.5px] font-mono text-slate-500">
              <Clock className="w-2.5 h-2.5 text-indigo-500" />
              <span>Rotates in <strong className="text-indigo-700">{secondsRemaining}s</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Line */}
      <div className="mt-1.5 w-full bg-indigo-100/70 h-1 rounded-full overflow-hidden">
        <div
          className="bg-indigo-600 h-full transition-all duration-1000 ease-linear rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
