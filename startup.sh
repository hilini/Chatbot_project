#!/bin/bash

# Anticancer Chat Application Startup Script
# This script helps start the anticancer chat application by:
# 1. Checking if required ports are available
# 2. Killing any conflicting processes
# 3. Starting the server and client
# 4. Providing status information

echo "===== Anticancer Chat Application Startup ====="
echo "Starting initialization process..."

# Check if ports 3000 and 3001 are in use
echo "Checking if required ports are available..."
PORT_3000_PID=$(lsof -ti:3000)
PORT_3001_PID=$(lsof -ti:3001)

# Kill processes if they exist
if [ ! -z "$PORT_3000_PID" ]; then
  echo "Port 3000 is in use by process $PORT_3000_PID. Terminating..."
  kill -9 $PORT_3000_PID
fi

if [ ! -z "$PORT_3001_PID" ]; then
  echo "Port 3001 is in use by process $PORT_3001_PID. Terminating..."
  kill -9 $PORT_3001_PID
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

# Check Chroma vector database (local file-based)
echo "Checking Chroma vector database..."

# Using local file-based Chroma (no server needed)
echo "✅ Using local file-based Chroma (no server required)"

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
echo ""
echo "Press Ctrl+C to stop the application"
echo "===== Application Logs ====="

# Start the application using npm run dev
npm run dev

# This part will execute when the user presses Ctrl+C
echo ""
echo "===== Shutting down the application ====="
echo "Terminating all related processes..."
pkill -f "node.*server.js" || true
pkill -f "node.*start" || true
echo "Application has been shut down" 