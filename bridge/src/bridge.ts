import dgram from "dgram";
import dotenv from "dotenv";
import { io } from "socket.io-client";
import { decodeOscMessage, encodeOscMessage } from "./osc";

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? "";
const BRIDGE_NAME = process.env.BRIDGE_NAME ?? "bridge-local";
const X32_IP = process.env.X32_IP ?? "192.168.0.100";
const X32_PORT = parseInt(process.env.X32_PORT ?? "10023", 10);
const USE_REAL_X32_IO = (process.env.USE_REAL_X32_IO ?? "false").toLowerCase() === "true";
const X32_QUERY_TIMEOUT_MS = parseInt(process.env.X32_QUERY_TIMEOUT_MS ?? "160", 10);
const IO_OPTIONS_CACHE_MS = parseInt(process.env.IO_OPTIONS_CACHE_MS ?? "60000", 10);
const BACKEND_HEALTHCHECK_TIMEOUT_MS = parseInt(
  process.env.BACKEND_HEALTHCHECK_TIMEOUT_MS ?? "5000",
  10,
);

type ControlType = "volume" | "pan" | "mute";
type SocketTransport = "polling" | "websocket";
type X32Event = {
  token: string;
  user: string;
  channel: number;
  bus: number;
  param: ControlType;
  value: number;
  timestamp: number;
};

type IoOption = {
  id: number;
  label: string;
};

type BridgeIoOptions = {
  source: "mock" | "real" | "fallback";
  buses: IoOption[];
  channels: IoOption[];
  fetchedAt: number;
  error?: string;
};

type BridgeIoOptionsResponse =
  | {
      ok: true;
      options: BridgeIoOptions;
    }
  | {
      ok: false;
      error: string;
    };

const udpClient = dgram.createSocket("udp4");
let ioOptionsCache: BridgeIoOptions | null = null;

function parseSocketTransports(raw: string | undefined): SocketTransport[] | undefined {
  if (!raw?.trim()) {
    return undefined;
  }

  const transports = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is SocketTransport => item === "polling" || item === "websocket");

  return transports.length > 0 ? transports : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function defaultBusOptions(): IoOption[] {
  return Array.from({ length: 16 }, (_, idx) => {
    const bus = idx + 1;
    return {
      id: bus,
      label: `Bus ${bus}`,
    };
  });
}

function defaultChannelOptions(): IoOption[] {
  return Array.from({ length: 32 }, (_, idx) => {
    const channel = idx + 1;
    return {
      id: channel,
      label: `Canal ${channel}`,
    };
  });
}

function buildMockIoOptions(): BridgeIoOptions {
  return {
    source: "mock",
    buses: defaultBusOptions(),
    channels: defaultChannelOptions(),
    fetchedAt: Date.now(),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function sanitizeName(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

function toX32Osc(event: X32Event): {
  path: string;
  value: number;
  argType: "f" | "i";
} {
  if (event.param === "volume") {
    return {
      path: `/ch/${event.channel}/mix/${event.bus}/level`,
      value: clamp(event.value, 0, 1),
      argType: "f",
    };
  }

  if (event.param === "pan") {
    return {
      path: `/ch/${event.channel}/mix/${event.bus}/pan`,
      value: clamp(event.value, -1, 1),
      argType: "f",
    };
  }

  // /on na X32 e logica de "ligado":
  // - 1 = on (canal aberto no mix)
  // - 0 = off (canal fechado no mix)
  // O frontend trabalha com mute (1 = mutado), entao convertemos aqui.
  const mute = event.value >= 0.5 ? 1 : 0;
  const onValue = mute === 1 ? 0 : 1;

  return {
    path: `/ch/${event.channel}/mix/${event.bus}/on`,
    value: onValue,
    argType: "i",
  };
}

function queryOscString(address: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let finished = false;

    const finish = (result?: string) => {
      if (finished) {
        return;
      }
      finished = true;
      udpClient.off("message", onMessage);
      clearTimeout(timer);
      resolve(result);
    };

    const onMessage = (packet: Buffer) => {
      try {
        const decoded = decodeOscMessage(packet);
        if (decoded.address !== address) {
          return;
        }

        const stringArg = decoded.args.find((arg): arg is string => typeof arg === "string");
        finish(stringArg);
      } catch {
        // Ignora mensagens OSC nao relacionadas.
      }
    };

    const timer = setTimeout(() => finish(undefined), X32_QUERY_TIMEOUT_MS);
    udpClient.on("message", onMessage);

    const requestPacket = encodeOscMessage(address, []);
    udpClient.send(requestPacket, X32_PORT, X32_IP, (error) => {
      if (error) {
        finish(undefined);
      }
    });
  });
}

async function queryRealIoOptions(): Promise<BridgeIoOptions> {
  const buses = defaultBusOptions();
  const channels = defaultChannelOptions();

  let namedBusCount = 0;
  for (let bus = 1; bus <= 16; bus += 1) {
    const path = `/bus/${pad2(bus)}/config/name`;
    const name = sanitizeName(await queryOscString(path));
    if (name) {
      buses[bus - 1] = {
        id: bus,
        label: `Bus ${bus} - ${name}`,
      };
      namedBusCount += 1;
    }
  }

  let namedChannelCount = 0;
  for (let channel = 1; channel <= 32; channel += 1) {
    const path = `/ch/${pad2(channel)}/config/name`;
    const name = sanitizeName(await queryOscString(path));
    if (name) {
      channels[channel - 1] = {
        id: channel,
        label: `Canal ${channel} - ${name}`,
      };
      namedChannelCount += 1;
    }
  }

  if (namedBusCount === 0 && namedChannelCount === 0) {
    throw new Error("Nao foi possivel ler nomes reais da X32.");
  }

  return {
    source: "real",
    buses,
    channels,
    fetchedAt: Date.now(),
  };
}

async function getIoOptions(forceRefresh: boolean): Promise<BridgeIoOptions> {
  if (!USE_REAL_X32_IO) {
    return buildMockIoOptions();
  }

  if (!forceRefresh && ioOptionsCache && Date.now() - ioOptionsCache.fetchedAt <= IO_OPTIONS_CACHE_MS) {
    return ioOptionsCache;
  }

  try {
    const real = await queryRealIoOptions();
    ioOptionsCache = real;
    return real;
  } catch (error) {
    const fallback: BridgeIoOptions = {
      source: "fallback",
      buses: defaultBusOptions(),
      channels: defaultChannelOptions(),
      fetchedAt: Date.now(),
      error: error instanceof Error ? error.message : "Falha na leitura da X32.",
    };

    ioOptionsCache = fallback;
    return fallback;
  }
}

function buildBackendHealthUrl(): string {
  try {
    return new URL("/health", BACKEND_URL).toString();
  } catch {
    return `${BACKEND_URL.replace(/\/$/, "")}/health`;
  }
}

function describeErrorDetail(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const detail = value as Record<string, unknown>;
  const fields = ["code", "status", "statusText", "type", "message"];
  const parts = fields
    .map((field) => {
      const fieldValue = detail[field];
      if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
        return undefined;
      }
      return `${field}=${String(fieldValue)}`;
    })
    .filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(" ") : undefined;
}

function describeConnectError(error: Error): string {
  const detail = error as Error & {
    cause?: unknown;
    context?: unknown;
    description?: unknown;
    type?: unknown;
  };

  const parts = [error.message];
  const type = describeErrorDetail(detail.type);
  const description = describeErrorDetail(detail.description);
  const cause = describeErrorDetail(detail.cause);
  const context = describeErrorDetail(detail.context);

  for (const item of [type, description, cause, context]) {
    if (item && !parts.includes(item)) {
      parts.push(item);
    }
  }

  return parts.join(" | ");
}

function warnForSuspiciousBackendUrl(): void {
  try {
    const backendUrl = new URL(BACKEND_URL);
    if (backendUrl.hostname.endsWith(".vercel.app")) {
      console.warn(
        "[BRIDGE] BACKEND_URL parece apontar para Vercel. A bridge deve apontar para o backend Node persistente (ex.: Render), nao para o frontend.",
      );
    }
  } catch {
    console.warn(`[BRIDGE] BACKEND_URL invalida: ${BACKEND_URL}`);
  }
}

async function checkBackendHealth(): Promise<void> {
  const healthUrl = buildBackendHealthUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_HEALTHCHECK_TIMEOUT_MS);

  try {
    const response = await fetch(healthUrl, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[BRIDGE] backend respondeu ${healthUrl} com HTTP ${response.status}`);
      return;
    }

    console.log(`[BRIDGE] backend acessivel em ${healthUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[BRIDGE] nao foi possivel acessar ${healthUrl}: ${message}. Confira BACKEND_URL e se o backend esta rodando.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function connectBackend() {
  const transports = parseSocketTransports(process.env.SOCKET_TRANSPORTS);
  const socket = io(BACKEND_URL, {
    ...(transports ? { transports } : {}),
    auth: {
      role: "bridge",
      bridgeSecret: BRIDGE_SECRET,
      bridgeName: BRIDGE_NAME,
    },
  });

  socket.on("connect", () => {
    const transport = socket.io.engine.transport.name;
    console.log(`[BRIDGE] conectado ao backend (${BACKEND_URL}) via ${transport}`);
  });

  socket.io.engine.on("upgrade", (transport) => {
    console.log(`[BRIDGE] transporte atualizado para ${transport.name}`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[BRIDGE] desconectado: ${reason}`);
  });

  socket.on("connect_error", (error) => {
    console.error(`[BRIDGE] erro de conexao: ${describeConnectError(error)}`);
  });

  socket.on("bridge:get-io-options", async (payload: { forceRefresh?: boolean }, callback?: (response: BridgeIoOptionsResponse) => void) => {
    if (typeof callback !== "function") {
      return;
    }

    try {
      const options = await getIoOptions(Boolean(payload?.forceRefresh));
      callback({
        ok: true,
        options,
      });
    } catch (error) {
      callback({
        ok: false,
        error: error instanceof Error ? error.message : "BRIDGE_IO_OPTIONS_FAILED",
      });
    }
  });

  socket.on("x32", (event: X32Event) => {
    try {
      const command = toX32Osc(event);
      const message = encodeOscMessage(command.path, [
        { type: command.argType, value: command.value },
      ]);

      udpClient.send(message, X32_PORT, X32_IP, (error) => {
        if (error) {
          console.error(
            `[BRIDGE][UDP_ERROR] token=${event.token} user=${event.user} path=${command.path} error=${error.message}`,
          );
          return;
        }

        console.log(
          `[BRIDGE][SENT] token=${event.token} user=${event.user} path=${command.path} value=${command.value}`,
        );
      });
    } catch (error) {
      console.error(
        `[BRIDGE][OSC_ERROR] token=${event.token} user=${event.user} error=${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  });

  return socket;
}

warnForSuspiciousBackendUrl();
void checkBackendHealth();
connectBackend();

udpClient.bind(() => {
  const address = udpClient.address();
  console.log(`[BRIDGE] UDP socket local em ${(typeof address === "string" ? address : address.port)}`);
});

udpClient.on("error", (error) => {
  console.error(`[BRIDGE][UDP_SOCKET_ERROR] ${error.message}`);
});
