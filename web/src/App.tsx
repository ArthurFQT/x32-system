import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type SessionStatus =
  | "connecting"
  | "active"
  | "revoked"
  | "expired"
  | "invalid"
  | "offline";

type ChannelControl = {
  channel: number;
  volume: number;
  pan: number;
  mute: 0 | 1;
};

type SessionInitPayload = {
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

type BlockPayload = {
  reason: "revoked" | "expired";
};

type BridgeStatusPayload = {
  connected: boolean;
};

type ControlAck =
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

type AdminToken = {
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

type OverviewResponse = {
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

type TokensResponse = {
  tokens: AdminToken[];
};

type LogEntry = {
  timestamp: string;
  action: string;
  [key: string]: unknown;
};

type LogsResponse = {
  logs: LogEntry[];
};

type GenerateResponse = {
  token: string;
  accessUrl: string;
  qrCodeDataUrl: string;
  tokenData: AdminToken;
};

type QrResponse = {
  token: string;
  accessUrl: string;
  qrCodeDataUrl: string;
};

type IoOption = {
  id: number;
  label: string;
};

type IoOptionsPayload = {
  source: "mock" | "real" | "fallback";
  buses: IoOption[];
  channels: IoOption[];
  fetchedAt: number;
  error?: string;
};

type IoOptionsResponse = {
  mode: "mock" | "real";
  options: IoOptionsPayload;
};

type ApiError = {
  error?: string;
  message?: string;
};

type QueuedControl = {
  eventName: "control:volume";
  bus: number;
  channel: number;
  value: number;
};

function isLocalBackendUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function resolveServerUrl(): string {
  const configured = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  const browserHost = window.location.hostname;
  const isBrowserOnLocalhost = ["localhost", "127.0.0.1", "::1"].includes(browserHost);

  if (browserHost && !isBrowserOnLocalhost && (!configured || isLocalBackendUrl(configured))) {
    return `${window.location.protocol}//${browserHost}:3000`;
  }

  return configured || "http://localhost:3000";
}

const SERVER_URL = resolveServerUrl();
const ADMIN_KEY_STORAGE = "x32_admin_key";
const CONTROL_FLUSH_MS = 70;

const statusLabel: Record<SessionStatus, string> = {
  connecting: "Conectando",
  active: "Ativo",
  revoked: "Revogado",
  expired: "Expirado",
  invalid: "Invalido",
  offline: "Offline",
};

function parseTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get("token") ?? "").trim();
}

function busToString(bus: number | number[]): string {
  return Array.isArray(bus) ? bus.join(",") : String(bus);
}

function mapSocketError(message: string): SessionStatus {
  if (message.includes("TOKEN_EXPIRED")) {
    return "expired";
  }

  if (message.includes("TOKEN_REVOKED")) {
    return "revoked";
  }

  return "invalid";
}

function formatDateTime(ts: number | null): string {
  if (!ts) {
    return "-";
  }

  return new Date(ts).toLocaleString("pt-BR");
}

function formatTimeLeft(expiresAt: number | null, nowTs: number): string {
  if (!expiresAt) {
    return "-";
  }

  const diff = expiresAt - nowTs;
  if (diff <= 0) {
    return "expirado";
  }

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function toggleSelection(values: number[], item: number): number[] {
  if (values.includes(item)) {
    return values.filter((value) => value !== item);
  }
  return [...values, item].sort((a, b) => a - b);
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    return body.error ?? body.message ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}

function controlErrorMessage(error?: string): string {
  const messages: Record<string, string> = {
    BRIDGE_NOT_CONNECTED: "Bridge local desconectada.",
    BUS_LOCKED_TO_TOKEN: "BUS bloqueado para este acesso.",
    CHANNEL_NOT_ALLOWED: "Canal nao autorizado.",
    CONTROL_NOT_ALLOWED: "Controle nao permitido.",
    TOKEN_EXPIRED: "Seu acesso expirou.",
    TOKEN_REVOKED: "Seu acesso foi revogado.",
  };

  if (!error) {
    return "Falha no controle.";
  }

  return messages[error] ?? error;
}

function sliderStyle(percent: number): Record<string, string> {
  return {
    background: `linear-gradient(90deg, #6fb7ff 0%, #6fb7ff ${percent}%, #2a2a2a ${percent}%, #2a2a2a 100%)`,
  };
}

function MixView() {
  const isMixRoute = window.location.pathname === "/mix";
  const token = useMemo(() => parseTokenFromUrl(), []);
  const socketRef = useRef<Socket | null>(null);
  const queuedControlsRef = useRef<Map<string, QueuedControl>>(new Map());
  const flushTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<SessionStatus>("connecting");
  const [user, setUser] = useState<string>("-");
  const [currentBus, setCurrentBus] = useState<number | null>(null);
  const [availableBuses, setAvailableBuses] = useState<number[]>([]);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [controlsByBus, setControlsByBus] = useState<Record<number, ChannelControl[]>>({});
  const [channels, setChannels] = useState<ChannelControl[]>([]);
  const [bridgeConnected, setBridgeConnected] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [nowTs, setNowTs] = useState<number>(Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  const flushQueuedControls = useCallback(() => {
    flushTimerRef.current = null;

    const socket = socketRef.current;
    if (!socket) {
      queuedControlsRef.current.clear();
      return;
    }

    const payloads = Array.from(queuedControlsRef.current.values());
    queuedControlsRef.current.clear();

    for (const payload of payloads) {
      socket.emit(
        payload.eventName,
        { bus: payload.bus, channel: payload.channel, value: payload.value },
        (ack: ControlAck) => {
          if (!ack?.ok) {
            setError(controlErrorMessage(ack?.error));
            if (ack?.error === "BRIDGE_NOT_CONNECTED") {
              setBridgeConnected(false);
            }
            if (ack?.blockedReason === "expired") {
              setStatus("expired");
            } else if (ack?.blockedReason === "revoked") {
              setStatus("revoked");
            }
          } else {
            setError("");
          }
        },
      );
    }
  }, []);

  const queueControl = useCallback(
    (eventName: "control:volume", bus: number, channel: number, value: number) => {
      const key = `${eventName}:${bus}:${channel}`;
      queuedControlsRef.current.set(key, {
        eventName,
        bus,
        channel,
        value,
      });

      if (flushTimerRef.current !== null) {
        return;
      }

      flushTimerRef.current = window.setTimeout(flushQueuedControls, CONTROL_FLUSH_MS);
    },
    [flushQueuedControls],
  );

  useEffect(() => {
    if (!isMixRoute) {
      setStatus("invalid");
      setError("Acesse pela rota /mix.");
      return;
    }

    if (!token) {
      setStatus("invalid");
      setError("Token ausente na URL.");
      return;
    }

    const socket = io(SERVER_URL, {
      auth: {
        role: "musician",
        token,
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connecting");
      setError("");
    });

    socket.on("session:init", (payload: SessionInitPayload) => {
      setUser(payload.user);
      setAvailableBuses(payload.buses);
      setCurrentBus(payload.bus);
      setExpiresAt(payload.expiresAt);
      setControlsByBus(payload.controlsByBus);
      setChannels(payload.controlsByBus[payload.bus] ?? []);
      setBridgeConnected(payload.bridgeConnected);
      setStatus(payload.enabled ? "active" : "invalid");
      setError("");
    });

    socket.on("bridge:status", (payload: BridgeStatusPayload) => {
      setBridgeConnected(payload.connected);
      if (payload.connected) {
        setError((current) =>
          current === controlErrorMessage("BRIDGE_NOT_CONNECTED") ? "" : current,
        );
      }
    });

    socket.on("session:blocked", (payload: BlockPayload) => {
      setStatus(payload.reason === "expired" ? "expired" : "revoked");
      setError(
        payload.reason === "expired"
          ? "Seu acesso expirou."
          : "Seu acesso foi revogado.",
      );
    });

    socket.on("connect_error", (connectError) => {
      const nextStatus = mapSocketError(connectError.message);
      setStatus(nextStatus);
      setError(connectError.message);
    });

    socket.on("disconnect", () => {
      setStatus((current) => {
        if (current === "revoked" || current === "expired" || current === "invalid") {
          return current;
        }
        return "offline";
      });
    });

    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
      queuedControlsRef.current.clear();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [flushQueuedControls, isMixRoute, token]);

  useEffect(() => {
    if (status === "active" && expiresAt && nowTs > expiresAt) {
      setStatus("expired");
      setError("Seu acesso expirou.");
    }
  }, [expiresAt, nowTs, status]);

  useEffect(() => {
    if (availableBuses.length === 0) {
      return;
    }

    if (currentBus === null || !availableBuses.includes(currentBus)) {
      setCurrentBus(availableBuses[0]);
    }
  }, [availableBuses, currentBus]);

  useEffect(() => {
    if (currentBus === null) {
      setChannels([]);
      return;
    }

    setChannels(controlsByBus[currentBus] ?? []);
  }, [controlsByBus, currentBus]);

  const controlsDisabled = status !== "active" || !bridgeConnected;

  const updateLocalControl = useCallback(
    (bus: number, channel: number, patch: Partial<ChannelControl>) => {
      setControlsByBus((prev) => {
        const busControls = prev[bus] ?? [];
        const nextBusControls = busControls.map((item) =>
          item.channel === channel ? { ...item, ...patch } : item,
        );

        const next = {
          ...prev,
          [bus]: nextBusControls,
        };

        if (bus === currentBus) {
          setChannels(nextBusControls);
        }

        return next;
      });
    },
    [currentBus],
  );

  const sendMute = useCallback(
    (channel: number, value: 0 | 1) => {
      const socket = socketRef.current;
      if (!socket || controlsDisabled || currentBus === null) {
        return;
      }

      updateLocalControl(currentBus, channel, { mute: value });
      socket.emit(
        "control:mute",
        { bus: currentBus, channel, value },
        (ack: ControlAck) => {
          if (!ack?.ok) {
            setError(controlErrorMessage(ack?.error));
            if (ack?.error === "BRIDGE_NOT_CONNECTED") {
              setBridgeConnected(false);
            }
            if (ack?.blockedReason === "expired") {
              setStatus("expired");
            } else if (ack?.blockedReason === "revoked") {
              setStatus("revoked");
            }
          } else {
            setError("");
          }
        },
      );
    },
    [controlsDisabled, currentBus, updateLocalControl],
  );

  const onVolumeInput = (channel: number, value: number) => {
    if (controlsDisabled || currentBus === null) {
      return;
    }

    updateLocalControl(currentBus, channel, { volume: value });
    queueControl("control:volume", currentBus, channel, value);
  };

  const onPanInput = (channel: number, value: number) => {
    if (controlsDisabled || currentBus === null) {
      return;
    }

    updateLocalControl(currentBus, channel, { pan: value });
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socket.emit(
      "control:pan",
      { bus: currentBus, channel, value },
      (ack: ControlAck) => {
        if (!ack?.ok) {
          setError(controlErrorMessage(ack?.error));
          if (ack?.error === "BRIDGE_NOT_CONNECTED") {
            setBridgeConnected(false);
          }
          if (ack?.blockedReason === "expired") {
            setStatus("expired");
          } else if (ack?.blockedReason === "revoked") {
            setStatus("revoked");
          }
        } else {
          setError("");
        }
      },
    );
  };

  const flushOnRelease = () => {
    flushQueuedControls();
  };

  const bridgeWarning =
    status === "active" && !bridgeConnected
      ? "A bridge local esta desconectada. Os controles ficam bloqueados ate ela conectar."
      : "";

  return (
    <div className="page">
      <main className="card musician-card">
        <header className="header">
          <h1>X32 Monitor Control</h1>
          <span className={`status status-${status}`}>{statusLabel[status]}</span>
        </header>

        <section className="meta musician-meta">
          <p>
            <strong>Musico:</strong> {user}
          </p>
          <p>
            <strong>BUS ativo:</strong> {currentBus ?? "-"}
          </p>
          <p>
            <strong>Expira em:</strong> {formatTimeLeft(expiresAt, nowTs)} (
            {formatDateTime(expiresAt)})
          </p>
          <p>
            <strong>Bridge:</strong> {bridgeConnected ? "conectada" : "desconectada"}
          </p>
        </section>

        {error && <p className="error">{error}</p>}
        {bridgeWarning && <p className="warning">{bridgeWarning}</p>}

        {availableBuses.length > 0 && (
          <section className="bus-selection">
            {availableBuses.map((bus) => (
              <button
                key={`bus-${bus}`}
                type="button"
                className={bus === currentBus ? "bus-button active" : "bus-button"}
                onClick={() => setCurrentBus(bus)}
                disabled={controlsDisabled}
              >
                BUS {bus}
              </button>
            ))}
          </section>
        )}

        <section className={`channels ${controlsDisabled ? "disabled" : ""}`}>
          {channels.map((channelData) => {
            const volumePercent = Math.round(channelData.volume * 100);

            return (
              <article className="channel-card fader-card" key={channelData.channel}>
                <div className="fader-header">
                  <h2>Canal {channelData.channel}</h2>
                  <span className="value-chip">Vol {volumePercent}%</span>
                </div>

                <label className="field-label" htmlFor={`volume-${channelData.channel}`}>
                  Fader de volume
                </label>
                <input
                  id={`volume-${channelData.channel}`}
                  className="fader-input"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={channelData.volume}
                  style={sliderStyle(volumePercent)}
                  disabled={controlsDisabled}
                  onChange={(event) => onVolumeInput(channelData.channel, Number(event.target.value))}
                  onMouseUp={flushOnRelease}
                  onTouchEnd={flushOnRelease}
                />

                <label className="field-label" htmlFor={`pan-${channelData.channel}`}>
                  Pan
                </label>
                <input
                  id={`pan-${channelData.channel}`}
                  className="fader-input"
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={channelData.pan}
                  disabled={controlsDisabled}
                  onChange={(event) => onPanInput(channelData.channel, Number(event.target.value))}
                />

                <button
                  type="button"
                  disabled={controlsDisabled}
                  className={channelData.mute === 1 ? "mute active" : "mute"}
                  onClick={() => sendMute(channelData.channel, channelData.mute === 1 ? 0 : 1)}
                >
                  {channelData.mute === 1 ? "Desmutar" : "Mutar"}
                </button>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function AdminView() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ioOptions, setIoOptions] = useState<IoOptionsPayload | null>(null);
  const [ioMode, setIoMode] = useState<"mock" | "real" | "unknown">("unknown");
  const [error, setError] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string>("");

  const [generateUser, setGenerateUser] = useState("musico");
  const [generateDuration, setGenerateDuration] = useState("60");
  const [generateBusSelection, setGenerateBusSelection] = useState<number[]>([]);
  const [generateChannelSelection, setGenerateChannelSelection] = useState<number[]>([]);

  const [editTokenId, setEditTokenId] = useState<string>("");
  const [editUser, setEditUser] = useState("");
  const [editBusSelection, setEditBusSelection] = useState<number[]>([]);
  const [editChannelSelection, setEditChannelSelection] = useState<number[]>([]);

  const [qrView, setQrView] = useState<QrResponse | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      setAdminKey(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
  }, [adminKey]);

  const apiRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const headers = new Headers(init?.headers ?? {});
      if (!headers.has("Content-Type") && init?.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      if (adminKey.trim()) {
        headers.set("x-admin-key", adminKey.trim());
      }

      const response = await fetch(`${SERVER_URL}${path}`, {
        ...init,
        headers,
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      return (await response.json()) as T;
    },
    [adminKey],
  );

  const refreshData = useCallback(
    async (refreshIo = false) => {
      try {
        const [overviewData, tokenData, logData, ioData] = await Promise.all([
          apiRequest<OverviewResponse>("/admin/overview"),
          apiRequest<TokensResponse>("/tokens"),
          apiRequest<LogsResponse>("/admin/logs?limit=150"),
          apiRequest<IoOptionsResponse>(`/admin/io-options${refreshIo ? "?refresh=true" : ""}`),
        ]);

        setOverview(overviewData);
        setTokens(tokenData.tokens);
        setLogs(logData.logs);
        setIoOptions(ioData.options);
        setIoMode(ioData.mode);
        setError("");
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Falha ao carregar dados.");
      }
    },
    [apiRequest],
  );

  useEffect(() => {
    void refreshData();
    const timer = setInterval(() => {
      void refreshData();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshData]);

  useEffect(() => {
    if (!ioOptions) {
      return;
    }

    if (generateBusSelection.length === 0) {
      setGenerateBusSelection(ioOptions.buses.slice(0, 1).map((item) => item.id));
    }

    if (generateChannelSelection.length === 0) {
      setGenerateChannelSelection(ioOptions.channels.slice(0, 3).map((item) => item.id));
    }
  }, [generateBusSelection.length, generateChannelSelection.length, ioOptions]);

  const doAction = async (actionId: string, action: () => Promise<void>) => {
    try {
      setBusyAction(actionId);
      await action();
      await refreshData();
      setError("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Acao falhou.");
    } finally {
      setBusyAction("");
    }
  };

  const submitGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (generateBusSelection.length === 0 || generateChannelSelection.length === 0) {
      setError("Selecione ao menos um BUS e um canal.");
      return;
    }

    const payload = {
      user: generateUser.trim(),
      bus: generateBusSelection.length === 1 ? generateBusSelection[0] : generateBusSelection,
      allowedChannels: generateChannelSelection,
      durationMinutes: Number(generateDuration),
    };

    await doAction("generate", async () => {
      const result = await apiRequest<GenerateResponse>("/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setQrView({
        token: result.token,
        accessUrl: result.accessUrl,
        qrCodeDataUrl: result.qrCodeDataUrl,
      });
    });
  };

  const loadQr = (tokenId: string) => {
    void doAction(`qr-${tokenId}`, async () => {
      const result = await apiRequest<QrResponse>(`/token/${tokenId}/qrcode`);
      setQrView(result);
    });
  };

  const beginEdit = (token: AdminToken) => {
    setEditTokenId(token.id);
    setEditUser(token.user);
    setEditBusSelection(Array.isArray(token.bus) ? token.bus : [token.bus]);
    setEditChannelSelection(token.allowedChannels);
  };

  const saveEdit = () => {
    if (!editTokenId) {
      return;
    }

    if (editBusSelection.length === 0 || editChannelSelection.length === 0) {
      setError("Selecione ao menos um BUS e um canal na edicao.");
      return;
    }

    const payload = {
      user: editUser.trim(),
      bus: editBusSelection.length === 1 ? editBusSelection[0] : editBusSelection,
      allowedChannels: editChannelSelection,
    };

    void doAction(`edit-${editTokenId}`, async () => {
      await apiRequest(`/token/${editTokenId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    });
  };

  const extendToken = (tokenId: string, minutes: number) => {
    void doAction(`extend-${tokenId}-${minutes}`, async () => {
      await apiRequest(`/token/${tokenId}/extend`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
    });
  };

  const revokeToken = (tokenId: string) => {
    void doAction(`revoke-${tokenId}`, async () => {
      await apiRequest(`/token/${tokenId}/revoke`, {
        method: "POST",
      });
    });
  };

  const enableToken = (tokenId: string) => {
    void doAction(`enable-${tokenId}`, async () => {
      await apiRequest(`/token/${tokenId}/enable`, {
        method: "POST",
      });
    });
  };

  const deleteToken = (tokenId: string) => {
    const ok = window.confirm("Deseja remover este token?");
    if (!ok) {
      return;
    }

    void doAction(`delete-${tokenId}`, async () => {
      await apiRequest(`/token/${tokenId}`, {
        method: "DELETE",
      });

      if (editTokenId === tokenId) {
        setEditTokenId("");
      }
    });
  };

  const selectedToken = useMemo(
    () => tokens.find((item) => item.id === editTokenId) ?? null,
    [tokens, editTokenId],
  );

  return (
    <div className="page admin-page">
      <main className="card admin-card">
        <header className="header admin-header">
          <h1>Painel Admin X32</h1>
          <div className="header-actions">
            <button type="button" className="refresh" onClick={() => void refreshData()}>
              Atualizar
            </button>
            <button type="button" className="refresh" onClick={() => void refreshData(true)}>
              Atualizar IO
            </button>
          </div>
        </header>

        <section className="admin-key">
          <label className="field">
            <span>Chave admin (x-admin-key)</span>
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="opcional se ADMIN_API_KEY vazio"
            />
          </label>
        </section>

        {error && <p className="error">{error}</p>}

        <section className="overview-grid">
          <article>
            <h3>Bridge</h3>
            <p>{overview?.bridgeConnected ? "Conectada" : "Desconectada"}</p>
          </article>
          <article>
            <h3>Musicos conectados</h3>
            <p>{overview?.connectedMusicians ?? 0}</p>
          </article>
          <article>
            <h3>Tokens ativos</h3>
            <p>{overview?.tokens.active ?? 0}</p>
          </article>
          <article>
            <h3>Total de tokens</h3>
            <p>{overview?.tokens.total ?? 0}</p>
          </article>
          <article>
            <h3>Modo IO</h3>
            <p>{ioMode}</p>
          </article>
          <article>
            <h3>Fonte IO</h3>
            <p>{ioOptions?.source ?? "-"}</p>
          </article>
        </section>

        <section className="admin-section">
          <h2>Gerar acesso</h2>
          <form className="admin-form" onSubmit={submitGenerate}>
            <label className="field">
              <span>Usuario</span>
              <input
                type="text"
                value={generateUser}
                onChange={(event) => setGenerateUser(event.target.value)}
                placeholder="Nome do musico"
                required
              />
            </label>

            <label className="field">
              <span>Duracao (minutos)</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={generateDuration}
                onChange={(event) => setGenerateDuration(event.target.value)}
                required
              />
            </label>

            <div className="field full-width">
              <span>BUS disponiveis</span>
              <div className="option-grid small-grid">
                {ioOptions?.buses.map((bus) => (
                  <label className="option-pill" key={`gen-bus-${bus.id}`}>
                    <input
                      type="checkbox"
                      checked={generateBusSelection.includes(bus.id)}
                      onChange={() => setGenerateBusSelection((prev) => toggleSelection(prev, bus.id))}
                    />
                    <span>{bus.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field full-width">
              <span>Canais disponiveis</span>
              <div className="option-grid channel-grid">
                {ioOptions?.channels.map((channel) => (
                  <label className="option-pill" key={`gen-channel-${channel.id}`}>
                    <input
                      type="checkbox"
                      checked={generateChannelSelection.includes(channel.id)}
                      onChange={() =>
                        setGenerateChannelSelection((prev) => toggleSelection(prev, channel.id))
                      }
                    />
                    <span>{channel.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="full-width">
              <button type="submit" disabled={busyAction === "generate"}>
                {busyAction === "generate" ? "Gerando..." : "Gerar token"}
              </button>
            </div>
          </form>

          {qrView && (
            <div className="qr-panel">
              <img src={qrView.qrCodeDataUrl} alt={`QR token ${qrView.token}`} />
              <div>
                <p>
                  <strong>Token:</strong> {qrView.token}
                </p>
                <p>
                  <strong>URL:</strong>
                </p>
                <a href={qrView.accessUrl} target="_blank" rel="noreferrer">
                  {qrView.accessUrl}
                </a>
              </div>
            </div>
          )}
        </section>

        <section className="admin-section">
          <h2>Editar token</h2>
          <div className="admin-form">
            <label className="field">
              <span>Token</span>
              <select
                value={editTokenId}
                onChange={(event) => {
                  const token = tokens.find((item) => item.id === event.target.value);
                  if (token) {
                    beginEdit(token);
                  } else {
                    setEditTokenId("");
                  }
                }}
              >
                <option value="">Selecione um token</option>
                {tokens.map((token) => (
                  <option value={token.id} key={token.id}>
                    {token.user} - {token.id.slice(0, 8)} - {token.status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Usuario</span>
              <input
                type="text"
                value={editUser}
                onChange={(event) => setEditUser(event.target.value)}
                disabled={!editTokenId}
              />
            </label>

            <div className="field full-width">
              <span>BUS autorizados</span>
              <div className="option-grid small-grid">
                {ioOptions?.buses.map((bus) => (
                  <label className="option-pill" key={`edit-bus-${bus.id}`}>
                    <input
                      type="checkbox"
                      checked={editBusSelection.includes(bus.id)}
                      onChange={() => setEditBusSelection((prev) => toggleSelection(prev, bus.id))}
                      disabled={!editTokenId}
                    />
                    <span>{bus.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field full-width">
              <span>Canais autorizados</span>
              <div className="option-grid channel-grid">
                {ioOptions?.channels.map((channel) => (
                  <label className="option-pill" key={`edit-channel-${channel.id}`}>
                    <input
                      type="checkbox"
                      checked={editChannelSelection.includes(channel.id)}
                      onChange={() => setEditChannelSelection((prev) => toggleSelection(prev, channel.id))}
                      disabled={!editTokenId}
                    />
                    <span>{channel.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="full-width">
              <button type="button" onClick={saveEdit} disabled={!editTokenId}>
                Salvar alteracoes
              </button>
            </div>
          </div>

          {selectedToken && (
            <div className="token-inline-actions">
              <button type="button" onClick={() => extendToken(selectedToken.id, 30)}>
                +30m
              </button>
              <button type="button" onClick={() => extendToken(selectedToken.id, 120)}>
                +2h
              </button>
              <button type="button" onClick={() => enableToken(selectedToken.id)}>
                Ativar
              </button>
              <button type="button" onClick={() => revokeToken(selectedToken.id)}>
                Revogar
              </button>
              <button type="button" className="danger" onClick={() => deleteToken(selectedToken.id)}>
                Excluir
              </button>
            </div>
          )}
        </section>

        <section className="admin-section">
          <h2>Tokens</h2>
          <div className="table-wrap">
            <table className="token-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Status</th>
                  <th>BUS</th>
                  <th>Canais</th>
                  <th>Expira</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td>
                      {token.user}
                      <small>{token.id}</small>
                    </td>
                    <td>{token.status}</td>
                    <td>{busToString(token.bus)}</td>
                    <td>{token.allowedChannels.join(",")}</td>
                    <td>{formatDateTime(token.expiresAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => window.open(token.accessUrl, "_blank")}>Abrir</button>
                        <button
                          type="button"
                          onClick={() => loadQr(token.id)}
                          disabled={busyAction.startsWith(`qr-${token.id}`)}
                        >
                          QR
                        </button>
                        <button type="button" onClick={() => beginEdit(token)}>Editar</button>
                        <button type="button" onClick={() => extendToken(token.id, 30)}>+30m</button>
                        <button type="button" onClick={() => enableToken(token.id)}>Ativar</button>
                        <button type="button" onClick={() => revokeToken(token.id)}>Revogar</button>
                        <button type="button" className="danger" onClick={() => deleteToken(token.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-section">
          <h2>Logs</h2>
          <div className="logs">
            {logs.map((entry, idx) => (
              <pre key={`${entry.timestamp}-${entry.action}-${idx}`}>{JSON.stringify(entry)}</pre>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function HomeView() {
  return (
    <div className="page">
      <main className="card home-card">
        <h1>X32 Monitor Control</h1>
        <p>Escolha uma rota:</p>
        <ul>
          <li>
            <a href="/admin">/admin</a>
          </li>
          <li>
            <a href="/mix">/mix?token=SEU_TOKEN</a>
          </li>
        </ul>
      </main>
    </div>
  );
}

export default function App() {
  const pathname = window.location.pathname;

  if (pathname === "/mix") {
    return <MixView />;
  }

  if (pathname === "/admin") {
    return <AdminView />;
  }

  return <HomeView />;
}
