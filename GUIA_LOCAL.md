# Guia de Desenvolvimento Local - X32 Monitor Control

## ✅ Pré-requisitos

- Node.js v18+
- Yarn ou npm
- 3 terminais disponíveis

## 🚀 Instalação Rápida

### Windows

```bash
.\setup-dev.bat
```

### macOS/Linux

```bash
chmod +x setup-dev.sh
./setup-dev.sh
```

## 📋 Instalação Manual

Se preferir instalar manualmente:

```bash
# Server
cd server
yarn install

# Bridge
cd ../bridge
yarn install

# Web
cd ../web
yarn install
```

## 🔧 Configuração de Ambiente

Os arquivos `.env.dev` já estão configurados para rodar localmente:

### Server (`server/.env.dev`)

- **PORT**: 3000
- **HOST**: 127.0.0.1
- **CORS_ORIGIN**: http://localhost:5173
- **USE_REAL_X32_IO**: false (modo simulado)
- **ADMIN_API_KEY**: dev-admin-key-12345

### Bridge (`bridge/.env.dev`)

- **SERVER_URL**: http://localhost:3000
- **USE_REAL_X32_IO**: false (modo simulado)

### Web (`web/.env.dev`)

- **VITE_SERVER_URL**: http://localhost:3000

## 🎯 Executar Localmente

Abra **3 terminais** distintos e execute em cada um:

### Terminal 1 - Backend

```bash
cd server
yarn dev
```

Acesso: http://localhost:3000

### Terminal 2 - Bridge

```bash
cd bridge
yarn dev
```

### Terminal 3 - Frontend

```bash
cd web
yarn dev
```

Acesso: http://localhost:5173 ⭐ **Aqui!**

## 🔌 Conectar a X32 Real

Para conectar a um equipamento X32 real:

1. **No arquivo `bridge/.env.dev`**, ajuste:

   ```
   X32_HOST=192.168.1.100  # IP da sua X32
   USE_REAL_X32_IO=true
   ```

2. **Certifique-se** de que:
   - A X32 está na mesma rede
   - A porta 10023 (UDP) está disponível
   - O servidor está rodando e o bridge conectado

## 🛠️ Troubleshooting

### Porta 3000 já em uso

```bash
# Windows
netstat -ano | findstr :3000

# macOS/Linux
lsof -i :3000
```

### Porta 5173 já em uso (Web)

O Vite tentará automaticamente a próxima porta disponível.

### Bridge não conecta ao server

- Verifique se o server está rodando em http://localhost:3000
- Confirme a variável `SERVER_URL` em `bridge/.env.dev`
- Verifique se o `BRIDGE_SECRET` é idêntico em ambos

## 📝 Estrutura do Projeto

```
├── server/     → Backend Express + Socket.io
├── bridge/     → Bridge para OSC/UDP
├── web/        → Frontend React + Vite
└── scripts/    → Scripts auxiliares
```

## 🔐 Variáveis de Ambiente

| Variável        | Server | Bridge | Web | Descrição                    |
| --------------- | ------ | ------ | --- | ---------------------------- |
| PORT            | ✓      | -      | -   | Porta do servidor            |
| BRIDGE_SECRET   | ✓      | ✓      | -   | Chave compartilhada          |
| SERVER_URL      | -      | ✓      | -   | URL do backend               |
| VITE_SERVER_URL | -      | -      | ✓   | URL do backend (frontend)    |
| USE_REAL_X32_IO | ✓      | ✓      | -   | Usar X32 real ou simulado    |
| X32_HOST        | -      | ✓      | -   | IP da X32                    |
| X32_PORT        | -      | ✓      | -   | Porta da X32 (padrão: 10023) |

## 🧪 Testes

```bash
# Server
cd server
yarn test

# Bridge
cd bridge
yarn test

# Web
cd web
yarn test
```

## 📚 Documentação Adicional

- [AGENTS.md](./AGENTS.md) - Regras e arquitetura do projeto
- [ROTAS_E_COMANDOS_X32.md](./ROTAS_E_COMANDOS_X32.md) - Comandos OSC da X32
- [PLANO.md](./PLANO.md) - Plano do projeto
