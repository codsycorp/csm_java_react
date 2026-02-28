#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

JAR_PREFIX="csm_server-"
APP_PORT=9999
SOCKET_PORT=15301
DB_PATH="csm_datas/database"

log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }

# Function to gracefully shutdown Java process
graceful_shutdown() {
    local pid=$1
    local timeout=15
    
    # Try SIGTERM first (graceful)
    log "Sending SIGTERM to process $pid..."
    kill -15 $pid 2>/dev/null || true
    
    # Wait for graceful shutdown
    for ((i=1; i<=timeout; i++)); do
        if ! kill -0 $pid 2>/dev/null; then
            log "✓ Process stopped gracefully after ${i}s"
            return 0
        fi
        sleep 1
    done
    
    # Force kill if timeout
    log "Graceful shutdown timeout, force killing..."
    kill -9 $pid 2>/dev/null || true
    sleep 2
    return 1
}

log "Stopping server and releasing ports..."

# Kill Java process running the jar
jarCount=$(ls ${JAR_PREFIX}*.jar 2>/dev/null | wc -l || echo 0)
if [ "$jarCount" -gt 1 ]; then
    log "WARNING: Multiple jar files found:"
    ls ${JAR_PREFIX}*.jar
    exit 1
fi

jarName=$(ls ${JAR_PREFIX}*.jar 2>/dev/null || true)
if [ -z "$jarName" ]; then
    log "No jar file found, checking for running processes..."
else
    log "JAR file: $jarName"
fi

pid=$(pgrep -f "java .*${JAR_PREFIX}" || true)
log "Java process PID: $pid"
if [ -n "$pid" ]; then
    graceful_shutdown $pid
else
    log "No running server process found"
fi

# Kill any remaining processes on Socket.IO port
pid_socket=$(lsof -ti:$SOCKET_PORT 2>/dev/null || true)
if [ -n "$pid_socket" ]; then
    log "Killing remaining process on Socket.IO port $SOCKET_PORT (PID: $pid_socket)"
    kill -9 $pid_socket 2>/dev/null || true
    echo "✓ Killed process using port $SOCKET_PORT: $pid_socket"
fi

# Wait for ports to fully release
log "Waiting for ports to fully release..."
for ((i=1; i<=10; i++)); do
    if ! lsof -ti:$APP_PORT >/dev/null 2>&1 && ! lsof -ti:$SOCKET_PORT >/dev/null 2>&1; then
        log "✓ All ports released (attempt $i/10)"
        break
    fi
    if [ $i -lt 10 ]; then
        log "Ports still in use, waiting... (attempt $i/10)"
        sleep 1
    fi
done

# Cleanup RocksDB lock files
log "Cleaning up RocksDB lock files..."
if [ -d "$DB_PATH" ]; then
    find "$DB_PATH" -name "LOCK" -type f -exec rm -f {} \; 2>/dev/null || true
    find "$DB_PATH" -name "*.lock" -type f -exec rm -f {} \; 2>/dev/null || true
    log "✓ RocksDB lock files cleaned"
else
    log "Database path not found: $DB_PATH"
fi

# Cleanup temp files
log "Cleaning up temp files..."
rm -f /tmp/librocksdbjni*.so 2>/dev/null || true
log "✓ Temp files cleaned"

log "✓ Server stopped successfully"
exit 0