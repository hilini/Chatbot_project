#!/bin/bash

# Anticancer Chat Application Startup Script
# This script helps start the anticancer chat application by:
# 1. Checking if required ports are available
# 2. Killing any conflicting processes
# 3. Starting vLLM embedding server
# 4. Starting Chroma vector database
# 5. Starting the server and client
# 6. Providing status information

echo "===== Anticancer Chat Application Startup ====="
echo "Starting initialization process..."

# Check if ports 3000, 3001, 8001, 8002 are in use
echo "Checking if required ports are available..."
PORT_3000_PID=$(lsof -ti:3000)
PORT_3001_PID=$(lsof -ti:3001)
PORT_8001_PID=$(lsof -ti:8001)
PORT_8002_PID=$(lsof -ti:8002)

# Kill processes if they exist
if [ ! -z "$PORT_3000_PID" ]; then
  echo "Port 3000 is in use by process $PORT_3000_PID. Terminating..."
  kill -9 $PORT_3000_PID
fi

if [ ! -z "$PORT_3001_PID" ]; then
  echo "Port 3001 is in use by process $PORT_3001_PID. Terminating..."
  kill -9 $PORT_3001_PID
fi

if [ ! -z "$PORT_8001_PID" ]; then
  echo "Port 8001 is in use by process $PORT_8001_PID. Terminating..."
  kill -9 $PORT_8001_PID
fi

if [ ! -z "$PORT_8002_PID" ]; then
  echo "Port 8002 is in use by process $PORT_8002_PID. Terminating..."
  kill -9 $PORT_8002_PID
fi

# Give a moment for processes to terminate
sleep 2

# Check if node_modules exists, if not install dependencies
echo "Checking dependencies..."

if [ ! -d "node_modules" ]; then
  echo "Main node_modules not found. Installing main dependencies..."
  npm install
else
  echo "Main dependencies already installed. Skipping npm install."
fi

if [ ! -d "client/node_modules" ]; then
  echo "Client node_modules not found. Installing client dependencies..."
  cd client && npm install && cd ..
else
  echo "Client dependencies already installed. Skipping npm install."
fi

# Start vLLM embedding server
echo "🚀 Starting vLLM embedding server..."
python -m vllm.entrypoints.openai.api_server --model BAAI/bge-large-en-v1.5 --port 8002 --host 0.0.0.0 --served-model-name bge-large &
VLLM_PID=$!
echo "✅ vLLM embedding server started (PID: $VLLM_PID)"

# Wait for vLLM server to start
echo "⏳ Waiting for vLLM server to start..."
sleep 10

# Start Chroma vector database
echo "🚀 Starting Chroma vector database..."
chroma run --host localhost --port 8001 --path ./chroma_db &
CHROMA_PID=$!
echo "✅ Chroma vector database started (PID: $CHROMA_PID)"

# Wait for Chroma server to start
echo "⏳ Waiting for Chroma server to start..."
sleep 5

# Check if vector store exists, if not rebuild it
echo "Checking vector store..."

if [ ! -f "server/data/vector/metadata.json" ]; then
  echo "Vector store not found. Rebuilding..."
  npm run rebuild-chroma
else
  echo "✅ Vector store exists. Skipping rebuild."
fi

# Start the application
echo "Starting the application..."
echo "The server will be available at: http://localhost:3001/api/health"
echo "The client will be available at: http://localhost:3000"
echo "vLLM embedding server: http://localhost:8002"
echo "Chroma vector database: http://localhost:8001"
echo ""
echo "Press Ctrl+C to stop the application"
echo "===== Application Logs ====="

# Start the application using npm run dev
npm run dev

# This part will execute when the user presses Ctrl+C
echo ""
echo "===== Shutting down the application ====="
echo "Terminating all related processes..."

# Kill vLLM server
if [ ! -z "$VLLM_PID" ]; then
  echo "Terminating vLLM server (PID: $VLLM_PID)..."
  kill -9 $VLLM_PID 2>/dev/null || true
fi

# Kill Chroma server
if [ ! -z "$CHROMA_PID" ]; then
  echo "Terminating Chroma server (PID: $CHROMA_PID)..."
  kill -9 $CHROMA_PID 2>/dev/null || true
fi

# Kill Node.js processes
pkill -f "node.*server.js" || true
pkill -f "node.*start" || true

echo "Application has been shut down" 