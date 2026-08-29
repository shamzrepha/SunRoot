#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-shot Vercel setup for SunRoot.
#
# What this does NOT automate (can't be — needs a human clicking "Approve"
# in a browser): the Vercel login itself. Run `vercel login` first if you
# haven't already; this script checks and tells you plainly if you need to.
#
# What it DOES automate: linking the project, pushing every environment
# variable from .env.vercel non-interactively, and deploying to production.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=".env.vercel"

echo "== 1. Checking Vercel CLI =="
if ! command -v vercel >/dev/null 2>&1; then
  echo "Installing Vercel CLI..."
  npm install -g vercel
fi

echo "== 2. Checking login =="
if ! vercel whoami >/dev/null 2>&1; then
  echo "You're not logged in yet. Run this first, then re-run this script:"
  echo ""
  echo "    vercel login"
  echo ""
  exit 1
fi
echo "Logged in as: $(vercel whoami)"

echo "== 3. Checking env values file =="
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — it should have shipped alongside this script."
  exit 1
fi
if grep -q "REPLACE_ME" "$ENV_FILE"; then
  echo "Open $ENV_FILE and replace GROQ_API_KEY's placeholder with your real key"
  echo "from https://console.groq.com/keys, then re-run this script."
  exit 1
fi

echo "== 4. Linking project =="
vercel link --yes

echo "== 5. Pushing environment variables (production) =="
while IFS='=' read -r key value; do
  # Skip blank lines and comments.
  [ -z "$key" ] && continue
  case "$key" in \#*) continue ;; esac

  echo "  -> $key"
  # Remove first, ignore failure if it doesn't exist yet — keeps this
  # script safe to re-run without "already exists" errors.
  vercel env rm "$key" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" production >/dev/null
done < "$ENV_FILE"

echo "== 6. Deploying to production =="
vercel --prod

echo ""
echo "Done. If any step above still showed an interactive prompt you had to"
echo "answer by hand, that's fine — this script skips as much as the Vercel"
echo "CLI allows, but a couple of confirmations aren't scriptable."
