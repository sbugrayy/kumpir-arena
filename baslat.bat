@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 goto node
where python >nul 2>nul
if not errorlevel 1 goto python
echo Node.js veya Python bulunamadi, oyun dogrudan tarayicida aciliyor...
start "" "%~dp0index.html"
goto :eof
:node
node server.js --open
goto :eof
:python
start "" http://localhost:8080/
python -m http.server 8080 --bind 127.0.0.1
