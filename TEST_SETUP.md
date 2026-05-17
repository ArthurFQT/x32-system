# Teste de Configuração Local

## ✅ Verificar Configurações

### 1. Server (backend)
- Arquivo: `server/.env.dev`
- Verificar:
  - `ADMIN_API_KEY=dev-admin-key-12345` ✓
  - `BRIDGE_SECRET=x32_super_secret_2026` ✓
  - `USE_REAL_X32_IO=false` ✓
  - `PORT=3000` ✓

### 2. Bridge
- Arquivo: `bridge/.env.dev`
- Verificar:
  - `BRIDGE_SECRET=x32_super_secret_2026` ✓ (deve ser igual ao server)
  - `SERVER_URL=http://localhost:3000` ✓
  - `USE_REAL_X32_IO=false` ✓

### 3. Web (frontend)
- Arquivo: `web/.env.dev`
- Verificar:
  - `VITE_SERVER_URL=http://localhost:3000` ✓

## 🧪 Testes da API

### Teste 1: Verificar I/O Options (SEM autenticação)
```bash
curl http://localhost:3000/admin/io-options
```
**Resultado esperado**: 401 (Unauthorized)

### Teste 2: Verificar I/O Options (COM autenticação)
```bash
curl -H "x-admin-key: dev-admin-key-12345" http://localhost:3000/admin/io-options
```
**Resultado esperado**: 
```json
{
  "mode": "mock",
  "options": {
    "source": "mock",
    "buses": [...16 buses...],
    "channels": [...32 channels...],
    "fetchedAt": 1234567890
  }
}
```

### Teste 3: Verificar Health
```bash
curl http://localhost:3000/health
```
**Resultado esperado**: 
```json
{
  "ok": true,
  "now": ...,
  "bridgeConnected": true/false,
  "connectedMusicians": 0,
  "tokens": {...}
}
```

## 🔧 Solução de Problemas

### Problema: Frontend não mostra buses e canais

**Possíveis causas:**
1. Chave de admin não está sendo passada
2. Backend não está retornando os dados
3. Network erro na requisição

**Solução:**
1. Abrir DevTools (F12)
2. Ir em Network
3. Filtrar por `/admin/io-options`
4. Verificar:
   - Status da requisição
   - Headers enviados (deve ter `x-admin-key: dev-admin-key-12345`)
   - Response body

### Problema: Backend retorna 401

**Solução:**
1. Verificar se `ADMIN_API_KEY` está definido em `server/.env.dev`
2. Verificar se o frontend está enviando o header `x-admin-key` corretamente
3. Verificar se as chaves batem entre frontend e backend

### Problema: Bridge não conecta

**Solução:**
1. Verificar se `BRIDGE_SECRET` é igual em `server/.env.dev` e `bridge/.env.dev`
2. Verificar se o bridge está rodando
3. Verificar se o server está rodando
4. Verificar logs do bridge para erro de conexão

## 📝 Checklist Final

- [ ] `server/.env.dev` tem todos os valores
- [ ] `bridge/.env.dev` tem todos os valores
- [ ] `web/.env.dev` tem todos os valores
- [ ] Chave `BRIDGE_SECRET` é igual em server e bridge
- [ ] Frontend consegue acessar `/admin/io-options` e recebe buses e canais
- [ ] Bridge conecta no server com sucesso
- [ ] Painel admin mostra os dados
