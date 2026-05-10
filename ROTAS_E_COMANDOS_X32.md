# Rotas e comandos X32

Referencia das rotas, eventos e comandos usados pelo projeto `x32-system`.

Fluxo principal:

```text
Frontend web -> Backend HTTP/Socket.io -> Bridge Socket.io -> X32 UDP/OSC
```

## Rotas web

| Rota | Uso |
| --- | --- |
| `/` | Tela simples com links para `/admin` e `/mix`. |
| `/admin` | Painel administrativo para gerar, listar, editar, ativar, revogar e remover tokens. |
| `/mix?token=TOKEN` | Tela do musico. O token vem pela query string `token`. |

## Backend HTTP

Base local padrao: `http://localhost:3000`

Quando `ADMIN_API_KEY` estiver definido no backend, as rotas administrativas exigem:

```text
x-admin-key: SUA_CHAVE
```

| Metodo | Rota | Admin | Corpo/query | Funcao |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | Nao | - | Healthcheck e resumo geral: status, bridge conectada, musicos conectados e contagem de tokens. |
| `GET` | `/admin/overview` | Sim | - | Resumo administrativo do sistema. |
| `GET` | `/admin/io-options` | Sim | Query opcional `refresh=true` | Lista BUS e canais. Usa mock ou consulta a bridge, conforme `USE_REAL_X32_IO`. |
| `GET` | `/admin/logs` | Sim | Query opcional `limit=150` | Lista logs em memoria. Limite default `200`, minimo `1`, maximo `1000`. |
| `POST` | `/generate` | Sim | JSON de geracao | Gera token temporario, URL de acesso e QR Code. |
| `POST` | `/revoke` | Sim | `{ "token": "UUID" }` | Revoga token pelo corpo da requisicao. |
| `GET` | `/tokens` | Sim | - | Lista tokens e seus estados publicos. |
| `GET` | `/token/:tokenId/qrcode` | Sim | - | Gera QR Code e URL de acesso para um token existente. |
| `POST` | `/token/:tokenId/revoke` | Sim | - | Revoga token pelo parametro da rota. |
| `POST` | `/token/:tokenId/enable` | Sim | - | Reativa token revogado/desabilitado, desde que nao esteja expirado. |
| `POST` | `/token/:tokenId/extend` | Sim | `{ "minutes": 30 }` | Estende expiracao do token. |
| `PATCH` | `/token/:tokenId` | Sim | JSON parcial | Atualiza `user`, `bus` e/ou `allowedChannels`. |
| `DELETE` | `/token/:tokenId` | Sim | - | Remove token e bloqueia sessoes abertas dele. |

### Corpos HTTP

`POST /generate`

```json
{
  "user": "guitarra",
  "bus": 1,
  "allowedChannels": [1, 5, 9],
  "durationMinutes": 60
}
```

`bus` tambem pode ser array:

```json
{
  "user": "vocal",
  "bus": [1, 2],
  "allowedChannels": [1, 2, 3],
  "durationMinutes": 60
}
```

Validacoes principais:

| Campo | Regra |
| --- | --- |
| `user` | Obrigatorio, string, maximo 64 caracteres. |
| `bus` | Numero ou array de numeros inteiros entre `1` e `16`. |
| `allowedChannels` | Array nao vazio de inteiros entre `1` e `32`. |
| `durationMinutes` | Inteiro entre `1` e `1440`. |

`POST /token/:tokenId/extend`

```json
{
  "minutes": 30
}
```

`minutes` deve ser inteiro entre `1` e `10080`.

`PATCH /token/:tokenId`

```json
{
  "user": "novo nome",
  "bus": [1, 2],
  "allowedChannels": [1, 5, 9]
}
```

Pelo menos um dos campos precisa ser enviado.

## Socket.io

Base: mesma URL do backend.

### Autenticacao da bridge

A bridge conecta no backend com:

```json
{
  "role": "bridge",
  "bridgeSecret": "MESMO_VALOR_DO_BACKEND",
  "bridgeName": "bridge-local"
}
```

Se `BRIDGE_SECRET` estiver definido no backend, a bridge precisa enviar o mesmo valor.

### Autenticacao do musico

O frontend `/mix` conecta no backend com:

```json
{
  "role": "musician",
  "token": "UUID_DO_TOKEN"
}
```

O backend valida o token no handshake e em cada acao de controle.

## Eventos Socket.io do frontend

Eventos recebidos pelo frontend:

| Evento | Direcao | Payload | Funcao |
| --- | --- | --- | --- |
| `session:init` | Backend -> frontend | Dados da sessao | Inicializa usuario, BUS autorizados, canais, controles, expiracao e status da bridge. |
| `bridge:status` | Backend -> frontend | `{ "connected": true }` | Informa se ha bridge conectada. |
| `session:blocked` | Backend -> frontend | `{ "reason": "expired" }` ou `{ "reason": "revoked" }` | Bloqueia a interface quando token expira ou e revogado. |
| `connect_error` | Socket.io -> frontend | Erro | Falha de conexao/autenticacao. |
| `disconnect` | Socket.io -> frontend | Motivo interno | Marca sessao como offline, exceto quando ja esta expirada/revogada/invalida. |

Payload de `session:init`:

```json
{
  "token": "UUID",
  "user": "guitarra",
  "bus": 1,
  "buses": [1, 2],
  "allowedChannels": [1, 5, 9],
  "enabled": true,
  "expiresAt": 1710000000000,
  "bridgeConnected": true,
  "controlsByBus": {
    "1": [
      { "channel": 1, "volume": 0.75, "pan": 0, "mute": 0 }
    ]
  }
}
```

Eventos enviados pelo frontend:

| Evento | Direcao | Payload | Valor |
| --- | --- | --- | --- |
| `control:volume` | Frontend -> backend | `{ "bus": 1, "channel": 1, "value": 0.75 }` | Volume de `0` a `1`. |
| `control:pan` | Frontend -> backend | `{ "bus": 1, "channel": 1, "value": 0 }` | Pan de `-1` a `1`. |
| `control:mute` | Frontend -> backend | `{ "bus": 1, "channel": 1, "value": 1 }` | `1` = mutado, `0` = aberto. |

Resposta por callback (`ack`) dos controles:

Sucesso:

```json
{
  "ok": true,
  "bus": 1,
  "control": {
    "channel": 1,
    "volume": 0.75,
    "pan": 0,
    "mute": 0
  }
}
```

Erro:

```json
{
  "ok": false,
  "error": "CHANNEL_NOT_ALLOWED",
  "blockedReason": "expired"
}
```

Erros comuns:

| Erro | Significado |
| --- | --- |
| `TOKEN_NOT_FOUND` | Token nao existe. |
| `TOKEN_EXPIRED` | Token expirou. |
| `TOKEN_REVOKED` | Token foi revogado. |
| `TOKEN_DISABLED` | Token esta desabilitado. |
| `BRIDGE_NOT_CONNECTED` | Nao ha bridge conectada. |
| `BUS_LOCKED_TO_TOKEN` | BUS enviado nao esta autorizado no token. |
| `CHANNEL_NOT_ALLOWED` | Canal enviado nao esta autorizado no token. |
| `BUS_STATE_NOT_FOUND` | Estado interno do BUS nao foi encontrado. |
| `CHANNEL_STATE_NOT_FOUND` | Estado interno do canal nao foi encontrado. |

## Eventos Socket.io entre backend e bridge

| Evento | Direcao | Payload | Funcao |
| --- | --- | --- | --- |
| `bridge:get-io-options` | Backend -> bridge | `{ "forceRefresh": true }` | Solicita nomes reais ou mock de BUS/canais. Responde por callback. |
| `bridge:get-control-state` | Backend -> bridge | `{ "buses": [1], "channels": [1, 5, 9] }` | Solicita valores atuais de volume, pan e mute/on para montar a tela do musico. |
| `x32` | Backend -> bridge | Evento X32 | Solicita envio de comando OSC para a X32. |
| `connect` | Socket.io -> bridge | - | Loga conexao com backend. |
| `disconnect` | Socket.io -> bridge | Motivo | Loga desconexao. |
| `connect_error` | Socket.io -> bridge | Erro | Loga falha de conexao/autenticacao. |

Payload do evento `x32`:

```json
{
  "token": "UUID",
  "user": "guitarra",
  "channel": 1,
  "bus": 1,
  "param": "volume",
  "value": 0.75,
  "timestamp": 1710000000000
}
```

`param` pode ser:

```text
volume | pan | mute
```

## Comandos OSC enviados para a X32

Destino UDP:

| Configuracao | Default |
| --- | --- |
| `X32_IP` | `192.168.0.100` |
| `X32_PORT` | `10023` |

A bridge codifica OSC binario com address, typetag e argumento em big-endian.

### Controle de volume

Evento de origem:

```json
{
  "param": "volume",
  "channel": 1,
  "bus": 1,
  "value": 0.75
}
```

Comando OSC:

```text
/ch/{channel_2_digitos}/mix/{bus_2_digitos}/level
```

Exemplo:

```text
/ch/01/mix/01/level
typetag: ,f
valor: float 0.75
```

Regra de valor:

```text
value = clamp(value, 0, 1)
```

### Controle de pan

Evento de origem:

```json
{
  "param": "pan",
  "channel": 1,
  "bus": 1,
  "value": 0
}
```

Comando OSC:

```text
/ch/{channel_2_digitos}/mix/{bus_2_digitos}/pan
```

Exemplo:

```text
/ch/01/mix/01/pan
typetag: ,f
valor: float 0
```

Regra de valor:

```text
value = clamp(value, -1, 1)
```

### Controle de mute/on

O frontend trabalha com `mute`:

```text
mute=1 -> mutado
mute=0 -> aberto
```

A X32 usa `/on` com logica inversa:

```text
/on=1 -> canal aberto no mix
/on=0 -> canal fechado no mix
```

Evento de origem:

```json
{
  "param": "mute",
  "channel": 1,
  "bus": 1,
  "value": 1
}
```

Comando OSC:

```text
/ch/{channel_2_digitos}/mix/{bus_2_digitos}/on
```

Exemplo:

```text
/ch/01/mix/01/on
typetag: ,i
valor: int 0
```

Conversao:

| Valor recebido | Significado no frontend | Valor enviado em `/on` |
| --- | --- | --- |
| `< 0.5` | aberto | `1` |
| `>= 0.5` | mutado | `0` |

## Consultas OSC de nomes reais

Usadas quando `USE_REAL_X32_IO=true`.

### Nomes dos BUS

A bridge consulta BUS `1` a `16`.

```text
/bus/{bus_2_digitos}/config/name
```

Exemplos:

```text
/bus/01/config/name
/bus/16/config/name
```

Mensagem enviada:

```text
address: /bus/01/config/name
typetag: ,
args: nenhum
```

A resposta esperada da X32 deve ter o mesmo address e algum argumento string com o nome.

### Nomes dos canais

A bridge consulta canais `1` a `32`.

```text
/ch/{channel_2_digitos}/config/name
```

Exemplos:

```text
/ch/01/config/name
/ch/32/config/name
```

Mensagem enviada:

```text
address: /ch/01/config/name
typetag: ,
args: nenhum
```

A resposta esperada da X32 deve ter o mesmo address e algum argumento string com o nome.

## Consultas OSC de valores atuais

Usadas pela bridge quando a tela do musico conecta e `USE_REAL_X32_IO=true` na bridge.

Para cada BUS/canal autorizado no token, a bridge consulta:

```text
/ch/{channel_2_digitos}/mix/{bus_2_digitos}/level
/ch/{channel_2_digitos}/mix/{bus_2_digitos}/pan
/ch/{channel_2_digitos}/mix/{bus_2_digitos}/on
```

Exemplo para canal `1`, BUS `1`:

```text
/ch/01/mix/01/level
/ch/01/mix/01/pan
/ch/01/mix/01/on
```

Conversao na leitura de `/on`:

| Valor lido em `/on` | Valor mostrado como `mute` |
| --- | --- |
| `1` | `0` aberto |
| `0` | `1` mutado |

## Regras de seguranca e limites

| Item | Regra aplicada |
| --- | --- |
| Token | Validado no handshake Socket.io e em cada controle. |
| Expiracao/revogacao | Backend emite `session:blocked` e desconecta sessoes do token. |
| Bridge | Backend so envia comando X32 se houver bridge conectada. |
| BUS | Payload pode informar `bus`, mas backend so aceita se estiver dentro dos BUS autorizados do token. Se nao informar, usa o primeiro BUS do token. |
| Canal | Backend so aceita canais dentro de `allowedChannels`. |
| Volume | Backend e bridge limitam para `0..1`. |
| Pan | Backend e bridge limitam para `-1..1`. |
| Mute | Backend converte para `0` ou `1`; bridge converte para `/on`. |
