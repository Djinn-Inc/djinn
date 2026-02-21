"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";

// Capture last N console.error calls for context
const capturedErrors: string[] = [];
if (typeof window !== "undefined") {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    capturedErrors.push(args.map(String).join(" ").slice(0, 500));
    if (capturedErrors.length > 10) capturedErrors.shift();
    origError.apply(console, args);
  };
}

function truncateWallet(addr: string | undefined): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface ReportErrorProps {
  /** Pre-fill with a caught error */
  error?: Error;
  /** Source label for categorization */
  source?: "error-boundary" | "report-button" | "api-error" | "other";
}

export default function ReportError({ error, source = "report-button" }: ReportErrorProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const pathname = usePathname();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const submit = useCallback(async () => {
    setStatus("sending");
    try {
      const report = {
        message: message || (error?.message ? `Error: ${error.message}` : "User-reported issue"),
        url: pathname,
        errorMessage: error?.message || "",
        errorStack: error?.stack?.slice(0, 2000) || "",
        userAgent: navigator.userAgent,
        wallet: "", // wallet address not captured — privacy first
        consoleErrors: capturedErrors.slice(-5),
        source,
      };

      const resp = await fetch("/api/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });

      if (!resp.ok) throw new Error(`${resp.status}`);
      setStatus("sent");
      setTimeout(() => {
        setOpen(false);
        setStatus("idle");
        setMessage("");
      }, 2000);
    } catch {
      setStatus("error");
    }
  }, [message, error, pathname, source]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 w-10 h-10 rounded-full bg-slate-800 text-white shadow-lg hover:bg-slate-700 transition-colors flex items-center justify-center group"
        aria-label="Report an issue"
        title="Report an issue"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Report an Issue</h3>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {status === "sent" ? (
            <div className="text-center py-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-slate-600">Report sent. Thank you!</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 font-mono truncate">{error.message}</p>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened? (optional — we capture context automatically)"
                rows={3}
                maxLength={2000}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent placeholder:text-slate-400"
              />

              <p className="text-[11px] text-slate-400 mt-1 mb-3">
                We capture the current page, browser info, and recent errors. No personal data is shared.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={status === "sending"}
                  className="flex-1 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {status === "sending" ? "Sending..." : "Send Report"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {status === "error" && (
                <p className="text-xs text-red-500 mt-2">Failed to send. Please try again.</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
