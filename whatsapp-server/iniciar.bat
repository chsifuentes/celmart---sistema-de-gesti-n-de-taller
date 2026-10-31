@echo off
setlocal
cd /d "%~dp0"
docker compose version >nul 2>&1
if errorlevel 1 (
  echo Instala Docker Desktop con Docker Compose y vuelve a ejecutar.
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo Abre Docker Desktop y espera a que inicie el motor.
  exit /b 1
)
if not exist .env (
  powershell -NoProfile -Command "$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$a=New-Object byte[] 32;$b=New-Object byte[] 32;$rng.GetBytes($a);$rng.GetBytes($b);$key=([BitConverter]::ToString($a)).Replace('-','').ToLower();$pass=([BitConverter]::ToString($b)).Replace('-','').ToLower();[IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'),@(('AUTHENTICATION_API_KEY='+$key),('POSTGRES_PASSWORD='+$pass),'SERVER_URL=http://localhost:8080','BIND_ADDRESS=127.0.0.1','CORS_ORIGIN=*'));$rng.Dispose()"
  if errorlevel 1 exit /b 1
)
docker compose up -d --wait --wait-timeout 120
if errorlevel 1 exit /b 1
echo Evolution API: http://localhost:8080 . Credenciales en .env.
echo Crea o conecta la instancia celmart siguiendo README.md.
endlocal
