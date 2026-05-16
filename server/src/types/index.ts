export type BlockReason = "revoked" | "expired";
export type ControlType = "volume" | "pan" | "mute";

export type ChannelControl = {
  volume: number;
  pan: number;
  mute: 0 | 1;
};

export type TokenRecord = {
  id: string;
  user: string;
  bus: number[];
  allowedChannels: number[];
  enabled: boolean;
  expiresAt: number;
  createdAt: number;
  blockedReason?: BlockReason;
  revokedAt?: number;
  controlsByBus: Record<number, Record<number, ChannelControl>>;
};

export type TokenStatus = "active" | "revoked" | "expired";

export type ControlPayload = {
  channel: number;
  value: number;
  bus?: number;
};

export type X32Event = {
  token: string;
  user: string;
  channel: number;
  bus: number;
  param: ControlType;
  value: number;
  timestamp: number;
};

export type ControlAck =
  | {
      ok: true;
      bus: number;
      control: {
        channel: number;
        volume: number;
        pan: number;
        mute: 0 | 1;
      };
    }
  | {
      ok: false;
      error: string;
      blockedReason?: BlockReason;
    };
