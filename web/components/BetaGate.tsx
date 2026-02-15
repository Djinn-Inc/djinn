"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const BETA_PASSWORD = "djinnybaby";
const STORAGE_KEY = "djinn-beta-access";

export default function BetaGate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setAuthorized(true);
    }
    setChecking(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === BETA_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "true");
      setAuthorized(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  if (checking) {
    return null;
  }

  if (authorized) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
      <Image
        src="/djinn-logo.png"
        alt="Djinn"
        width={80}
        height={80}
        className="w-20 h-20 mb-6"
      />
      <h1 className="text-5xl font-extrabold tracking-wider text-slate-900 mb-3">
        DJINN
      </h1>
      <p className="text-sm tracking-[0.25em] uppercase text-slate-400 font-light">
        The Genius-Idiot Network
      </p>
      <p className="text-base text-slate-500 mt-1 mb-8">
        Information{" "}
        <span className="font-bold text-slate-900 mx-1">&times;</span>{" "}
        Execution
      </p>

      <div className="text-center mb-10 space-y-1">
        <p className="text-slate-600">
          Buy intelligence you can <span className="font-semibold text-slate-900">trust</span>.
        </p>
        <p className="text-slate-600">
          Sell analysis you can <span className="font-semibold text-slate-900">prove</span>.
        </p>
        <p className="text-sm text-idiot-500 italic mt-3">
          Signals stay secret forever &mdash; even from us.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
          placeholder="Enter beta password"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 transition-colors text-center"
          autoFocus
        />
        {error && (
          <p className="text-sm text-red-500 text-center mt-2">
            Incorrect password
          </p>
        )}
        <button
          type="submit"
          className="w-full mt-4 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          Enter
        </button>
      </form>

      <p className="text-xs text-slate-400 mt-8">
        Djinn is currently in private beta.
      </p>
    </div>
  );
}
