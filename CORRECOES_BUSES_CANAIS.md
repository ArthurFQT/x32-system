# Correções Aplicadas - Puxar Buses e Canais

## 🔧 Problemas Identificados e Soluções

### Problema 1: Rotas de admin sem autenticação
**Status**: ✅ FIXO

**O que era:**
- As rotas `/admin/io-options`, `/admin/overview`, `/admin/logs` não tinham middleware de autenticação
- Frontend não sabia se tinha acesso ou não

**O que foi ajustado:**
- Adicionado middleware `requireAdminKey` para validar header `x-admin-key`
- Agora as rotas retornam 401 se a chave for inválida
- Importado `ADMIN_API_KEY` das constantes para usar no middleware

**Arquivo**: `server/src/server.ts`

### Problema 2: Frontend sem chave admin automática
**Status**: ✅ FIXO

**O que era:**
- Frontend tentava pegar a chave do localStorage
- Se não houvesse nada salvo, enviava vazio
- Resultado: requisições eram rejeitadas (401)

**O que foi ajustado:**
- Adicionado fallback para modo desenvolvimento
- Em `DEV`, usa automaticamente `dev-admin-key-12345`
- Em produção, continua usando localStorage

**Arquivo**: `web/src/pages/admin/index.tsx`

### Problema 3: Configuração de ambiente incompleta
**Status**: ✅ FIXO

**Arquivos criados:**
- `server/.env.dev` com `ADMIN_API_KEY=dev-admin-key-12345`
- `bridge/.env.dev` com `BRIDGE_SECRET=x32_super_secret_2026`
- `web/.env.dev` com `VITE_SERVER_URL=http://localhost:3000`

## 🚀 Como Testar

### 1. Parar e reiniciar os serviços
```bash
# Terminal 1 - Backend
cd server && yarn dev

# Terminal 2 - Bridge
cd bridge && yarn dev

# Terminal 3 - Frontend
cd web && yarn dev
```

### 2. Abrir painel admin
- Abrir: http://localhost:5173/admin
- DevTools: F12 → Network
- Filtrar por `io-options`

### 3. Verificar requisição
**Headers (abas Network):**
```
x-admin-key: dev-admin-key-12345
```

**Response:**
```json
{
  "mode": "mock",
  "options": {
    "source": "mock",
    "buses": [
      { "id": 1, "label": "Bus 1" },
      { "id": 2, "label": "Bus 2" },
      ...
    ],
    "channels": [
      { "id": 1, "label": "Canal 1" },
      ...
    ]
  }
}
```

### 4. Painel admin deve exibir:
✅ 16 buses numerados de 1 a 16
✅ 32 canais numerados de 1 a 32
✅ Botão "Gerar acesso" funcional

## 📊 Fluxo da Requisição

```
Frontend (admin)
    ↓
    [GET /admin/io-options]
    [Header: x-admin-key: dev-admin-key-12345]
    ↓
Backend (server)
    ↓
    [Middleware: requireAdminKey]
    ✓ Valida chave
    ↓
    [if USE_REAL_X32_IO = false]
    ✓ Retorna dados mock
    ↓
    Response: { mode: "mock", options: { buses, channels } }
    ↓
Frontend (recebe dados)
    ↓
    [Renderiza Wizard]
    ✓ Buses e canais aparecem
```

## 🐛 Se ainda não funcionar

1. **Verificar erro 401:**
   - Pode significar que a chave está errada
   - Verificar se `ADMIN_API_KEY` em `.env.dev` é igual ao que frontend está enviando
   - Reiniciar server após alterar `.env.dev`

2. **Verificar erro 503 ou vazio:**
   - Significa que o bridge não conectou
   - Verificar se bridge está rodando
   - Verificar se `BRIDGE_SECRET` é igual em server e bridge

3. **Frontend não salvou a chave:**
   - Abrir DevTools → Storage → LocalStorage
   - Procurar por `x32_admin_key`
   - Se não existir, é normal em modo dev (usa fallback)

## ✅ Checklist

- [ ] Backend rodando em http://localhost:3000
- [ ] Bridge rodando e conectado ao backend
- [ ] Frontend rodando em http://localhost:5173
- [ ] Admin page carrega sem erros
- [ ] `/admin/io-options` retorna status 200
- [ ] Response contém 16 buses e 32 canais
- [ ] Modal "Gerar acesso" mostra os options

## 📚 Referências

- [GUIA_LOCAL.md](./GUIA_LOCAL.md) - Setup completo
- [TEST_SETUP.md](./TEST_SETUP.md) - Testes manuais com curl
- [AGENTS.md](./AGENTS.md) - Arquitetura do projeto
