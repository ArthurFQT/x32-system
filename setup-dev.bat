@echo off
REM Setup e execução local do X32 Monitor Control para Windows

echo 🚀 X32 Monitor Control - Configuracao Local
echo ============================================

REM 1. Instalar dependências
echo.
echo 📦 Instalando dependencias...
cd server
call yarn install
cd ..

cd bridge
call yarn install
cd ..

cd web
call yarn install
cd ..

echo.
echo Configurando arquivos .env.dev...
if not exist server\.env.dev copy server\.env.dev.example server\.env.dev
if not exist bridge\.env.dev copy bridge\.env.dev.example bridge\.env.dev
if not exist web\.env.dev copy web\.env.dev.example web\.env.dev

echo.
echo ✅ Setup concluido!
echo.
echo Para iniciar o desenvolvimento, abra 3 terminais e execute:
echo.
echo Terminal 1 - Backend (Server):
echo   cd server ^&^& yarn dev
echo.
echo Terminal 2 - Bridge:
echo   cd bridge ^&^& yarn dev
echo.
echo Terminal 3 - Frontend (Web):
echo   cd web ^&^& yarn dev
echo.
echo Aplicacao sera acessivel em: http://localhost:5173
