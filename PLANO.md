Você vai gerar um projeto completo, funcional e organizado chamado x32-system para controle remoto de mixes de retorno de uma Behringer X32 via web.

Quero um MVP real, simples e funcional, sem enfeite, com código limpo, comentado nas partes críticas, e pronto para rodar.

# OBJETIVO

Construir um sistema onde:
- o admin gera um acesso temporário para um músico
- o sistema gera um QR Code
- o músico escaneia e abre uma interface web mobile
- o músico controla apenas o próprio retorno
- o admin pode revogar o acesso a qualquer momento
- o acesso expira automaticamente
- o sistema funciona via internet
- a comunicação final com a X32 acontece por bridge local via UDP/OSC

# ARQUITETURA OBRIGATÓRIA

O projeto deve ter 3 partes:

1. server/
- Node.js
- Express
- Socket.io
- hospedável em VPS
- gerencia tokens, permissões, QR Code, autenticação, expiração e roteamento de eventos

2. bridge/
- Node.js
- roda localmente no PC da igreja/evento
- conecta ao backend via Socket.io client
- recebe comandos do backend
- codifica OSC binário corretamente
- envia via UDP para a X32
- porta padrão da X32: 10023

3. web/
- React + Vite
- mobile-first
- interface simples, responsiva e direta
- acessada via QR Code
- músico só vê e controla o que estiver autorizado

# ESTRUTURA DE PASTAS

x32-system/
  server/
  bridge/
  web/

# FUNCIONALIDADES OBRIGATÓRIAS

## 1. Tokens

Cada token deve ter estes campos:
- id
- user: string
- bus: number ou array de numbers
- allowedChannels: number[]
- enabled: boolean
- expiresAt: timestamp
- createdAt: timestamp

Pode armazenar em memória para o MVP, mas de forma organizada.

Regras:
- validar token em toda ação
- nunca confiar no frontend
- impedir alteração de BUS pelo cliente
- limitar volume, pan e mute
- desconectar e bloquear o frontend imediatamente se o token for revogado ou expirar

## 2. Endpoints admin

Criar no backend:

### POST /generate
Recebe payload semelhante a:
{
  "user": "guitarra",
  "bus": 1,
  "allowedChannels": [1, 5, 9],
  "durationMinutes": 60
}

Esse endpoint deve:
- gerar UUID único
- criar token
- calcular expiração
- gerar URL de acesso no formato /mix?token=XYZ
- gerar QR Code
- retornar JSON com:
  - token
  - accessUrl
  - qrCodeDataUrl
  - tokenData

### POST /revoke
Recebe:
{
  "token": "..."
}

Deve:
- marcar enabled = false
- notificar em tempo real a sessão conectada
- invalidar uso imediato

### GET /tokens
Deve listar:
- tokens ativos
- e também pode listar revogados/expirados com status claro, se ficar simples

## 3. WebSocket

Usar Socket.io.

Fluxo:
frontend → backend → bridge → X32

Requisitos:
- frontend conecta autenticando com token
- backend valida token no handshake e nas ações
- backend envia estado inicial ao frontend autenticado
- backend encaminha comandos válidos para a bridge
- bridge recebe evento "x32"
- backend notifica frontend sobre:
  - token expirado
  - token revogado
  - bridge desconectada, se quiser expor isso
- múltiplos músicos simultâneos devem funcionar

## 4. Controles de áudio

Para cada canal permitido, o frontend deve permitir:
- volume: 0.0 a 1.0
- pan: -1.0 a 1.0
- mute: 0 ou 1

Comandos OSC da X32:
- /ch/{channel}/mix/{bus}/level
- /ch/{channel}/mix/{bus}/pan
- /ch/{channel}/mix/{bus}/on

Importante:
- implementar encoding OSC binário corretamente
- tratar padding OSC
- tratar type tags
- mandar float/int no formato correto
- enviar via UDP para IP configurável da X32 na bridge

Observação:
- no endpoint OSC da X32, o campo /on costuma trabalhar com lógica de on/off; implemente isso de forma consistente e documente no comentário do código
- se usar mute no frontend, faça a conversão adequada antes de enviar ao path OSC correspondente

## 5. Bridge local

A bridge deve:
- ler BACKEND_URL
- ler X32_IP
- ler X32_PORT
- conectar ao backend via Socket.io client
- identificar-se como bridge
- ouvir eventos "x32"
- converter para OSC binário
- enviar por UDP
- logar comando enviado e erro de envio

## 6. Frontend

Criar app React + Vite com:
- rota /mix
- leitura do token pela query string
- conexão via Socket.io
- autenticação com token
- tela mobile-first
- nome do músico
- status do acesso:
  - ativo
  - bloqueado
  - expirado
- lista só dos canais permitidos
- cada canal com:
  - label "Canal X"
  - slider volume
  - controle pan
  - toggle/botão mute
- bloquear toda interface quando token inválido

Não precisa painel admin web. O admin pode usar os endpoints HTTP via curl/Postman.

## 7. Logs

Adicionar logs simples no backend:
- timestamp
- user
- token
- ação

Exemplos:
- TOKEN_GENERATED
- TOKEN_REVOKED
- CONTROL_VOLUME
- CONTROL_PAN
- CONTROL_MUTE
- TOKEN_EXPIRED
- SOCKET_AUTH_FAILED

## 8. Segurança

Implementar no backend:
- validação rígida do token
- rejeição de canais não permitidos
- rejeição de bus diferente do token
- clamp de valores
- impedir ações se enabled = false
- impedir ações se expiresAt já passou
- cleanup de tokens expirados
- emitir evento de bloqueio em tempo real

# STACK

## server
Use:
- express
- socket.io
- uuid
- qrcode
- cors
- dotenv

## bridge
Use:
- socket.io-client
- dotenv
- dgram nativo do Node

## web
Use:
- react
- vite
- socket.io-client

Pode usar styled-components.

# REQUISITOS DE IMPLEMENTAÇÃO

- Faça o mínimo necessário para funcionar bem
- Sem abstrações exageradas
- Sem inventar arquitetura enterprise
- Código legível
- Comentários apenas onde importa
- Separação por responsabilidade
- Tratar erros básicos
- Criar arquivos .env.example onde fizer sentido
- Criar README com instruções de execução

# SAÍDA OBRIGATÓRIA

Quero que você entregue em blocos, nesta ordem exata:

1. Árvore completa de diretórios
2. Todos os arquivos do server
3. Todos os arquivos do bridge
4. Todos os arquivos do web
5. README.md com instruções de execução

# FORMATO OBRIGATÓRIO DE RESPOSTA

Para cada arquivo, use exatamente este formato:

FILE: caminho/do/arquivo.ext
```ext
...conteúdo completo...