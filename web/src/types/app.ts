export type SessionStatus =
  | "connecting"
  | "active"
  | "revoked"
  | "expired"
  | "invalid"
  | "offline";

export type ChannelControl = {
  channel: number;
  volume: number;
  pan: number;
  mute: 0 | 1;
};

export type SessionInitPayload = {
  token: string;
  user: string;
  bus: number;
  buses: number[];
  allowedChannels: number[];
  enabled: boolean;
  expiresAt: number;
  bridgeConnected: boolean;
  controlsByBus: Record<number, ChannelControl[]>;
};

export type BlockPayload = {
  reason: "revoked" | "expired";
};

export type BridgeStatusPayload = {
  connected: boolean;
};

export type ControlAck =
  | {
      ok: true;
      bus: number;
      control: ChannelControl;
    }
  | {
      ok: false;
      error: string;
      blockedReason?: "revoked" | "expired";
    };

export type AdminToken = {
  id: string;
  user: string;
  bus: number | number[];
  allowedChannels: number[];
  enabled: boolean;
  expiresAt: number;
  createdAt: number;
  revokedAt: number | null;
  status: "active" | "revoked" | "expired";
  accessUrl: string;
  controlsByBus: Record<number, ChannelControl[]>;
};

export type OverviewResponse = {
  now: number;
  bridgeConnected: boolean;
  connectedMusicians: number;
  tokens: {
    total: number;
    active: number;
    revoked: number;
    expired: number;
  };
};

export type TokensResponse = {
  tokens: AdminToken[];
};

export type LogEntry = {
  timestamp: string;
  action: string;
  [key: string]: unknown;
};

export type LogsResponse = {
  logs: LogEntry[];
};

export type GenerateResponse = {
  token: string;
  accessUrl: string;
  qrCodeDataUrl: string;
  tokenData: AdminToken;
};

export type QrResponse = {
  token: string;
  accessUrl: string;
  qrCodeDataUrl: string;
};

export type IoOption = {
  id: number;
  label: string;
};

export type IoOptionsPayload = {
  source: "mock" | "real" | "fallback";
  buses: IoOption[];
  channels: IoOption[];
  fetchedAt: number;
  error?: string;
};

export type IoOptionsResponse = {
  mode: "mock" | "real";
  options: IoOptionsPayload;
};

export type ApiError = {
  error?: string;
  message?: string;
};

export type QueuedControl = {
  eventName: "control:volume";
  bus: number;
  channel: number;
  value: number;
};
