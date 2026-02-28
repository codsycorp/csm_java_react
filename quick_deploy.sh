#!/bin/bash
# Quick deploy script - Cho deploy nhanh không cần tương tác

set -e

# Load from environment or use defaults
SERVER_HOST="${SERVER_HOST:-root@your-server-ip}"
SERVER_PATH="${SERVER_PATH:-/root/csm_server}"

echo "🚀 Quick Deploy to: $SERVER_HOST"

# Build backend
echo "📦 Building backend..."
cd backend && mvn clean package -DskipTests && cd ..

# Build frontend  
echo "🎨 Building frontend..."
cd frontend && pnpm build && cd ..

# Upload
echo "📤 Uploading..."
scp backend/target/csm_server-1.0.0.jar "$SERVER_HOST:$SERVER_PATH/"
rsync -az --delete frontend/dist/ "$SERVER_HOST:$SERVER_PATH/csm_datas/public/frontend/"

# Restart
echo "🔄 Restarting server..."
ssh "$SERVER_HOST" "cd $SERVER_PATH && ./stop.sh && sleep 3 && ./start.sh"

echo "✅ Deploy complete!"
echo "Check: ssh $SERVER_HOST 'cd $SERVER_PATH && tail -f logs/application.log'"
