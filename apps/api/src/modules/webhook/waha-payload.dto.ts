// WAHA webhook payload types
// Docs: https://waha.devlike.pro/docs/how-to/webhooks/

export interface WahaWebhookPayload {
  event: WahaEvent;
  session: string;
  metadata?: Record<string, unknown>;
  payload: WahaMessagePayload | WahaSessionPayload;
  environment?: WahaEnvironment;
  me?: WahaMe;
}

export type WahaEvent =
  | "message"
  | "message.any"
  | "message.reaction"
  | "message.revoked"
  | "session.status"
  | "state.change";

export interface WahaMe {
  id: string;
  pushName: string;
}

export interface WahaEnvironment {
  version: string;
  engine: string;
  tier: string;
}

export interface WahaMediaObject {
  url: string;
  filename: string | null;
  mimetype: string;
}

export interface WahaMessagePayload {
  id: string;
  timestamp: number;
  from: string;
  fromMe: boolean;
  to?: string;
  body: string; // text content or caption for media messages
  hasMedia: boolean;
  media?: WahaMediaObject; // WAHA NOWEB: media info is here
  mediaUrl?: string; // legacy / other engines fallback
  mediaContentType?: string; // legacy fallback
  mediaSize?: number;
  type?: WahaMessageType;
  ack?: number;
  vCards?: string[];
  replyTo?: string | null;
  _data?: Record<string, unknown>;
}

export type WahaMessageType =
  | "chat" // text
  | "ptt" // voice note (push-to-talk)
  | "audio" // audio file
  | "image" // image
  | "document" // document
  | "video" // video
  | "sticker"
  | "location"
  | "contact_card";

export interface WahaSessionPayload {
  status: string;
  name: string;
}

export function extractPhone(waId: string): string {
  // "628xxxxxxxxxx@c.us" > "628xxxxxxxxxx"
  // "247622363250777@lid" > "247622363250777"
  return waId.replace("@c.us", "").replace("@g.us", "").replace("@lid", "");
}

// ─── Map WAHA message type to our MessageType enum ───────────────────────────
export function mapWahaTypeToMessageType(
  wahaType?: WahaMessageType,
  hasMedia?: boolean,
  body?: string,
  mimetype?: string | null,
): "text" | "voice" | "image" | "document" | "video" | null {
  if (wahaType) {
    const map: Partial<
      Record<WahaMessageType, "text" | "voice" | "image" | "document" | "video">
    > = {
      chat: "text",
      ptt: "voice",
      audio: "voice",
      image: "image",
      document: "document",
      video: "video",
    };
    if (map[wahaType]) return map[wahaType]!;
  }

  if (hasMedia) {
    if (mimetype) {
      if (mimetype.startsWith("audio/")) return "voice";
      if (mimetype.startsWith("video/")) return "video";
      if (mimetype.startsWith("image/")) return "image";
      return "document";
    }
    return "image";
  } else if (body) {
    return "text";
  }

  return null;
}
