#!/usr/bin/env bash
# ─── TripMind: start backend + frontend ────────────────────────────────────────

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ─── Backend ────────────────────────────────────────────────────────────────────
echo "📦 Installing backend dependencies…"
cd "$ROOT/backend"
pip install -q -r requirements.txt

echo "🚀 Starting FastAPI backend on http://localhost:8000"
pushd "$ROOT/backend" > /dev/null
uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
popd > /dev/null

# ─── Frontend ───────────────────────────────────────────────────────────────────
echo "📦 Installing frontend dependencies…"
cd "$ROOT/frontend"
npm install --silent

echo "🎨 Starting Next.js frontend on http://localhost:3000"
npm run dev &
FRONTEND_PID=$!

# ─── Cleanup on exit ────────────────────────────────────────────────────────────
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

echo ""
echo "✅  TripMind running:"
echo "   Frontend → http://localhost:3000"
echo "   Backend  → http://localhost:8000"
echo "   API docs → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop."
wait
