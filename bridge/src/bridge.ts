import dgram from "dgram";
import dotenv from "dotenv";
import fs from "fs";
import http, { IncomingMessage, ServerResponse } from "http";
import net from "net";
import os from "os";
import path from "path";
import { io } from "socket.io-client";
import { decodeOscMessage, encodeOscMessage } from "./osc";

dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? "";
const BRIDGE_NAME = process.env.BRIDGE_NAME ?? "bridge-local";
const DEFAULT_X32_IP = process.env.X32_IP ?? "192.168.0.100";
const DEFAULT_X32_PORT = parseInt(process.env.X32_PORT ?? "10023", 10);
const DEFAULT_USE_REAL_X32_IO = (process.env.USE_REAL_X32_IO ?? "false").toLowerCase() === "true";
const X32_QUERY_TIMEOUT_MS = parseInt(process.env.X32_QUERY_TIMEOUT_MS ?? "160", 10);
const IO_OPTIONS_CACHE_MS = parseInt(process.env.IO_OPTIONS_CACHE_MS ?? "60000", 10);
const BACKEND_HEALTHCHECK_TIMEOUT_MS = parseInt(
  process.env.BACKEND_HEALTHCHECK_TIMEOUT_MS ?? "5000",
  10,
);
const BRIDGE_UI_HOST = process.env.BRIDGE_UI_HOST ?? "127.0.0.1";
const BRIDGE_UI_PORT = parseInt(process.env.BRIDGE_UI_PORT ?? "3101", 10);
const DEFAULT_BRIDGE_CONFIG_PATH = path.resolve(__dirname, "..", "bridge.config.json");
const BRIDGE_CONFIG_PATH = path.resolve(
  process.env.BRIDGE_CONFIG_PATH ?? DEFAULT_BRIDGE_CONFIG_PATH,
);
const BRIDGE_SCAN_TIMEOUT_MS = parseInt(process.env.BRIDGE_SCAN_TIMEOUT_MS ?? "900", 10);

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

type BridgeConfig = {
  x32Ip: string;
  x32Port: number;
  useRealX32Io: boolean;
  updatedAt?: number;
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

type LocalIpv4Interface = {
  name: string;
  address: string;
  netmask: string;
};

type X32ProbeResponse = {
  address: string;
  args: Array<number | string>;
};

type X32ProbeResult = {
  ip: string;
  port: number;
  online: boolean;
  label: string;
  responses: X32ProbeResponse[];
  detectedAt: number;
  error?: string;
};

type BackendRuntimeStatus = {
  connected: boolean;
  transport?: string;
  lastError?: string;
  lastDisconnect?: string;
  healthOk?: boolean;
  healthCheckedAt?: number;
  healthError?: string;
};

type BridgeRuntimeStats = {
  udpLocalPort?: number;
  sentCount: number;
  udpErrorCount: number;
  lastSentAt?: number;
  lastCommand?: string;
};

const udpClient = dgram.createSocket("udp4");
let bridgeConfig = loadBridgeConfig();
let ioOptionsCache: BridgeIoOptions | null = null;
let lastX32Probe: X32ProbeResult | null = null;
let lastScan: {
  devices: X32ProbeResult[];
  scannedHosts: number;
  scannedAt: number;
} | null = null;
const backendStatus: BackendRuntimeStatus = {
  connected: false,
};
const bridgeStats: BridgeRuntimeStats = {
  sentCount: 0,
  udpErrorCount: 0,
};

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

function normalizePort(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }

  return parsed;
}

function isValidIpv4(value: string): boolean {
  return net.isIP(value) === 4;
}

function readPersistedBridgeConfig(): Partial<BridgeConfig> {
  try {
    if (!fs.existsSync(BRIDGE_CONFIG_PATH)) {
      return {};
    }

    const raw = fs.readFileSync(BRIDGE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<BridgeConfig>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn(
      `[BRIDGE] nao foi possivel ler ${BRIDGE_CONFIG_PATH}: ${
        error instanceof Error ? error.message : "erro desconhecido"
      }`,
    );
    return {};
  }
}

function loadBridgeConfig(): BridgeConfig {
  const persisted = readPersistedBridgeConfig();
  const persistedIp = typeof persisted.x32Ip === "string" && isValidIpv4(persisted.x32Ip)
    ? persisted.x32Ip
    : undefined;

  return {
    x32Ip: persistedIp ?? DEFAULT_X32_IP,
    x32Port: normalizePort(persisted.x32Port, DEFAULT_X32_PORT),
    useRealX32Io:
      typeof persisted.useRealX32Io === "boolean"
        ? persisted.useRealX32Io
        : DEFAULT_USE_REAL_X32_IO,
    updatedAt: typeof persisted.updatedAt === "number" ? persisted.updatedAt : undefined,
  };
}

function saveBridgeConfig(): void {
  const nextConfig: BridgeConfig = {
    ...bridgeConfig,
    updatedAt: Date.now(),
  };

  fs.writeFileSync(BRIDGE_CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  bridgeConfig = nextConfig;
}

function updateBridgeConfig(update: Partial<BridgeConfig>): BridgeConfig {
  const nextIp = update.x32Ip ?? bridgeConfig.x32Ip;
  if (!isValidIpv4(nextIp)) {
    throw new Error("IP da X32 invalido.");
  }

  bridgeConfig = {
    ...bridgeConfig,
    ...update,
    x32Ip: nextIp,
    x32Port: normalizePort(update.x32Port ?? bridgeConfig.x32Port, bridgeConfig.x32Port),
    useRealX32Io: update.useRealX32Io ?? bridgeConfig.useRealX32Io,
  };
  ioOptionsCache = null;
  saveBridgeConfig();

  return bridgeConfig;
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
    udpClient.send(requestPacket, bridgeConfig.x32Port, bridgeConfig.x32Ip, (error) => {
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
  if (!bridgeConfig.useRealX32Io) {
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

function getLocalIpv4Interfaces(): LocalIpv4Interface[] {
  const interfaces = os.networkInterfaces();
  const result: LocalIpv4Interface[] = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const addressInfo of addresses ?? []) {
      if (addressInfo.family !== "IPv4" || addressInfo.internal) {
        continue;
      }

      result.push({
        name,
        address: addressInfo.address,
        netmask: addressInfo.netmask,
      });
    }
  }

  return result;
}

function ipv4ToInt(value: string): number | undefined {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }

  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    parts[3]
  ) >>> 0;
}

function intToIpv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function getFallbackClassCCandidates(address: string): string[] {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return [];
  }

  const result: string[] = [];
  const prefix = parts.slice(0, 3).join(".");
  for (let host = 1; host <= 254; host += 1) {
    const ip = `${prefix}.${host}`;
    if (ip !== address) {
      result.push(ip);
    }
  }

  return result;
}

function getInterfaceCandidates(item: LocalIpv4Interface): string[] {
  const address = ipv4ToInt(item.address);
  const netmask = ipv4ToInt(item.netmask);
  if (address === undefined || netmask === undefined) {
    return getFallbackClassCCandidates(item.address);
  }

  const network = (address & netmask) >>> 0;
  const broadcast = (network | (~netmask >>> 0)) >>> 0;
  const hostCount = broadcast > network ? broadcast - network - 1 : 0;
  if (hostCount <= 0 || hostCount > 1024) {
    return getFallbackClassCCandidates(item.address);
  }

  const result: string[] = [];
  for (let cursor = network + 1; cursor < broadcast; cursor += 1) {
    if (cursor !== address) {
      result.push(intToIpv4(cursor));
    }
  }

  return result;
}

function getScanCandidates(): string[] {
  const candidates = new Set<string>();

  for (const item of getLocalIpv4Interfaces()) {
    for (const ip of getInterfaceCandidates(item)) {
      candidates.add(ip);
    }
  }

  return Array.from(candidates).sort((a, b) => {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let idx = 0; idx < 4; idx += 1) {
      if (left[idx] !== right[idx]) {
        return left[idx] - right[idx];
      }
    }
    return 0;
  });
}

function getClassCCandidates(): string[] {
  return getScanCandidates();
}

function inferX32Label(responses: X32ProbeResponse[]): string {
  const strings = responses
    .flatMap((response) => response.args)
    .filter((arg): arg is string => typeof arg === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return strings.slice(0, 3).join(" / ") || "Mesa OSC encontrada";
}

function buildProbePackets(): Buffer[] {
  return ["/xinfo", "/info", "/status", "/ch/01/config/name"].map((address) =>
    encodeOscMessage(address, []),
  );
}

function scanOscTargets(
  targets: string[],
  port: number,
  timeoutMs: number,
): Promise<X32ProbeResult[]> {
  return new Promise((resolve) => {
    const targetSet = new Set(targets);
    const devices = new Map<string, X32ProbeResponse[]>();
    const socket = dgram.createSocket("udp4");
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        // Socket ja fechado.
      }

      const now = Date.now();
      resolve(
        Array.from(devices.entries())
          .map(([ip, responses]) => ({
            ip,
            port,
            online: true,
            label: inferX32Label(responses),
            responses,
            detectedAt: now,
          }))
          .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true })),
      );
    };

    const timer = setTimeout(finish, timeoutMs);

    socket.on("message", (packet, rinfo) => {
      if (!targetSet.has(rinfo.address)) {
        return;
      }

      try {
        const decoded = decodeOscMessage(packet);
        const responses = devices.get(rinfo.address) ?? [];
        responses.push({
          address: decoded.address,
          args: decoded.args,
        });
        devices.set(rinfo.address, responses);
      } catch {
        const responses = devices.get(rinfo.address) ?? [];
        responses.push({
          address: "resposta OSC",
          args: [],
        });
        devices.set(rinfo.address, responses);
      }
    });

    socket.on("error", () => {
      // Durante a varredura alguns hosts podem rejeitar UDP; isso nao invalida a busca.
    });

    socket.bind(0, () => {
      const packets = buildProbePackets();
      for (const target of targets) {
        for (const packet of packets) {
          socket.send(packet, port, target);
        }
      }
    });
  });
}

async function scanNetworkForMixers(): Promise<{
  devices: X32ProbeResult[];
  scannedHosts: number;
  scannedAt: number;
}> {
  const targets = getClassCCandidates();
  const devices = await scanOscTargets(targets, bridgeConfig.x32Port, BRIDGE_SCAN_TIMEOUT_MS);
  const result = {
    devices,
    scannedHosts: targets.length,
    scannedAt: Date.now(),
  };

  lastScan = result;
  return result;
}

async function probeMixer(
  ip: string,
  port: number,
  timeoutMs = 1200,
  recordResult = false,
): Promise<X32ProbeResult> {
  const devices = await scanOscTargets([ip], port, timeoutMs);
  const result =
    devices[0] ??
    ({
      ip,
      port,
      online: false,
      label: "Sem resposta OSC",
      responses: [],
      detectedAt: Date.now(),
      error: "A mesa nao respondeu na porta OSC configurada.",
    } satisfies X32ProbeResult);

  if (recordResult) {
    lastX32Probe = result;
  }
  return result;
}

async function probeConfiguredMixer(timeoutMs = 1200): Promise<X32ProbeResult> {
  return probeMixer(bridgeConfig.x32Ip, bridgeConfig.x32Port, timeoutMs, true);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload muito grande."));
      }
    });

    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new Error("JSON invalido."));
      }
    });

    req.on("error", reject);
  });
}

function buildStatusPayload() {
  return {
    bridgeName: BRIDGE_NAME,
    backendUrl: BACKEND_URL,
    config: bridgeConfig,
    backend: backendStatus,
    x32: lastX32Probe,
    interfaces: getLocalIpv4Interfaces(),
    stats: bridgeStats,
    ioOptions: ioOptionsCache
      ? {
          source: ioOptionsCache.source,
          buses: ioOptionsCache.buses.length,
          channels: ioOptionsCache.channels.length,
          fetchedAt: ioOptionsCache.fetchedAt,
          error: ioOptionsCache.error,
        }
      : null,
    lastScan,
    ui: {
      host: BRIDGE_UI_HOST,
      port: BRIDGE_UI_PORT,
    },
  };
}

function bridgeUiHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>X32 Bridge</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Arial, Helvetica, sans-serif;
        background: #101418;
        color: #f4f7fb;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: #101418; color: #f4f7fb; }
      main { width: min(1100px, 100%); margin: 0 auto; padding: 24px; }
      header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 28px; }
      h2 { margin: 0 0 12px; font-size: 18px; }
      p { margin: 0; color: #aeb9c6; }
      button, input {
        font: inherit;
        border: 1px solid #33404d;
        background: #19212a;
        color: #f4f7fb;
        border-radius: 6px;
        padding: 10px 12px;
      }
      button { cursor: pointer; background: #246bfe; border-color: #246bfe; font-weight: 700; }
      button.secondary { background: #19212a; border-color: #33404d; }
      button:disabled { opacity: .55; cursor: wait; }
      label { display: grid; gap: 6px; color: #cbd5e1; font-size: 13px; }
      input { width: 100%; }
      .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; }
      .panel {
        grid-column: span 6;
        border: 1px solid #263241;
        background: #151b22;
        border-radius: 8px;
        padding: 16px;
      }
      .panel.full { grid-column: 1 / -1; }
      .status-row { display: grid; grid-template-columns: 160px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid #263241; }
      .status-row:last-child { border-bottom: 0; }
      .key { color: #8ea0b4; }
      .value { overflow-wrap: anywhere; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 6px 10px; background: #253140; color: #dbe7f5; font-size: 13px; }
      .ok { background: #123d2c; color: #8bf0be; }
      .bad { background: #451b1b; color: #ffaaa8; }
      .warn { background: #443616; color: #ffd479; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      .manual { display: grid; grid-template-columns: minmax(180px, 1fr) 120px auto; gap: 10px; align-items: end; margin-top: 12px; }
      .devices { display: grid; gap: 10px; }
      .device {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
        border: 1px solid #263241;
        background: #10161d;
        border-radius: 8px;
        padding: 12px;
      }
      .device strong { display: block; margin-bottom: 4px; }
      .muted { color: #8ea0b4; font-size: 13px; }
      .interfaces { display: flex; flex-wrap: wrap; gap: 8px; }
      .message { min-height: 22px; color: #ffd479; }
      @media (max-width: 760px) {
        main { padding: 16px; }
        header { display: grid; }
        .panel { grid-column: 1 / -1; }
        .manual { grid-template-columns: 1fr; }
        .device { grid-template-columns: 1fr; }
        .status-row { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>X32 Bridge</h1>
          <p>Controle local da conexao entre backend, bridge e mesa.</p>
        </div>
        <span id="backend-pill" class="pill warn">Backend</span>
      </header>

      <section class="grid">
        <article class="panel">
          <h2>Status</h2>
          <div class="status-row"><span class="key">Backend</span><span id="backend" class="value">-</span></div>
          <div class="status-row"><span class="key">Mesa</span><span id="mixer" class="value">-</span></div>
          <div class="status-row"><span class="key">OSC</span><span id="osc" class="value">-</span></div>
          <div class="status-row"><span class="key">IO</span><span id="io" class="value">-</span></div>
        </article>

        <article class="panel">
          <h2>Dados</h2>
          <div class="status-row"><span class="key">Bridge</span><span id="bridge-name" class="value">-</span></div>
          <div class="status-row"><span class="key">Backend URL</span><span id="backend-url" class="value">-</span></div>
          <div class="status-row"><span class="key">Comandos enviados</span><span id="sent" class="value">-</span></div>
          <div class="status-row"><span class="key">Erros UDP</span><span id="udp-errors" class="value">-</span></div>
        </article>

        <article class="panel full">
          <h2>Conectar mesa</h2>
          <div class="actions">
            <button id="scan">Buscar mesa na rede</button>
            <button id="test" class="secondary">Testar mesa selecionada</button>
            <button id="refresh-io" class="secondary">Ler nomes de canais/BUS</button>
          </div>
          <form id="manual" class="manual">
            <label>
              IP manual
              <input id="manual-ip" placeholder="192.168.0.100" />
            </label>
            <label>
              Porta OSC
              <input id="manual-port" type="number" min="1" max="65535" value="10023" />
            </label>
            <button type="submit">Conectar</button>
          </form>
          <p id="message" class="message"></p>
        </article>

        <article class="panel full">
          <h2>Mesas encontradas</h2>
          <div id="devices" class="devices">
            <p class="muted">Clique em buscar para localizar a X32 na rede.</p>
          </div>
        </article>

        <article class="panel full">
          <h2>Redes deste computador</h2>
          <div id="interfaces" class="interfaces"></div>
        </article>
      </section>
    </main>

    <script>
      const state = { busy: false };
      const $ = (id) => document.getElementById(id);

      function fmtTime(value) {
        return value ? new Date(value).toLocaleString() : "-";
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: {
            "content-type": "application/json",
            ...(options.headers || {}),
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Falha na requisicao.");
        }
        return data;
      }

      function setMessage(text) {
        $("message").textContent = text || "";
      }

      function renderStatus(data) {
        const backendOk = Boolean(data.backend && data.backend.connected);
        $("backend-pill").className = backendOk ? "pill ok" : "pill bad";
        $("backend-pill").textContent = backendOk ? "Backend conectado" : "Backend offline";

        $("bridge-name").textContent = data.bridgeName || "-";
        $("backend-url").textContent = data.backendUrl || "-";
        $("backend").textContent = backendOk
          ? "Conectado via " + (data.backend.transport || "-")
          : (data.backend.lastError || data.backend.lastDisconnect || "Desconectado");

        const config = data.config || {};
        const x32 = data.x32;
        $("mixer").textContent = config.x32Ip + ":" + config.x32Port +
          (x32 ? " - " + (x32.online ? "respondendo" : "sem resposta") : "");
        $("osc").textContent = x32
          ? x32.label + " - " + fmtTime(x32.detectedAt)
          : "Ainda nao testado";
        $("io").textContent = data.ioOptions
          ? data.ioOptions.source + " - " + data.ioOptions.channels + " canais / " + data.ioOptions.buses + " BUS"
          : (config.useRealX32Io ? "Real habilitado, ainda sem leitura" : "Mock");
        $("sent").textContent = String(data.stats.sentCount || 0) +
          (data.stats.lastCommand ? " - " + data.stats.lastCommand : "");
        $("udp-errors").textContent = String(data.stats.udpErrorCount || 0);
        $("manual-ip").value = config.x32Ip || "";
        $("manual-port").value = config.x32Port || 10023;

        const interfaces = $("interfaces");
        interfaces.innerHTML = "";
        for (const item of data.interfaces || []) {
          const pill = document.createElement("span");
          pill.className = "pill";
          pill.textContent = item.name + " - " + item.address;
          interfaces.appendChild(pill);
        }
      }

      function renderDevices(devices) {
        const root = $("devices");
        root.innerHTML = "";
        if (!devices || devices.length === 0) {
          const empty = document.createElement("p");
          empty.className = "muted";
          empty.textContent = "Nenhuma mesa respondeu. Confira cabo/rede/Wi-Fi e firewall.";
          root.appendChild(empty);
          return;
        }

        for (const device of devices) {
          const item = document.createElement("div");
          item.className = "device";

          const info = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = device.ip + ":" + device.port;
          const meta = document.createElement("span");
          meta.className = "muted";
          meta.textContent = device.label + " - " + device.responses.length + " resposta(s)";
          info.appendChild(title);
          info.appendChild(meta);

          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Conectar";
          button.onclick = () => connectMixer(device.ip, device.port);

          item.appendChild(info);
          item.appendChild(button);
          root.appendChild(item);
        }
      }

      async function refreshStatus() {
        try {
          renderStatus(await api("/api/status"));
        } catch (error) {
          setMessage(error.message);
        }
      }

      async function runBusy(button, task) {
        if (state.busy) return;
        state.busy = true;
        button.disabled = true;
        try {
          await task();
        } catch (error) {
          setMessage(error.message);
        } finally {
          button.disabled = false;
          state.busy = false;
        }
      }

      async function connectMixer(ip, port) {
        setMessage("Conectando em " + ip + "...");
        const result = await api("/api/connect", {
          method: "POST",
          body: JSON.stringify({ ip, port }),
        });
        renderStatus(result.status);
        setMessage(result.probe.online ? "Mesa conectada." : "IP salvo, mas a mesa nao respondeu.");
      }

      $("scan").onclick = () => runBusy($("scan"), async () => {
        setMessage("Buscando na rede...");
        const result = await api("/api/scan", { method: "POST", body: "{}" });
        renderDevices(result.devices);
        renderStatus(result.status);
        setMessage("Busca finalizada: " + result.devices.length + " encontrada(s) em " + result.scannedHosts + " IPs.");
      });

      $("test").onclick = () => runBusy($("test"), async () => {
        setMessage("Testando mesa selecionada...");
        const result = await api("/api/test", { method: "POST", body: "{}" });
        renderStatus(result.status);
        setMessage(result.probe.online ? "Mesa respondeu." : "Sem resposta da mesa.");
      });

      $("refresh-io").onclick = () => runBusy($("refresh-io"), async () => {
        setMessage("Lendo nomes da mesa...");
        const result = await api("/api/refresh-io", { method: "POST", body: "{}" });
        renderStatus(result.status);
        setMessage(result.options.error || "Leitura de IO concluida.");
      });

      $("manual").onsubmit = (event) => {
        event.preventDefault();
        connectMixer($("manual-ip").value.trim(), Number($("manual-port").value));
      };

      refreshStatus();
      setInterval(refreshStatus, 2500);
    </script>
  </body>
</html>`;
}

async function handleBridgeUiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "GET" && requestUrl.pathname === "/") {
      sendHtml(res, bridgeUiHtml());
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/status") {
      sendJson(res, 200, buildStatusPayload());
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/scan") {
      const result = await scanNetworkForMixers();
      sendJson(res, 200, {
        ...result,
        status: buildStatusPayload(),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/connect") {
      const payload = await readJsonBody(req);
      const ip = typeof payload.ip === "string" ? payload.ip.trim() : "";
      if (!isValidIpv4(ip)) {
        sendJson(res, 400, { error: "IP invalido." });
        return;
      }

      const port = normalizePort(payload.port, bridgeConfig.x32Port);
      const probe = await probeMixer(ip, port);
      if (!probe.online) {
        sendJson(res, 400, {
          error: "A mesa nao respondeu nesse IP.",
          probe,
          status: buildStatusPayload(),
        });
        return;
      }

      updateBridgeConfig({
        x32Ip: ip,
        x32Port: port,
        useRealX32Io: true,
      });
      lastX32Probe = probe;
      sendJson(res, 200, {
        config: bridgeConfig,
        probe,
        status: buildStatusPayload(),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/test") {
      const probe = await probeConfiguredMixer();
      sendJson(res, 200, {
        probe,
        status: buildStatusPayload(),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/refresh-io") {
      bridgeConfig.useRealX32Io = true;
      saveBridgeConfig();
      const options = await getIoOptions(true);
      sendJson(res, 200, {
        options,
        status: buildStatusPayload(),
      });
      return;
    }

    sendJson(res, 404, { error: "Rota nao encontrada." });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Erro inesperado.",
    });
  }
}

function startBridgeUi(): void {
  const server = http.createServer((req, res) => {
    void handleBridgeUiRequest(req, res);
  });

  server.listen(BRIDGE_UI_PORT, BRIDGE_UI_HOST, () => {
    const hostLabel = BRIDGE_UI_HOST === "0.0.0.0" ? "localhost" : BRIDGE_UI_HOST;
    console.log(`[BRIDGE_UI] aberto em http://${hostLabel}:${BRIDGE_UI_PORT}`);
  });

  server.on("error", (error) => {
    console.error(`[BRIDGE_UI] erro: ${error.message}`);
  });
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
      backendStatus.healthOk = false;
      backendStatus.healthCheckedAt = Date.now();
      backendStatus.healthError = `HTTP ${response.status}`;
      console.error(`[BRIDGE] backend respondeu ${healthUrl} com HTTP ${response.status}`);
      return;
    }

    backendStatus.healthOk = true;
    backendStatus.healthCheckedAt = Date.now();
    backendStatus.healthError = undefined;
    console.log(`[BRIDGE] backend acessivel em ${healthUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    backendStatus.healthOk = false;
    backendStatus.healthCheckedAt = Date.now();
    backendStatus.healthError = message;
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
    backendStatus.connected = true;
    backendStatus.transport = transport;
    backendStatus.lastError = undefined;
    backendStatus.lastDisconnect = undefined;
    console.log(`[BRIDGE] conectado ao backend (${BACKEND_URL}) via ${transport}`);
  });

  socket.io.engine.on("upgrade", (transport) => {
    backendStatus.transport = transport.name;
    console.log(`[BRIDGE] transporte atualizado para ${transport.name}`);
  });

  socket.on("disconnect", (reason) => {
    backendStatus.connected = false;
    backendStatus.lastDisconnect = reason;
    console.log(`[BRIDGE] desconectado: ${reason}`);
  });

  socket.on("connect_error", (error) => {
    const message = describeConnectError(error);
    backendStatus.connected = false;
    backendStatus.lastError = message;
    console.error(`[BRIDGE] erro de conexao: ${message}`);
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

      udpClient.send(message, bridgeConfig.x32Port, bridgeConfig.x32Ip, (error) => {
        if (error) {
          bridgeStats.udpErrorCount += 1;
          console.error(
            `[BRIDGE][UDP_ERROR] token=${event.token} user=${event.user} path=${command.path} error=${error.message}`,
          );
          return;
        }

        bridgeStats.sentCount += 1;
        bridgeStats.lastSentAt = Date.now();
        bridgeStats.lastCommand = `${command.path}=${command.value}`;
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
startBridgeUi();

udpClient.bind(() => {
  const address = udpClient.address();
  if (typeof address !== "string") {
    bridgeStats.udpLocalPort = address.port;
  }
  console.log(`[BRIDGE] UDP socket local em ${(typeof address === "string" ? address : address.port)}`);
});

udpClient.on("error", (error) => {
  bridgeStats.udpErrorCount += 1;
  console.error(`[BRIDGE][UDP_SOCKET_ERROR] ${error.message}`);
});
