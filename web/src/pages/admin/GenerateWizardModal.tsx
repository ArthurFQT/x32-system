import { useState } from "react";
import styled, { keyframes } from "styled-components";
import { theme } from "@/styles/theme";
import { toggleSelection } from "@/lib/format";
import type { IoOptionsPayload, QrResponse } from "@/types/app";
import {
  Button,
  ButtonSmall,
  FieldLabel,
  TextInput,
  FlexColumn,
  FlexRow,
} from "@/styles";
import { OptionGridSmall, OptionGridChannels } from "./styles";

// ── Animations ────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const stepIn = keyframes`
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
`;

// ── Overlay & Shell ───────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: ${theme.spacing.lg};
  animation: ${fadeIn} 0.2s ease;
`;

const Shell = styled.div`
  width: 100%;
  max-width: 480px;
  max-height: calc(100dvh - ${theme.spacing.lg} * 2);
  display: flex;
  flex-direction: column;
  background: ${theme.colors.bg.secondary};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.lg};
  overflow: hidden;
  animation: ${slideUp} 0.25s ease;
`;

// ── Header ────────────────────────────────────────────────

const ModalHeader = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.lg};
  border-bottom: 1px solid ${theme.colors.border.primary};
  background: ${theme.colors.bg.tertiary};
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: ${theme.typography.fontSize.base};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.text.primary};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.text.muted};
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: ${theme.borderRadius.sm};
  line-height: 1;
  transition: color ${theme.transitions.fast};

  &:hover {
    color: ${theme.colors.text.primary};
  }
`;

// ── Step indicator ────────────────────────────────────────

const StepTrack = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-bottom: 1px solid ${theme.colors.border.primary};
  gap: 0;
`;

const StepDot = styled.div<{ active: boolean; done: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${theme.typography.fontSize.xs};
  font-weight: ${theme.typography.fontWeight.bold};
  flex-shrink: 0;
  transition: all 0.3s ease;

  background: ${(p) =>
    p.done
      ? theme.colors.accent
      : p.active
        ? "transparent"
        : theme.colors.bg.tertiary};
  border: 2px solid
    ${(p) =>
      p.done || p.active ? theme.colors.accent : theme.colors.border.primary};
  color: ${(p) =>
    p.done
      ? (theme.colors.bg.primary ?? "#0d0f12")
      : p.active
        ? theme.colors.accent
        : theme.colors.text.muted};
`;

const StepLine = styled.div<{ done: boolean }>`
  flex: 1;
  height: 2px;
  background: ${(p) =>
    p.done ? theme.colors.accent : theme.colors.border.primary};
  transition: background 0.3s ease;
`;

const StepLabel = styled.span<{ active: boolean }>`
  display: block;
  font-size: ${theme.typography.fontSize.xs};
  color: ${(p) => (p.active ? theme.colors.accent : theme.colors.text.muted)};
  margin-top: 4px;
  text-align: center;
  white-space: nowrap;
`;

const StepItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;

// ── Body ──────────────────────────────────────────────────

const ModalBody = styled.div`
  padding: ${theme.spacing.xl} ${theme.spacing.lg};
  min-height: 200px;
  flex: 1;
  overflow-y: auto;
  animation: ${stepIn} 0.2s ease;
`;

const StepHeading = styled.p`
  margin: 0 0 ${theme.spacing.lg} 0;
  font-size: ${theme.typography.fontSize.sm};
  color: ${theme.colors.text.muted};
`;

// ── QR result ─────────────────────────────────────────────

const QrResult = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.lg};
  text-align: center;

  img {
    width: 180px;
    height: 180px;
    border-radius: ${theme.borderRadius.md};
    border: 1px solid ${theme.colors.border.primary};
  }

  p {
    margin: 0;
    font-size: ${theme.typography.fontSize.sm};
    color: ${theme.colors.text.muted};
  }

  a {
    font-size: ${theme.typography.fontSize.xs};
    color: ${theme.colors.accent};
    word-break: break-all;
  }
`;

// ── Footer ────────────────────────────────────────────────

const ModalFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-top: 1px solid ${theme.colors.border.primary};
  background: ${theme.colors.bg.tertiary};
`;

// ── Types ─────────────────────────────────────────────────

interface Props {
  ioOptions: IoOptionsPayload;
  busyAction: string;
  onSubmit: (payload: {
    user: string;
    bus: number | number[];
    allowedChannels: number[];
    durationMinutes: number;
  }) => Promise<QrResponse | null>;
  onClose: () => void;
}

const STEPS = ["Acesso", "BUS", "Canais", "QR"];

// ── Component ─────────────────────────────────────────────

export function GenerateWizardModal({
  ioOptions,
  busyAction,
  onSubmit,
  onClose,
}: Props) {
  const [step, setStep] = useState(0);
  const [user, setUser] = useState("musico");
  const [duration, setDuration] = useState("60");
  const [busSelection, setBusSelection] = useState<number[]>(
    ioOptions.buses.slice(0, 1).map((b) => b.id),
  );
  const [channelSelection, setChannelSelection] = useState<number[]>(
    ioOptions.channels.slice(0, 3).map((c) => c.id),
  );
  const [qrView, setQrView] = useState<QrResponse | null>(null);
  const [error, setError] = useState("");

  const canNext = () => {
    if (step === 0) return user.trim().length > 0 && Number(duration) >= 1;
    if (step === 1) return busSelection.length > 0;
    if (step === 2) return channelSelection.length > 0;
    return true;
  };

  const handleNext = async () => {
    setError("");
    if (step < 2) {
      setStep((s) => s + 1);
      return;
    }
    // step 2 → generate
    const result = await onSubmit({
      user: user.trim(),
      bus: busSelection.length === 1 ? busSelection[0] : busSelection,
      allowedChannels: channelSelection,
      durationMinutes: Number(duration),
    });
    if (result) {
      setQrView(result);
      setStep(3);
    }
  };

  const busy = busyAction === "generate";

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Shell>
        {/* Header */}
        <ModalHeader>
          <ModalTitle>Gerar acesso</ModalTitle>
          <CloseButton type="button" onClick={onClose}>
            ✕
          </CloseButton>
        </ModalHeader>

        {/* Step indicator */}
        <StepTrack>
          {STEPS.map((label, i) => (
            <>
              <StepItem key={label}>
                <StepDot active={step === i} done={step > i}>
                  {step > i ? "✓" : i + 1}
                </StepDot>
                <StepLabel active={step === i}>{label}</StepLabel>
              </StepItem>
              {i < STEPS.length - 1 && (
                <StepLine key={`line-${i}`} done={step > i} />
              )}
            </>
          ))}
        </StepTrack>

        {/* Body */}
        <ModalBody key={step}>
          {step === 0 && (
            <FlexColumn>
              <StepHeading>
                Quem vai usar esse acesso e por quanto tempo?
              </StepHeading>
              <div>
                <FieldLabel htmlFor="wiz-user">Nome do músico</FieldLabel>
                <TextInput
                  id="wiz-user"
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="ex: João"
                  autoFocus
                />
              </div>
              <div>
                <FieldLabel htmlFor="wiz-duration">
                  Duração (minutos)
                </FieldLabel>
                <TextInput
                  id="wiz-duration"
                  type="number"
                  min={1}
                  max={1440}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </FlexColumn>
          )}

          {step === 1 && (
            <FlexColumn>
              <StepHeading>
                Quais retornos (BUS) este músico pode controlar?
              </StepHeading>
              <OptionGridSmall>
                {ioOptions.buses.map((bus) => (
                  <label key={`wiz-bus-${bus.id}`}>
                    <input
                      type="checkbox"
                      checked={busSelection.includes(bus.id)}
                      onChange={() =>
                        setBusSelection((p) => toggleSelection(p, bus.id))
                      }
                    />
                    <span>{bus.label}</span>
                  </label>
                ))}
              </OptionGridSmall>
            </FlexColumn>
          )}

          {step === 2 && (
            <FlexColumn>
              <StepHeading>
                Quais canais este músico pode ver e ajustar?
              </StepHeading>
              <OptionGridChannels>
                {ioOptions.channels.map((channel) => (
                  <label key={`wiz-ch-${channel.id}`}>
                    <input
                      type="checkbox"
                      checked={channelSelection.includes(channel.id)}
                      onChange={() =>
                        setChannelSelection((p) =>
                          toggleSelection(p, channel.id),
                        )
                      }
                    />
                    <span>{channel.label}</span>
                  </label>
                ))}
              </OptionGridChannels>
            </FlexColumn>
          )}

          {step === 3 && qrView && (
            <QrResult>
              <img src={qrView.qrCodeDataUrl} alt={`QR ${qrView.token}`} />
              <p>
                <strong>Token:</strong> {qrView.token}
              </p>
              <a href={qrView.accessUrl} target="_blank" rel="noreferrer">
                {qrView.accessUrl}
              </a>
            </QrResult>
          )}

          {error && (
            <p
              style={{
                color: "#e05555",
                fontSize: theme.typography.fontSize.sm,
                marginTop: theme.spacing.md,
              }}
            >
              {error}
            </p>
          )}
        </ModalBody>

        {/* Footer */}
        <ModalFooter>
          <ButtonSmall
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            disabled={busy || step === 3}
          >
            {step === 0 ? "Cancelar" : "← Voltar"}
          </ButtonSmall>

          {step < 3 && (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!canNext() || busy}
            >
              {busy ? "Gerando..." : step === 2 ? "Gerar QR →" : "Próximo →"}
            </Button>
          )}

          {step === 3 && (
            <Button type="button" onClick={onClose}>
              Fechar
            </Button>
          )}
        </ModalFooter>
      </Shell>
    </Overlay>
  );
}
