#!/bin/bash
# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "      🚀 Launching XAUUSD Replay Engine...       "
echo "=================================================="

# 1. Start FastAPI backend in background
if [ -d "venv" ]; then
    echo "-> Starting Python backend server..."
    venv/bin/uvicorn backend.main:app --port 8000 > /dev/null 2>&1 &
    BACKEND_PID=$!
else
    echo "❌ Error: Python virtual environment (venv) not found."
    exit 1
fi

# 2. Start Vite frontend client in background
if [ -d "frontend" ]; then
    echo "-> Starting Vite client server..."
    cd frontend
    npm run dev > /dev/null 2>&1 &
    FRONTEND_PID=$!
    cd ..
else
    echo "❌ Error: frontend directory not found."
    kill $BACKEND_PID
    exit 1
fi

# 3. Wait 2 seconds for servers to initialize
sleep 2

# 4. Open Default Web Browser to Vite client port
echo "-> Opening platform dashboard in default browser..."
open http://localhost:5173

# 5. Handle shutdown signal gracefully (kills servers when terminal window is closed or CTRL+C is pressed)
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM EXIT

echo "=================================================="
echo "  Platform is Active! http://localhost:5173"
echo "  Leave this window open. Press [CTRL+C] to stop."
echo "=================================================="

# Keep script running to maintain child processes
wait
