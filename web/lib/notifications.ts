/**
 * Push notification utilities for PWA support.
 *
 * Usage:
 *   const { permission, requestPermission, sendLocal } = useNotifications();
 *   await requestPermission(); // asks user for push permission
 *   sendLocal("Signal Purchased", "Someone bought your NBA signal");
 */

export type NotificationPermission = "default" | "granted" | "denied";

export function getPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  return Notification.permission as NotificationPermission;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  const result = await Notification.requestPermission();
  return result as NotificationPermission;
}

export function sendLocalNotification(
  title: string,
  body: string,
  options?: { tag?: string; url?: string },
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // Use service worker notification if available (works when app is backgrounded)
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: options?.tag || "djinn-local",
        data: { url: options?.url || "/" },
      });
    });
    return;
  }

  // Fallback to basic Notification API
  new Notification(title, {
    body,
    icon: "/icon-192.png",
    tag: options?.tag || "djinn-local",
  });
}
