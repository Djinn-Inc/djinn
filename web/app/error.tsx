"use client";

import { useCallback, useEffect, useState } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reported, setReported] = useState(false);

  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  const reportError = useCallback(async () => {
    try {
      await fetch("/api/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Unhandled crash: ${error.message}`,
          url: window.location.pathname,
          errorMessage: error.message,
          errorStack: error.stack?.slice(0, 2000),
          userAgent: navigator.userAgent,
          source: "error-boundary",
        }),
      });
      setReported(true);
    } catch {
      // Silently fail — don't compound the error
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        Something went wrong
      </h2>
      <p className="text-slate-600 mb-6 text-center max-w-md">
        {error.message || "An unexpected error occurred."}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          Try again
        </button>
        <button
          onClick={reportError}
          disabled={reported}
          className="rounded-lg border border-slate-300 px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {reported ? "Reported" : "Report this error"}
        </button>
      </div>
      {reported && (
        <p className="text-xs text-green-600 mt-3">Error report sent. Thank you!</p>
      )}
    </div>
  );
}
