#!/usr/bin/env sh
# Kumpir Arena'yı http://localhost:8080 adresinde başlatır (macOS / Linux)
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  exec node server.js --open
elif command -v python3 >/dev/null 2>&1; then
  (
    sleep 1
    if [ "$(uname)" = "Darwin" ]; then open http://localhost:8080/; else xdg-open http://localhost:8080/ >/dev/null 2>&1; fi
  ) &
  exec python3 -m http.server 8080 --bind 127.0.0.1
else
  echo "Node.js veya Python bulunamadı. index.html dosyasını tarayıcıda açabilirsiniz."
fi
