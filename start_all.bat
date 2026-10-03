@echo off
REM ---------------------------------------------------------------
REM  Starts the Instagram AI auto-reply bot and its HTTPS tunnel.
REM  Double-click this after a reboot / power cut.
REM ---------------------------------------------------------------
cd /d "%~dp0"

echo [1/3] starting the bot...
start "ig-bot" /min cmd /c "python run.py > logs\bot.log 2>&1"

timeout /t 4 /nobreak >nul

echo [2/3] starting the tunnel...
start "ig-tunnel" /min cmd /c "bin\cloudflared.exe tunnel --url http://127.0.0.1:8080 > logs\tunnel.log 2>&1"

echo [3/3] waiting for the tunnel URL...
timeout /t 22 /nobreak >nul

echo.
echo ===============================================================
echo  Paste THIS as the Callback URL in the Meta dashboard
echo  (Instagram product -^> 2. Configure webhooks -^> Callback URL),
echo  then press "Verify and save":
echo.
powershell -NoProfile -Command "$m = (Select-String -Path 'logs\tunnel.log' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Where-Object { $_.Line -notmatch 'api\.trycloudflare' } | Select-Object -Last 1); if ($m) { $m.Matches.Value + '/webhook' } else { '(tunnel URL not found yet - wait a few seconds and run: type logs\tunnel.log)' }"
echo.
echo  Verify token:  see IG_VERIFY_TOKEN in .env
echo ===============================================================
echo.
pause
