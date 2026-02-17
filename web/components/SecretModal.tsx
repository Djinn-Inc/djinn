"use client";

import { useEffect } from "react";

interface SecretModalProps {
  open: boolean;
  title: string;
  message: string;
  children?: React.ReactNode;
}

/**
 * Full-screen modal overlay for client-side secret operations.
 * Visual treatment makes it clear that computation is local and private.
 */
export default function SecretModal({ open, title, message, children }: SecretModalProps) {
  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />

      {/* Modal content */}
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-8 text-center shadow-2xl">
        {/* Lock icon */}
        <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center">
          <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        {/* Local badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/50 border border-emerald-700/50 px-3 py-1 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-emerald-300">Processing locally on your device</span>
        </div>

        <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-6">{message}</p>

        {/* Spinner */}
        <div className="flex justify-center mb-4">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>

        {children}

        <p className="text-xs text-slate-500 mt-4">
          Your data never leaves this device during this step.
        </p>
      </div>
    </div>
  );
}
