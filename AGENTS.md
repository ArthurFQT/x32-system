
# Regras do Projeto - X32 Monitor Control

## Arquitetura

O sistema é dividido em 3 partes:

1. Backend (server/)
2. Bridge local (bridge/)
3. Frontend (web/)

---

## Backend (server)

- Node.js + Express
- Usar Socket.io para comunicação em tempo real
- Responsável por:
  - Gerar tokens
  - Validar acesso
  - Controlar permissões
  - Enviar eventos para bridge

---

## Bridge (bridge)

- Node.js
- Conecta via Socket.io no backend
- Responsável por:
  - Receber comandos do backend
  - Converter para OSC
  - Enviar via UDP para a X32

---

## Frontend (web)

- React com vite e typescript
- Mobile-first
- Não pode se comunicar diretamente com a X32
- Deve usar WebSocket com backend

---

## Regras de Segurança

- Nunca confiar no frontend
- Validar token em todas as ações
- Não permitir alterar BUS via frontend
- Limitar valores de volume e pan

---

## X32

- Comunicação via UDP (OSC)
- Porta: 10023
- Comandos:
  - /ch/{channel}/mix/{bus}/level
  - /ch/{channel}/mix/{bus}/pan
  - /ch/{channel}/mix/{bus}/on

---

## Objetivo

Criar um sistema onde músicos controlam seu próprio retorno via QR Code com acesso temporário.