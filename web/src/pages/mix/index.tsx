
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SERVER_URL } from "@/lib/env";
import { formatDateTime, formatTimeLeft } from "@/lib/format";
import type {
  BlockPayload,
  BridgeStatusPayload,
  ChannelControl,
  ControlAck,
  QueuedControl,
  SessionInitPayload,
  SessionStatus,
} from "@/types/app";

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

function mapSocketError(message: string): SessionStatus {
  if (message.includes("TOKEN_EXPIRED")) {
    return "expired";
  }

  if (message.includes("TOKEN_REVOKED")) {
    return "revoked";
  }

  return "invalid";
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

export function MixPage() {
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
