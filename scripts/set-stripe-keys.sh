#!/usr/bin/env bash
# Guarda tus claves de Stripe TEST directamente en .env, de forma interactiva.
# No muestra la clave secreta en pantalla, no hace commit, no duplica variables.
set -euo pipefail

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No encuentro un archivo .env en esta carpeta."
  echo "Asegúrate de estar dentro de la carpeta del proyecto (copa-de-ferias) antes de ejecutar este script."
  exit 1
fi

set_env_var() {
  local key="$1" value="$2" file="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

echo "Vamos a guardar tus dos claves de Stripe TEST en $ENV_FILE."
echo "Ningún valor se mostrará después de introducirlo, ni se subirá a git."
echo

read -r -p "1) Pega tu clave PUBLICABLE de Stripe TEST (empieza por pk_test_) y pulsa Intro: " PUBLISHABLE_KEY
if [ -z "$PUBLISHABLE_KEY" ]; then
  echo "No se ha introducido ningún valor. Cancelado — no se ha modificado nada."
  exit 1
fi
case "$PUBLISHABLE_KEY" in
  pk_test_*) ;;
  *) echo "Aviso: ese valor no empieza por 'pk_test_'. Continúo igualmente, pero revísalo si no era la clave publicable de TEST." ;;
esac

echo
read -r -s -p "2) Pega tu clave SECRETA de Stripe TEST (empieza por sk_test_) — no se mostrará mientras escribes — y pulsa Intro: " SECRET_KEY
echo
if [ -z "$SECRET_KEY" ]; then
  echo "No se ha introducido ningún valor. Cancelado — no se ha modificado nada."
  exit 1
fi
case "$SECRET_KEY" in
  sk_test_*) ;;
  *) echo "Aviso: ese valor no empieza por 'sk_test_'. Continúo igualmente, pero revísalo si no era la clave secreta de TEST." ;;
esac

set_env_var "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "$PUBLISHABLE_KEY" "$ENV_FILE"
set_env_var "STRIPE_SECRET_KEY" "$SECRET_KEY" "$ENV_FILE"

unset PUBLISHABLE_KEY SECRET_KEY

echo
echo "Hecho. Se han guardado las dos claves en $ENV_FILE."
echo "STRIPE_WEBHOOK_SECRET se ha dejado tal cual (vacío) — lo configuraremos después."
echo "No se ha tocado ninguna variable de Duffel ni de Nuitee."
echo "No se ha hecho commit de $ENV_FILE."
echo "No se ha ejecutado ninguna prueba de Stripe."
