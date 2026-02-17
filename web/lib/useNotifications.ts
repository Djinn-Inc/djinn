"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPermission,
  requestPermission as requestPerm,
  sendLocalNotification,
  type NotificationPermission,
} from "./notifications";

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setPermission(getPermission());
  }, []);

  const requestPermission = useCallback(async () => {
    const result = await requestPerm();
    setPermission(result);
    return result;
  }, []);

  const sendLocal = useCallback(
    (title: string, body: string, options?: { tag?: string; url?: string }) => {
      sendLocalNotification(title, body, options);
    },
    [],
  );

  return { permission, requestPermission, sendLocal };
}
