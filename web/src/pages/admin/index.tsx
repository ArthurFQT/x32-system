import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { busToString, formatDateTime, toggleSelection } from "@/lib/format";
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

// Globais
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
  SelectInput,
  FlexColumn,
  FlexRow,
} from "@/styles";

// Específicos do admin
import {
  AdminOverviewGrid,
  AdminSection,
  QrPanel,
  TokenActions,
  DangerButton,
  TableWrapper,
  TokenTable,
  RowActions,
  LogsContainer,
  OptionGridSmall,
  OptionGridChannels,
} from "./styles";

const ADMIN_KEY_STORAGE = "x32_admin_key";

export function AdminPage() {
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
  const [generateBusSelection, setGenerateBusSelection] = useState<number[]>(
    [],
  );
  const [generateChannelSelection, setGenerateChannelSelection] = useState<
    number[]
  >([]);

  const [editTokenId, setEditTokenId] = useState<string>("");
  const [editUser, setEditUser] = useState("");
  const [editBusSelection, setEditBusSelection] = useState<number[]>([]);
  const [editChannelSelection, setEditChannelSelection] = useState<number[]>(
    [],
  );

  const [qrView, setQrView] = useState<QrResponse | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) setAdminKey(saved);
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

  useEffect(() => {
    if (!ioOptions) return;
    if (generateBusSelection.length === 0)
      setGenerateBusSelection(ioOptions.buses.slice(0, 1).map((b) => b.id));
    if (generateChannelSelection.length === 0)
      setGenerateChannelSelection(
        ioOptions.channels.slice(0, 3).map((c) => c.id),
      );
  }, [generateBusSelection.length, generateChannelSelection.length, ioOptions]);

  const doAction = async (actionId: string, action: () => Promise<void>) => {
    try {
      setBusyAction(actionId);
      await action();
      await refreshData();
      setError("");
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Acao falhou.",
      );
    } finally {
      setBusyAction("");
    }
  };

  const submitGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      generateBusSelection.length === 0 ||
      generateChannelSelection.length === 0
    ) {
      setError("Selecione ao menos um BUS e um canal.");
      return;
    }
    const payload = {
      user: generateUser.trim(),
      bus:
        generateBusSelection.length === 1
          ? generateBusSelection[0]
          : generateBusSelection,
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

  const loadQr = (tokenId: string) =>
    void doAction(`qr-${tokenId}`, async () => {
      setQrView(await apiRequest<QrResponse>(`/token/${tokenId}/qrcode`));
    });

  const beginEdit = (token: AdminToken) => {
    setEditTokenId(token.id);
    setEditUser(token.user);
    setEditBusSelection(Array.isArray(token.bus) ? token.bus : [token.bus]);
    setEditChannelSelection(token.allowedChannels);
  };

  const saveEdit = () => {
    if (!editTokenId) return;
    if (editBusSelection.length === 0 || editChannelSelection.length === 0) {
      setError("Selecione ao menos um BUS e um canal na edicao.");
      return;
    }
    const payload = {
      user: editUser.trim(),
      bus:
        editBusSelection.length === 1 ? editBusSelection[0] : editBusSelection,
      allowedChannels: editChannelSelection,
    };
    void doAction(`edit-${editTokenId}`, async () => {
      await apiRequest(`/token/${editTokenId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
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
      if (editTokenId === tokenId) setEditTokenId("");
    });
  };

  const selectedToken = useMemo(
    () => tokens.find((item) => item.id === editTokenId) ?? null,
    [tokens, editTokenId],
  );

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

        {/* ── Chave admin ── */}
        <div>
          <FieldLabel htmlFor="admin-key">Chave admin (x-admin-key)</FieldLabel>
          <TextInput
            id="admin-key"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="opcional se ADMIN_API_KEY vazio"
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
        </AdminOverviewGrid>

        {/* ── Gerar acesso ── */}
        <AdminSection>
          <SectionTitle>Gerar acesso</SectionTitle>
          <form onSubmit={submitGenerate}>
            <FlexColumn>
              <div>
                <FieldLabel htmlFor="gen-user">Usuario</FieldLabel>
                <TextInput
                  id="gen-user"
                  type="text"
                  value={generateUser}
                  onChange={(e) => setGenerateUser(e.target.value)}
                  placeholder="Nome do musico"
                  required
                />
              </div>

              <div>
                <FieldLabel htmlFor="gen-duration">
                  Duracao (minutos)
                </FieldLabel>
                <TextInput
                  id="gen-duration"
                  type="number"
                  min={1}
                  max={1440}
                  value={generateDuration}
                  onChange={(e) => setGenerateDuration(e.target.value)}
                  required
                />
              </div>

              <div>
                <FieldLabel as="span">BUS disponiveis</FieldLabel>
                <OptionGridSmall>
                  {ioOptions?.buses.map((bus) => (
                    <label key={`gen-bus-${bus.id}`}>
                      <input
                        type="checkbox"
                        checked={generateBusSelection.includes(bus.id)}
                        onChange={() =>
                          setGenerateBusSelection((prev) =>
                            toggleSelection(prev, bus.id),
                          )
                        }
                      />
                      <span>{bus.label}</span>
                    </label>
                  ))}
                </OptionGridSmall>
              </div>

              <div>
                <FieldLabel as="span">Canais disponiveis</FieldLabel>
                <OptionGridChannels>
                  {ioOptions?.channels.map((channel) => (
                    <label key={`gen-channel-${channel.id}`}>
                      <input
                        type="checkbox"
                        checked={generateChannelSelection.includes(channel.id)}
                        onChange={() =>
                          setGenerateChannelSelection((prev) =>
                            toggleSelection(prev, channel.id),
                          )
                        }
                      />
                      <span>{channel.label}</span>
                    </label>
                  ))}
                </OptionGridChannels>
              </div>

              <div>
                <Button type="submit" disabled={busyAction === "generate"}>
                  {busyAction === "generate" ? "Gerando..." : "Gerar token"}
                </Button>
              </div>
            </FlexColumn>
          </form>

          {qrView && (
            <QrPanel>
              <img
                src={qrView.qrCodeDataUrl}
                alt={`QR token ${qrView.token}`}
              />
              <FlexColumn>
                <p>
                  <strong>Token:</strong> {qrView.token}
                </p>
                <p>
                  <strong>URL:</strong>
                </p>
                <a href={qrView.accessUrl} target="_blank" rel="noreferrer">
                  {qrView.accessUrl}
                </a>
              </FlexColumn>
            </QrPanel>
          )}
        </AdminSection>

        {/* ── Editar token ── */}
        <AdminSection>
          <SectionTitle>Editar token</SectionTitle>
          <FlexColumn>
            <div>
              <FieldLabel htmlFor="edit-token-select">Token</FieldLabel>
              <SelectInput
                id="edit-token-select"
                value={editTokenId}
                onChange={(e) => {
                  const token = tokens.find((t) => t.id === e.target.value);
                  token ? beginEdit(token) : setEditTokenId("");
                }}
              >
                <option value="">Selecione um token</option>
                {tokens.map((token) => (
                  <option value={token.id} key={token.id}>
                    {token.user} - {token.id.slice(0, 8)} - {token.status}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel htmlFor="edit-user">Usuario</FieldLabel>
              <TextInput
                id="edit-user"
                type="text"
                value={editUser}
                onChange={(e) => setEditUser(e.target.value)}
                disabled={!editTokenId}
              />
            </div>

            <div>
              <FieldLabel as="span">BUS autorizados</FieldLabel>
              <OptionGridSmall>
                {ioOptions?.buses.map((bus) => (
                  <label key={`edit-bus-${bus.id}`}>
                    <input
                      type="checkbox"
                      checked={editBusSelection.includes(bus.id)}
                      onChange={() =>
                        setEditBusSelection((prev) =>
                          toggleSelection(prev, bus.id),
                        )
                      }
                      disabled={!editTokenId}
                    />
                    <span>{bus.label}</span>
                  </label>
                ))}
              </OptionGridSmall>
            </div>

            <div>
              <FieldLabel as="span">Canais autorizados</FieldLabel>
              <OptionGridChannels>
                {ioOptions?.channels.map((channel) => (
                  <label key={`edit-channel-${channel.id}`}>
                    <input
                      type="checkbox"
                      checked={editChannelSelection.includes(channel.id)}
                      onChange={() =>
                        setEditChannelSelection((prev) =>
                          toggleSelection(prev, channel.id),
                        )
                      }
                      disabled={!editTokenId}
                    />
                    <span>{channel.label}</span>
                  </label>
                ))}
              </OptionGridChannels>
            </div>

            <div>
              <Button type="button" onClick={saveEdit} disabled={!editTokenId}>
                Salvar alteracoes
              </Button>
            </div>
          </FlexColumn>

          {selectedToken && (
            <TokenActions>
              <ButtonSmall
                type="button"
                onClick={() => extendToken(selectedToken.id, 30)}
              >
                +30m
              </ButtonSmall>
              <ButtonSmall
                type="button"
                onClick={() => extendToken(selectedToken.id, 120)}
              >
                +2h
              </ButtonSmall>
              <ButtonSmall
                type="button"
                onClick={() => enableToken(selectedToken.id)}
              >
                Ativar
              </ButtonSmall>
              <ButtonSmall
                type="button"
                onClick={() => revokeToken(selectedToken.id)}
              >
                Revogar
              </ButtonSmall>
              <DangerButton
                type="button"
                onClick={() => deleteToken(selectedToken.id)}
              >
                Excluir
              </DangerButton>
            </TokenActions>
          )}
        </AdminSection>

        {/* ── Tokens ── */}
        <AdminSection>
          <SectionTitle>Tokens</SectionTitle>
          <TableWrapper>
            <TokenTable>
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
                      <RowActions>
                        <ButtonSmall
                          type="button"
                          onClick={() => window.open(token.accessUrl, "_blank")}
                        >
                          Abrir
                        </ButtonSmall>
                        <ButtonSmall
                          type="button"
                          onClick={() => loadQr(token.id)}
                          disabled={busyAction.startsWith(`qr-${token.id}`)}
                        >
                          QR
                        </ButtonSmall>
                        <ButtonSmall
                          type="button"
                          onClick={() => beginEdit(token)}
                        >
                          Editar
                        </ButtonSmall>
                        <ButtonSmall
                          type="button"
                          onClick={() => extendToken(token.id, 30)}
                        >
                          +30m
                        </ButtonSmall>
                        <ButtonSmall
                          type="button"
                          onClick={() => enableToken(token.id)}
                        >
                          Ativar
                        </ButtonSmall>
                        <ButtonSmall
                          type="button"
                          onClick={() => revokeToken(token.id)}
                        >
                          Revogar
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
                {JSON.stringify(entry)}
              </pre>
            ))}
          </LogsContainer>
        </AdminSection>
      </CardAdmin>
    </PageContainerTop>
  );
}
