"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed — ignore silently (dev mode, unsupported browser, etc.)
      });
    }
  }, []);

  return null;
}
