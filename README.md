# x32-system

MVP funcional para controle remoto de retorno da Behringer X32, com acesso temporario por QR Code.

## Arquitetura

- `server/`: backend Node.js + Express + Socket.io
- `bridge/`: bridge local Node.js + Socket.io Client + UDP/OSC
- `web/`: frontend React + Vite (mobile-first)

Fluxo:

`Frontend -> Backend -> Bridge -> X32`

## Requisitos

- Node.js 18+ (recomendado 20+)
- Acesso de rede entre:
  - frontend e backend
  - bridge e backend
  - bridge e X32 (UDP porta 10023)

## Modo rede local

Para usar pelo celular/tablet na mesma rede, use o IP do computador que roda o
backend e o frontend. No Windows:

```powershell
Get-NetIPAddress -AddressFamily IPv4
```

Exemplo com `192.168.0.13`:

- `server/.env`: `HOST=0.0.0.0`, `ACCESS_BASE_URL=http://192.168.0.13:5173`
- `server/.env`: `CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://192.168.0.13:5173`
- `web/.env`: `VITE_SERVER_URL=http://192.168.0.13:3000`
- `bridge/.env`: `BACKEND_URL=http://192.168.0.13:3000`

Depois rode `server`, `web` e `bridge` normalmente. Abra no outro dispositivo:

```text
http://192.168.0.13:5173/admin
```

Se o IP da maquina mudar, atualize esses tres `.env`.

## 1) Backend (`server/`)

### Variaveis de ambiente

Copie:

```bash
cp .env.example .env
```

Campos principais:

- `PORT`: porta HTTP do backend (default `3000`)
- `ACCESS_BASE_URL`: URL publica do frontend (usada para montar QR Code)
- `CORS_ORIGIN`: origem(s) permitidas
- `BRIDGE_SECRET`: segredo compartilhado com a bridge
- `ADMIN_API_KEY`: chave para proteger endpoints admin (opcional, mas recomendado)
- `USE_REAL_X32_IO`: `true` para buscar BUS/canais reais via bridge, `false` para exemplos
- `BRIDGE_IO_REQUEST_TIMEOUT_MS`: timeout da consulta de IO na bridge
- `TOKEN_RETENTION_MINUTES`: tempo para manter token inativo antes de remover
- `CLEANUP_INTERVAL_MS`: intervalo de verificacao de expiracao

### Executar

```bash
npm install
npm run dev
```

## 2) Bridge (`bridge/`)

### Variaveis de ambiente

Copie:

```bash
cp .env.example .env
```

Campos principais:

- `BACKEND_URL`: URL do backend Socket.io
- `BRIDGE_SECRET`: mesmo valor do backend
- `X32_IP`: IP da mesa X32
- `X32_PORT`: porta UDP da X32 (default `10023`)
- `USE_REAL_X32_IO`: `true` para consultar nomes reais da X32, `false` para mock
- `X32_QUERY_TIMEOUT_MS`: timeout por consulta OSC de nome
- `IO_OPTIONS_CACHE_MS`: cache das opcoes de IO na bridge

### Executar

```bash
npm install
npm run dev
```

## 3) Frontend (`web/`)

### Variaveis de ambiente

Copie:

```bash
cp .env.example .env
```

Campo principal:

- `VITE_SERVER_URL`: URL publica do backend

### Executar

```bash
npm install
npm run dev
```

Por padrao o Vite abre em `http://localhost:5173`.

Rotas web:

- `http://localhost:5173/admin`: painel completo de administracao
- `http://localhost:5173/mix?token=...`: tela do musico

## Endpoints Admin

### `POST /generate`

Exemplo:

```bash
curl -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d "{\"user\":\"guitarra\",\"bus\":1,\"allowedChannels\":[1,5,9],\"durationMinutes\":60}"
```

Retorna:

- `token`
- `accessUrl` (`/mix?token=...`)
- `qrCodeDataUrl`
- `tokenData`

### `POST /revoke`

```bash
curl -X POST http://localhost:3000/revoke \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"UUID_AQUI\"}"
```

### `GET /tokens`

```bash
curl http://localhost:3000/tokens
```

### Endpoints extras do painel admin

- `GET /admin/overview`
- `GET /admin/io-options`
- `GET /admin/logs?limit=150`
- `GET /token/:tokenId/qrcode`
- `POST /token/:tokenId/revoke`
- `POST /token/:tokenId/enable`
- `POST /token/:tokenId/extend` body: `{ "minutes": 30 }`
- `PATCH /token/:tokenId` body parcial: `user`, `bus`, `allowedChannels`
- `DELETE /token/:tokenId`

Quando `ADMIN_API_KEY` estiver definido, envie header:

```bash
x-admin-key: SUA_CHAVE
```

## Comportamento de Seguranca Implementado

- Validacao de token no handshake e em todas as acoes
- Bloqueio imediato por revogacao/expiracao
- Sem confianca no frontend
- Rejeicao de canais fora de `allowedChannels`
- BUS travado no backend (cliente nao escolhe BUS livremente)
- Musico controla somente volume e mute/unmute; pan e rejeitado no backend
- Clamp de volume/mute
- Cleanup periodico de tokens expirados

## Observacao sobre mute e X32 `/on`

No frontend, `mute` usa:

- `1` = mutado
- `0` = aberto

Na bridge, isso e convertido para `/on` da X32:

- `mute=1` => `/on = 0`
- `mute=0` => `/on = 1`

Assim a semantica fica consistente para o musico e para o OSC da X32.

## Publicacao no GitHub

Este repositorio agora esta preparado para subir sem arquivos sensiveis e sem artefatos locais.

O que fica fora do git:

- `**/node_modules`
- `**/dist`
- `**/.env`

Checklist antes do push:

1. Confira se nao ha segredo versionado:

```bash
git ls-files "*.env"
```

O comando acima deve retornar vazio.

2. Confira o estado da arvore:

```bash
git status
```

3. Commit e push:

```bash
git add .
git commit -m "chore: prepare repository for github and deploy"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

Se algum segredo antigo ja foi commitado, troque imediatamente esses valores:

- `BRIDGE_SECRET`
- `ADMIN_API_KEY`

## Deploy recomendado (Vercel + Render + Bridge local)

Arquitetura de deploy:

- `web` na Vercel (site SPA)
- `server` no Render (processo Node persistente para Socket.io)
- `bridge` local, na mesma rede da X32

### 1) Deploy do backend (`server`) no Render

O repo ja inclui `render.yaml` na raiz com:

- `rootDir: server`
- `buildCommand: npm ci && npm run build`
- `startCommand: npm start`
- `healthCheckPath: /health`

Passos:

1. No Render, crie via Blueprint usando o `render.yaml`.
2. Preencha as env vars marcadas como `sync: false`:
   - `ACCESS_BASE_URL` (URL publica do frontend)
   - `CORS_ORIGIN` (mesma URL do frontend)
   - `BRIDGE_SECRET`
   - `ADMIN_API_KEY`
3. Aguarde o deploy e teste:

```bash
curl https://SEU_BACKEND_RENDER/health
```

### 2) Deploy do frontend (`web`) na Vercel

O repo ja inclui `web/vercel.json` para rewrite SPA (`/mix` e `/admin` funcionarem por URL direta).

Passos:

1. Importe o repositorio na Vercel.
2. Defina `Root Directory = web`.
3. Configure env:
   - `VITE_SERVER_URL=https://SEU_BACKEND_RENDER`
4. Deploy.

Teste:

- `https://SEU_FRONTEND/admin`
- `https://SEU_FRONTEND/mix?token=...`

### 3) Bridge local (`bridge`)

No computador local (rede da mesa):

1. Configure `bridge/.env`:
   - `BACKEND_URL=https://SEU_BACKEND_RENDER`
   - `BRIDGE_SECRET` igual ao backend
   - `X32_IP` da mesa
   - `X32_PORT=10023`
2. Rode:

```bash
npm ci
npm run build
npm start
```

### 4) Validacao final

1. Abra `/admin`, gere token e QR.
2. Teste no celular via 4G/5G (fora da rede local).
3. Confirme logs da bridge enviando OSC.
