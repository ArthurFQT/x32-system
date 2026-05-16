import { ChannelControl, TokenRecord, TokenStatus } from "../../types";

const tokens = new Map<string, TokenRecord>();

function defaultControl(): ChannelControl {
  return {
    volume: 0.75,
    pan: 0,
    mute: 0,
  };
}

function buildControls(channels: number[]): Record<number, ChannelControl> {
  const controls: Record<number, ChannelControl> = {};
  for (const channel of channels) {
    controls[channel] = defaultControl();
  }
  return controls;
}

function buildControlsByBus(
  busList: number[],
  channels: number[],
): Record<number, Record<number, ChannelControl>> {
  const controlsByBus: Record<number, Record<number, ChannelControl>> = {};
  for (const bus of busList) {
    controlsByBus[bus] = buildControls(channels);
  }
  return controlsByBus;
}

export function createToken(data: {
  id: string;
  user: string;
  bus: number[];
  allowedChannels: number[];
  createdAt: number;
  expiresAt: number;
}): TokenRecord {
  const record: TokenRecord = {
    id: data.id,
    user: data.user,
    bus: data.bus,
    allowedChannels: data.allowedChannels,
    enabled: true,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    controlsByBus: buildControlsByBus(data.bus, data.allowedChannels),
  };

  tokens.set(record.id, record);
  return record;
}

export function getToken(id: string): TokenRecord | undefined {
  return tokens.get(id);
}

export function listTokens(): TokenRecord[] {
  return Array.from(tokens.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteToken(id: string): boolean {
  return tokens.delete(id);
}

export function getTokenStatus(token: TokenRecord, now = Date.now()): TokenStatus {
  if (!token.enabled && token.blockedReason === "revoked") {
    return "revoked";
  }

  if (now > token.expiresAt || token.blockedReason === "expired") {
    return "expired";
  }

  if (!token.enabled) {
    return "revoked";
  }

  return "active";
}

export function markRevoked(token: TokenRecord, now = Date.now()): void {
  token.enabled = false;
  token.blockedReason = "revoked";
  token.revokedAt = now;
}

export function markExpired(token: TokenRecord): void {
  token.enabled = false;
  token.blockedReason = "expired";
}

export function markEnabled(token: TokenRecord): void {
  token.enabled = true;
  token.blockedReason = undefined;
  token.revokedAt = undefined;
}

function buildUpdatedBusControls(
  token: TokenRecord,
  nextBusList: number[],
  nextChannels: number[],
): Record<number, Record<number, ChannelControl>> {
  const controlsByBus: Record<number, Record<number, ChannelControl>> = {};

  for (const bus of nextBusList) {
    const existingBusControls = token.controlsByBus[bus] ?? {};
    const channelControls: Record<number, ChannelControl> = {};
    for (const channel of nextChannels) {
      channelControls[channel] = existingBusControls[channel] ?? defaultControl();
    }
    controlsByBus[bus] = channelControls;
  }

  return controlsByBus;
}

export function updateTokenConfig(
  token: TokenRecord,
  patch: {
    user?: string;
    bus?: number[];
    allowedChannels?: number[];
  },
): TokenRecord {
  if (patch.user !== undefined) {
    token.user = patch.user;
  }

  if (patch.bus !== undefined) {
    token.bus = patch.bus;
    token.controlsByBus = buildUpdatedBusControls(token, token.bus, token.allowedChannels);
  }

  if (patch.allowedChannels !== undefined) {
    token.allowedChannels = patch.allowedChannels;
    token.controlsByBus = buildUpdatedBusControls(token, token.bus, token.allowedChannels);
  }

  return token;
}

export function extendTokenExpiration(token: TokenRecord, extraMinutes: number): TokenRecord {
  const now = Date.now();
  const base = token.expiresAt > now ? token.expiresAt : now;
  token.expiresAt = base + extraMinutes * 60 * 1000;
  return token;
}

export function cleanupTokens(now: number, retentionMs: number): {
  expired: TokenRecord[];
  removed: string[];
} {
  const expired: TokenRecord[] = [];
  const removed: string[] = [];

  for (const token of tokens.values()) {
    if (token.enabled && now > token.expiresAt) {
      markExpired(token);
      expired.push(token);
    }

    const referenceTs = token.revokedAt ?? token.expiresAt;
    if (!token.enabled && now - referenceTs > retentionMs) {
      tokens.delete(token.id);
      removed.push(token.id);
    }
  }

  return { expired, removed };
}
