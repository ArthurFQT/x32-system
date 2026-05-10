import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SERVER_URL } from "@/lib/env";
import { formatDateTime, formatTimeLeft } from "@/lib/format";
import {
  PageContainer,
  CardWide,
  Header,
  Title,
  StatusPill,
  AlertMessage,
  MetaGrid,
  MetaItem,
} from "@/styles";
import {
  BusSelectionContainer,
  BusButton,
  ChannelsSection,
  ControlCard,
  ControlHeader,
  ControlTitle,
  ControlGroup,
  ControlLabel,
  RangeInput,
  MuteButton,
  MixMetaGrid,
} from "./styles";
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
  const [controlsByBus, setControlsByBus] = useState<
    Record<number, ChannelControl[]>
  >({});
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
    (
      eventName: "control:volume",
      bus: number,
      channel: number,
      value: number,
    ) => {
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

      flushTimerRef.current = window.setTimeout(
        flushQueuedControls,
        CONTROL_FLUSH_MS,
      );
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
          current === controlErrorMessage("BRIDGE_NOT_CONNECTED")
            ? ""
            : current,
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
        if (
          current === "revoked" ||
          current === "expired" ||
          current === "invalid"
        ) {
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
    <PageContainer>
      <CardWide>
        <Header>
          <Title>X32 Monitor Control</Title>
          <StatusPill status={status}>{statusLabel[status]}</StatusPill>
        </Header>

        <MixMetaGrid>
          <MetaItem>
            <strong>Musico:</strong> {user}
          </MetaItem>
          <MetaItem>
            <strong>BUS ativo:</strong> {currentBus ?? "-"}
          </MetaItem>
          <MetaItem>
            <strong>Expira em:</strong> {formatTimeLeft(expiresAt, nowTs)} (
            {formatDateTime(expiresAt)})
          </MetaItem>
          <MetaItem>
            <strong>Bridge:</strong>{" "}
            {bridgeConnected ? "conectada" : "desconectada"}
          </MetaItem>
        </MixMetaGrid>

        {error && <AlertMessage type="error">{error}</AlertMessage>}
        {bridgeWarning && (
          <AlertMessage type="warning">{bridgeWarning}</AlertMessage>
        )}

        {availableBuses.length > 0 && (
          <BusSelectionContainer>
            {availableBuses.map((bus) => (
              <BusButton
                key={`bus-${bus}`}
                isActive={bus === currentBus}
                onClick={() => setCurrentBus(bus)}
                disabled={controlsDisabled}
              >
                BUS {bus}
              </BusButton>
            ))}
          </BusSelectionContainer>
        )}

        <ChannelsSection disabled={controlsDisabled}>
          {channels.map((channelData) => {
            const volumePercent = Math.round(channelData.volume * 100);
            const panPercent = Math.round((channelData.pan + 1) * 50);

            return (
              <ControlCard key={channelData.channel}>
                <ControlHeader>
                  <ControlTitle>Canal {channelData.channel}</ControlTitle>
                  <StatusPill status="active">{volumePercent}%</StatusPill>
                </ControlHeader>

                <ControlGroup>
                  <ControlLabel htmlFor={`volume-${channelData.channel}`}>
                    Fader de volume
                  </ControlLabel>
                  <RangeInput
                    id={`volume-${channelData.channel}`}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={channelData.volume}
                    percent={volumePercent}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      onVolumeInput(
                        channelData.channel,
                        Number(event.target.value),
                      )
                    }
                    onMouseUp={flushOnRelease}
                    onTouchEnd={flushOnRelease}
                  />
                </ControlGroup>

                <ControlGroup>
                  <ControlLabel htmlFor={`pan-${channelData.channel}`}>
                    Pan
                  </ControlLabel>
                  <RangeInput
                    id={`pan-${channelData.channel}`}
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={channelData.pan}
                    percent={panPercent}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      onPanInput(
                        channelData.channel,
                        Number(event.target.value),
                      )
                    }
                  />
                </ControlGroup>

                <MuteButton
                  type="button"
                  muted={channelData.mute === 1}
                  disabled={controlsDisabled}
                  onClick={() =>
                    sendMute(
                      channelData.channel,
                      channelData.mute === 1 ? 0 : 1,
                    )
                  }
                >
                  {channelData.mute === 1 ? "Desmutar" : "Mutar"}
                </MuteButton>
              </ControlCard>
            );
          })}
        </ChannelsSection>
      </CardWide>
    </PageContainer>
  );
}
