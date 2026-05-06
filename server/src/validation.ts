import { ControlPayload } from "./types";

const CHANNEL_MIN = 1;
const CHANNEL_MAX = 32;
const BUS_MIN = 1;
const BUS_MAX = 16;
const DURATION_MIN = 1;
const DURATION_MAX = 24 * 60;
const EXTEND_MAX = 7 * 24 * 60;

function fail(message: string): never {
  throw new Error(message);
}

function parseIntegerInRange(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} deve ser numerico.`);
  }

  if (!Number.isInteger(value)) {
    fail(`${name} deve ser inteiro.`);
  }

  if (value < min || value > max) {
    fail(`${name} deve estar entre ${min} e ${max}.`);
  }

  return value;
}

function parseBus(input: unknown): number[] {
  if (typeof input === "number") {
    return [parseIntegerInRange(input, "bus", BUS_MIN, BUS_MAX)];
  }

  if (!Array.isArray(input) || input.length === 0) {
    fail("bus deve ser numero ou array de numeros.");
  }

  const unique = new Set<number>();
  for (const value of input) {
    unique.add(parseIntegerInRange(value, "bus", BUS_MIN, BUS_MAX));
  }

  return Array.from(unique).sort((a, b) => a - b);
}

function parseAllowedChannels(input: unknown): number[] {
  if (!Array.isArray(input) || input.length === 0) {
    fail("allowedChannels deve conter ao menos um canal.");
  }

  const unique = new Set<number>();
  for (const value of input) {
    unique.add(
      parseIntegerInRange(value, "allowedChannels", CHANNEL_MIN, CHANNEL_MAX),
    );
  }

  return Array.from(unique).sort((a, b) => a - b);
}

function parseOptionalString(value: unknown, field: string, maxLength = 64): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    fail(`${field} deve ser string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    fail(`${field} nao pode ser vazio.`);
  }

  if (trimmed.length > maxLength) {
    fail(`${field} deve ter no maximo ${maxLength} caracteres.`);
  }

  return trimmed;
}

export function parseGeneratePayload(payload: unknown): {
  user: string;
  bus: number[];
  allowedChannels: number[];
  durationMinutes: number;
} {
  if (!payload || typeof payload !== "object") {
    fail("Payload invalido.");
  }

  const data = payload as Record<string, unknown>;
  const user = typeof data.user === "string" ? data.user.trim() : "";
  if (!user) {
    fail("user e obrigatorio.");
  }

  if (user.length > 64) {
    fail("user deve ter no maximo 64 caracteres.");
  }

  const bus = parseBus(data.bus);
  const allowedChannels = parseAllowedChannels(data.allowedChannels);
  const durationMinutes = parseIntegerInRange(
    data.durationMinutes,
    "durationMinutes",
    DURATION_MIN,
    DURATION_MAX,
  );

  return {
    user,
    bus,
    allowedChannels,
    durationMinutes,
  };
}

export function parseUpdateTokenPayload(payload: unknown): {
  user?: string;
  bus?: number[];
  allowedChannels?: number[];
} {
  if (!payload || typeof payload !== "object") {
    fail("Payload invalido.");
  }

  const data = payload as Record<string, unknown>;
  const user = parseOptionalString(data.user, "user");
  const bus = data.bus === undefined ? undefined : parseBus(data.bus);
  const allowedChannels =
    data.allowedChannels === undefined
      ? undefined
      : parseAllowedChannels(data.allowedChannels);

  if (user === undefined && bus === undefined && allowedChannels === undefined) {
    fail("Informe ao menos um campo para atualizacao.");
  }

  return {
    user,
    bus,
    allowedChannels,
  };
}

export function parseRevokePayload(payload: unknown): { token: string } {
  if (!payload || typeof payload !== "object") {
    fail("Payload invalido.");
  }

  const token = typeof (payload as Record<string, unknown>).token === "string"
    ? ((payload as Record<string, unknown>).token as string).trim()
    : "";

  if (!token) {
    fail("token e obrigatorio.");
  }

  return { token };
}

export function parseExtendPayload(payload: unknown): { minutes: number } {
  if (!payload || typeof payload !== "object") {
    fail("Payload invalido.");
  }

  const minutes = parseIntegerInRange(
    (payload as Record<string, unknown>).minutes,
    "minutes",
    DURATION_MIN,
    EXTEND_MAX,
  );

  return { minutes };
}

export function parseControlPayload(payload: unknown): ControlPayload {
  if (!payload || typeof payload !== "object") {
    fail("Payload de controle invalido.");
  }

  const data = payload as Record<string, unknown>;
  const channel = parseIntegerInRange(data.channel, "channel", CHANNEL_MIN, CHANNEL_MAX);

  if (typeof data.value !== "number" || !Number.isFinite(data.value)) {
    fail("value deve ser numerico.");
  }

  let parsedBus: number | undefined;
  if (data.bus !== undefined) {
    parsedBus = parseIntegerInRange(data.bus, "bus", BUS_MIN, BUS_MAX);
  }

  return {
    channel,
    value: data.value,
    bus: parsedBus,
  };
}

export function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function clampPan(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function clampMute(value: number): 0 | 1 {
  return value >= 0.5 ? 1 : 0;
}
