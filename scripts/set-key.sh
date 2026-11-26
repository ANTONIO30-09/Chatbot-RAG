#!/usr/bin/env bash
set -euo pipefail
read -rsp "Nueva llave Groq: " K; echo
K=$(printf '%s' "$K" | tr -cd '[:alnum:]_-')
[[ $K == gsk_* ]]  || { echo "ERROR: no empieza con gsk_"; exit 1; }
len=${#K}
[[ $len -ge 50 ]]  || { echo "ERROR: muy corta ($len chars)"; exit 1; }
code=$(curl -s -o /dev/null -w "%{http_code}" \
  https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $K")
[[ $code == 200 ]] || { echo "ERROR: Groq responde HTTP $code"; exit 1; }
umask 077
printf 'GROQ_API_KEY=%s\nPORT=3000\n' "$K" > .env
chmod 600 .env
unset K
echo "OK: .env actualizado (chmod 600) — largo $len"
