
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
