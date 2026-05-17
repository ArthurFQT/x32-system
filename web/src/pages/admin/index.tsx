import { useCallback, useEffect, useMemo, useState } from "react";
import { busToString, formatDateTime, formatLogMessage } from "@/lib/format";
import { parseError } from "@/lib/api/http";
import { SERVER_URL } from "@/lib/env";
import type {
  AdminToken,
  GenerateResponse,
  IoOptionsPayload,
  IoOptionsResponse,
  LogEntry,
  LogsResponse,
  OverviewResponse,
  QrResponse,
  TokensResponse,
} from "@/types/app";
import {
  PageContainerTop,
  CardAdmin,
  Header,
  HeaderActions,
  Title,
  SectionTitle,
  Button,
  ButtonSmall,
  AlertMessage,
  FieldLabel,
  TextInput,
  FlexRow,
  theme,
} from "@/styles";
import {
  AdminOverviewGrid,
  AdminSection,
  DangerButton,
  TableWrapper,
  TokenTable,
  RowActions,
  LogsContainer,
} from "./styles";
import { GenerateWizardModal } from "./GenerateWizardModal";
import { EditTokenModal } from "./EditTokenModal.tsx";

const ADMIN_KEY_STORAGE = "x32_admin_key";
const configuredAdminKey = String(import.meta.env.VITE_ADMIN_KEY ?? "").trim();

export function AdminPage() {
  const [adminKey, setAdminKey] = useState<string>(configuredAdminKey);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ioOptions, setIoOptions] = useState<IoOptionsPayload | null>(null);
  const [ioMode, setIoMode] = useState<"mock" | "real" | "unknown">("unknown");
  const [error, setError] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string>("");

  // Modal state
  const [showWizard, setShowWizard] = useState(false);
  const [editToken, setEditToken] = useState<AdminToken | null>(null);

  // QR view (shown in table row after generating)
  const [qrView, setQrView] = useState<{
    tokenId: string;
    data: QrResponse;
  } | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      setAdminKey(saved);
    } else if (configuredAdminKey) {
      setAdminKey(configuredAdminKey);
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
      if (adminKey.trim()) headers.set("x-admin-key", adminKey.trim());
      const response = await fetch(`${SERVER_URL}${path}`, {
        ...init,
        headers,
      });
      if (!response.ok) throw new Error(await parseError(response));
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
          apiRequest<IoOptionsResponse>(
            `/admin/io-options${refreshIo ? "?refresh=true" : ""}`,
          ),
        ]);
        setOverview(overviewData);
        setTokens(tokenData.tokens);
        setLogs(logData.logs);
        setIoOptions(ioData.options);
        setIoMode(ioData.mode);
        setError("");
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Falha ao carregar dados.",
        );
      }
    },
    [apiRequest],
  );

  useEffect(() => {
    void refreshData();
    const timer = setInterval(() => void refreshData(), 5000);
    return () => clearInterval(timer);
  }, [refreshData]);

  const doAction = async (actionId: string, action: () => Promise<void>) => {
    try {
      setBusyAction(actionId);
      await action();
      await refreshData();
      setError("");
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Ação falhou.",
      );
    } finally {
      setBusyAction("");
    }
  };

  // ── Wizard submit ──────────────────────────────────────

  const handleWizardSubmit = async (payload: {
    user: string;
    bus: number | number[];
    allowedChannels: number[];
    durationMinutes: number;
  }): Promise<QrResponse | null> => {
    try {
      setBusyAction("generate");
      const result = await apiRequest<GenerateResponse>("/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refreshData();
      setError("");
      return {
        token: result.token,
        accessUrl: result.accessUrl,
        qrCodeDataUrl: result.qrCodeDataUrl,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar token.");
      return null;
    } finally {
      setBusyAction("");
    }
  };

  // ── Edit modal actions ─────────────────────────────────

  const handleEditSave = (
    tokenId: string,
    payload: {
      user: string;
      bus: number | number[];
      allowedChannels: number[];
    },
  ) => {
    void doAction(`edit-${tokenId}`, async () => {
      await apiRequest(`/token/${tokenId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditToken(null);
    });
  };

  const extendToken = (tokenId: string, minutes: number) =>
    void doAction(`extend-${tokenId}-${minutes}`, async () => {
      await apiRequest(`/token/${tokenId}/extend`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
    });

  const revokeToken = (tokenId: string) =>
    void doAction(`revoke-${tokenId}`, async () => {
      await apiRequest(`/token/${tokenId}/revoke`, { method: "POST" });
    });

  const enableToken = (tokenId: string) =>
    void doAction(`enable-${tokenId}`, async () => {
      await apiRequest(`/token/${tokenId}/enable`, { method: "POST" });
    });

  const deleteToken = (tokenId: string) => {
    if (!window.confirm("Deseja remover este token?")) return;
    void doAction(`delete-${tokenId}`, async () => {
      await apiRequest(`/token/${tokenId}`, { method: "DELETE" });
      if (editToken?.id === tokenId) setEditToken(null);
    });
  };

  const loadQr = (tokenId: string) => {
    if (qrView?.tokenId === tokenId) {
      setQrView(null);
      return;
    }

    void doAction(`qr-${tokenId}`, async () => {
      const result = await apiRequest<QrResponse>(`/token/${tokenId}/qrcode`);

      setQrView({
        tokenId,
        data: result,
      });
    });
  };

  return (
    <PageContainerTop>
      <CardAdmin>
        {/* ── Header ── */}
        <Header>
          <Title>Painel Admin X32</Title>
          <HeaderActions>
            <Button type="button" onClick={() => void refreshData()}>
              Atualizar
            </Button>
            <Button type="button" onClick={() => void refreshData(true)}>
              Atualizar IO
            </Button>
          </HeaderActions>
        </Header>

        <div>
          <FieldLabel htmlFor="admin-key">Chave admin</FieldLabel>
          <TextInput
            id="admin-key"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="x-admin-key"
          />
        </div>

        {error && <AlertMessage type="error">{error}</AlertMessage>}

        {/* ── Overview ── */}
        <AdminOverviewGrid columns={3}>
          <article>
            <h3>Bridge</h3>
            <p>{overview?.bridgeConnected ? "Conectada" : "Desconectada"}</p>
          </article>
          <article>
            <h3>Músicos conectados</h3>
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
        </AdminOverviewGrid>

        {/* ── Tokens ── */}
        <AdminSection>
          <Header>
            <SectionTitle>Tokens</SectionTitle>
            <Button
              type="button"
              onClick={() => setShowWizard(true)}
              disabled={!ioOptions}
            >
              + Gerar acesso
            </Button>
          </Header>

          <TableWrapper>
            <TokenTable>
              <thead>
                <tr>
                  <th>Músico</th>
                  <th>Status</th>
                  <th>BUS</th>
                  <th>Canais</th>
                  <th>Expira</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <>
                    <tr key={token.id}>
                      <td>
                        {token.user}
                        <small>{token.id}</small>
                      </td>
                      <td>{token.status}</td>
                      <td>{busToString(token.bus)}</td>
                      <td>{token.allowedChannels.join(", ")}</td>
                      <td>{formatDateTime(token.expiresAt)}</td>
                      <td>
                        <RowActions>
                          <ButtonSmall
                            type="button"
                            onClick={() =>
                              window.open(token.accessUrl, "_blank")
                            }
                          >
                            Abrir
                          </ButtonSmall>
                          <ButtonSmall
                            type="button"
                            onClick={() => loadQr(token.id)}
                            disabled={busyAction.startsWith(`qr-${token.id}`)}
                          >
                            {qrView?.tokenId === token.id ? "Ocultar QR" : "QR"}
                          </ButtonSmall>
                          <ButtonSmall
                            type="button"
                            onClick={() => setEditToken(token)}
                          >
                            Editar
                          </ButtonSmall>
                          <DangerButton
                            type="button"
                            onClick={() => deleteToken(token.id)}
                          >
                            Excluir
                          </DangerButton>
                        </RowActions>
                      </td>
                    </tr>

                    {/* QR inline expand */}
                    {qrView?.tokenId === token.id && (
                      <tr key={`${token.id}-qr`}>
                        <td colSpan={6}>
                          <FlexRow
                            style={{
                              padding: "12px 0",
                              gap: "16px",
                              alignItems: "flex-start",
                            }}
                          >
                            <img
                              src={qrView.data.qrCodeDataUrl}
                              alt={`QR ${token.id}`}
                              style={{
                                width: 120,
                                height: 120,
                                borderRadius: 6,
                                border: `1px solid ${theme.colors.border.primary}`,
                              }}
                            />
                            <div
                              style={{
                                fontSize: "12px",
                                fontFamily: "monospace",
                                color: theme.colors.text.muted,
                                lineHeight: 1.8,
                              }}
                            >
                              <div>
                                <strong
                                  style={{ color: theme.colors.text.primary }}
                                >
                                  Token:
                                </strong>{" "}
                                {qrView.data.token}
                              </div>
                              <div>
                                <strong
                                  style={{ color: theme.colors.text.primary }}
                                >
                                  URL:
                                </strong>{" "}
                                <a
                                  href={qrView.data.accessUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: theme.colors.accent }}
                                >
                                  {qrView.data.accessUrl}
                                </a>
                              </div>
                            </div>
                            <ButtonSmall
                              type="button"
                              style={{ marginLeft: "auto" }}
                              onClick={() => setQrView(null)}
                            >
                              ✕
                            </ButtonSmall>
                          </FlexRow>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </TokenTable>
          </TableWrapper>
        </AdminSection>

        {/* ── Logs ── */}
        <AdminSection>
          <SectionTitle>Logs</SectionTitle>
          <LogsContainer>
            {logs.map((entry, idx) => (
              <pre key={`${entry.timestamp}-${entry.action}-${idx}`}>
                {formatLogMessage(entry)}
              </pre>
            ))}
          </LogsContainer>
        </AdminSection>
      </CardAdmin>

      {/* ── Wizard modal ── */}
      {showWizard && ioOptions && (
        <GenerateWizardModal
          ioOptions={ioOptions}
          busyAction={busyAction}
          onSubmit={handleWizardSubmit}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* ── Edit modal ── */}
      {editToken && ioOptions && (
        <EditTokenModal
          token={editToken}
          ioOptions={ioOptions}
          busyAction={busyAction}
          error={error}
          onSave={(payload) => handleEditSave(editToken.id, payload)}
          onExtend={(minutes) => extendToken(editToken.id, minutes)}
          onEnable={() => enableToken(editToken.id)}
          onRevoke={() => revokeToken(editToken.id)}
          onDelete={() => deleteToken(editToken.id)}
          onClose={() => setEditToken(null)}
        />
      )}
    </PageContainerTop>
  );
}
