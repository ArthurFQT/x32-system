#!/bin/bash
# Setup e execução local do X32 Monitor Control

echo "🚀 X32 Monitor Control - Configuração Local"
echo "============================================"

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. Instalar dependências
echo -e "\n${BLUE}📦 Instalando dependências...${NC}"
cd server && yarn install && cd ..
cd bridge && yarn install && cd ..
cd web && yarn install && cd ..

echo -e "\n${GREEN}✅ Setup concluído!${NC}"
echo -e "\n${BLUE}Para iniciar o desenvolvimento, abra 3 terminais e execute:${NC}"
echo ""
echo -e "${BLUE}Terminal 1 - Backend (Server):${NC}"
echo "  cd server && yarn dev"
echo ""
echo -e "${BLUE}Terminal 2 - Bridge:${NC}"
echo "  cd bridge && yarn dev"
echo ""
echo -e "${BLUE}Terminal 3 - Frontend (Web):${NC}"
echo "  cd web && yarn dev"
echo ""
echo -e "${BLUE}Aplicação será acessível em: ${GREEN}http://localhost:5173${NC}"
