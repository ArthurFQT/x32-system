import { useState } from "react";
import styled, { keyframes } from "styled-components";
import { theme } from "@/styles/theme";
import { toggleSelection } from "@/lib/format";
import type { AdminToken, IoOptionsPayload } from "@/types/app";
import {
  Button,
  ButtonSmall,
  FieldLabel,
  TextInput,
  FlexColumn,
  AlertMessage,
} from "@/styles";
import { DangerButton, OptionGridSmall, OptionGridChannels } from "./styles";

// ── Animations ────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ── Shell ─────────────────────────────────────────────────

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
  background: ${theme.colors.bg.secondary};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.lg};
  overflow: hidden;
  animation: ${slideUp} 0.25s ease;
`;

const ModalHeader = styled.div`
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

const ModalBody = styled.div`
  padding: ${theme.spacing.xl} ${theme.spacing.lg};
  max-height: 60vh;
  overflow-y: auto;
`;

const TokenMeta = styled.div`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.bg.tertiary};
  border: 1px solid ${theme.colors.border.primary};
  border-radius: ${theme.borderRadius.sm};
  font-size: ${theme.typography.fontSize.xs};
  font-family: monospace;
  color: ${theme.colors.text.muted};
  margin-bottom: ${theme.spacing.lg};
  line-height: 1.6;
`;

const QuickActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  align-items: center;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-top: 1px solid ${theme.colors.border.primary};
`;

const Divider = styled.span`
  font-size: ${theme.typography.fontSize.xs};
  color: ${theme.colors.border.primary};
  user-select: none;
`;

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
  token: AdminToken;
  ioOptions: IoOptionsPayload;
  busyAction: string;
  error: string;
  onSave: (payload: {
    user: string;
    bus: number | number[];
    allowedChannels: number[];
  }) => void;
  onExtend: (minutes: number) => void;
  onEnable: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────

export function EditTokenModal({
  token,
  ioOptions,
  busyAction,
  error,
  onSave,
  onExtend,
  onEnable,
  onRevoke,
  onDelete,
  onClose,
}: Props) {
  const [user, setUser] = useState(token.user);
  const [busSelection, setBusSelection] = useState<number[]>(
    Array.isArray(token.bus) ? token.bus : [token.bus],
  );
  const [channelSelection, setChannelSelection] = useState<number[]>(
    token.allowedChannels,
  );

  const handleSave = () => {
    onSave({
      user: user.trim(),
      bus: busSelection.length === 1 ? busSelection[0] : busSelection,
      allowedChannels: channelSelection,
    });
  };

  const busy = (id: string) => busyAction.startsWith(id);

  const expiresLabel = token.expiresAt
    ? new Date(token.expiresAt).toLocaleString("pt-BR")
    : "—";

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Shell>
        {/* Header */}
        <ModalHeader>
          <ModalTitle>Editar token</ModalTitle>
          <CloseButton type="button" onClick={onClose}>
            ✕
          </CloseButton>
        </ModalHeader>

        {/* Body */}
        <ModalBody>
          <TokenMeta>
            <div>{token.id}</div>
            <div>
              status: {token.status} · expira: {expiresLabel}
            </div>
          </TokenMeta>

          <FlexColumn>
            <div>
              <FieldLabel htmlFor="edit-modal-user">Nome do músico</FieldLabel>
              <TextInput
                id="edit-modal-user"
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <FieldLabel as="span">BUS autorizados</FieldLabel>
              <OptionGridSmall>
                {ioOptions.buses.map((bus) => (
                  <label key={`editm-bus-${bus.id}`}>
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
            </div>

            <div>
              <FieldLabel as="span">Canais autorizados</FieldLabel>
              <OptionGridChannels>
                {ioOptions.channels.map((ch) => (
                  <label key={`editm-ch-${ch.id}`}>
                    <input
                      type="checkbox"
                      checked={channelSelection.includes(ch.id)}
                      onChange={() =>
                        setChannelSelection((p) => toggleSelection(p, ch.id))
                      }
                    />
                    <span>{ch.label}</span>
                  </label>
                ))}
              </OptionGridChannels>
            </div>
          </FlexColumn>

          {error && (
            <AlertMessage type="error" style={{ marginTop: theme.spacing.md }}>
              {error}
            </AlertMessage>
          )}
        </ModalBody>

        {/* Quick time/status actions */}
        <QuickActions>
          <ButtonSmall
            type="button"
            onClick={() => onExtend(30)}
            disabled={busy(`extend-${token.id}`)}
          >
            +30m
          </ButtonSmall>
          <ButtonSmall
            type="button"
            onClick={() => onExtend(120)}
            disabled={busy(`extend-${token.id}`)}
          >
            +2h
          </ButtonSmall>
          <ButtonSmall
            type="button"
            onClick={() => onExtend(1440)}
            disabled={busy(`extend-${token.id}`)}
          >
            +24h
          </ButtonSmall>
          <Divider>|</Divider>
          <ButtonSmall
            type="button"
            onClick={onEnable}
            disabled={busy(`enable-${token.id}`)}
          >
            Ativar
          </ButtonSmall>
          <ButtonSmall
            type="button"
            onClick={onRevoke}
            disabled={busy(`revoke-${token.id}`)}
          >
            Revogar
          </ButtonSmall>
          <Divider>|</Divider>
          <DangerButton
            type="button"
            onClick={onDelete}
            disabled={busy(`delete-${token.id}`)}
          >
            Excluir
          </DangerButton>
        </QuickActions>

        {/* Footer */}
        <ModalFooter>
          <ButtonSmall type="button" onClick={onClose}>
            Cancelar
          </ButtonSmall>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              busy(`edit-${token.id}`) ||
              !user.trim() ||
              busSelection.length === 0 ||
              channelSelection.length === 0
            }
          >
            {busy(`edit-${token.id}`) ? "Salvando..." : "Salvar alterações"}
          </Button>
        </ModalFooter>
      </Shell>
    </Overlay>
  );
}
