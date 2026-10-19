import webpush from "web-push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string | null;
  url: string;
  tag: string;
}

export type PushResult = "sent" | "gone" | "failed";

export interface PushSender {
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
}

/** Web Push with VAPID keys (generate with `npx web-push generate-vapid-keys`). Null when not configured. */
export function pushSenderFromEnv(env: Record<string, string | undefined> = process.env): PushSender | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;
  const subject = env.VAPID_SUBJECT ?? "mailto:admin@localhost";
  webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return {
    async send(target, message) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60 * 24 },
        );
        return "sent";
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // The browser unsubscribed or the subscription expired.
        if (status === 404 || status === 410) return "gone";
        console.error("Push failed", status, (error as Error).message);
        return "failed";
      }
    },
  };
}
