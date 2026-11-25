#!/usr/bin/env bash
BASE="${1:-http://localhost:3000}"
echo "== health";  curl -s "$BASE/health"; echo; echo
echo "== search";  curl -s -G "$BASE/api/search" --data-urlencode "q=microcredenciales de derecho"; echo; echo
for q in "Hola, que carreras tienen?" "Que es una microcredencial y para que sirve?" "Que menciones tiene Derecho?" "Cuanto dura Sistemas?" "Cuanto cuesta la mensualidad?"; do
  echo "== chat: $q"
  curl -s -X POST "$BASE/api/chat" -H 'Content-Type: application/json' -d "{\"message\":\"$q\"}"
  echo; echo
done
