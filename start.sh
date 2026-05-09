#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

JAR_PREFIX="csm_server-"
APP_PORT=9999
SOCKET_PORT=15301
DB_PATH="csm_datas/database"
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/console.log"
GC_LOG="$LOG_DIR/gc.log"
MAINTENANCE_PID_FILE="$LOG_DIR/log-maintenance.pid"
MAX_LOG_SIZE=$((100 * 1024 * 1024)) # 100MB

# Log retention/cap (can override via env)
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-7}"
LOG_DIR_MAX_SIZE_MB="${LOG_DIR_MAX_SIZE_MB:-5120}" # 5GB
LOG_DIR_MAX_SIZE_BYTES=$((LOG_DIR_MAX_SIZE_MB * 1024 * 1024))
APP_LOG_MAX_FILES="${APP_LOG_MAX_FILES:-400}"

# Spring Boot rolling policy caps (for logs/application.log)
APP_LOG_MAX_FILE_SIZE="${APP_LOG_MAX_FILE_SIZE:-100MB}"
APP_LOG_MAX_HISTORY="${APP_LOG_MAX_HISTORY:-14}"
APP_LOG_TOTAL_SIZE_CAP="${APP_LOG_TOTAL_SIZE_CAP:-5GB}"
APP_LOG_CLEAN_ON_START="${APP_LOG_CLEAN_ON_START:-true}"

# 🚀 JVM MEMORY CONFIGURATION (Adjust based on available RAM)
# - 1g for systems with 2GB RAM
# - 2g for systems with 4-6GB RAM (RECOMMENDED FOR YOUR SYSTEM)
# - 4g for systems with 8GB+ RAM
# - 8g for systems with 16GB+ RAM
# 
# 💡 Auto size heap when HEAP_SIZE is not set
detect_total_mem_mb() {
    local mem_kb
    if [ -r /proc/meminfo ]; then
        mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
        echo $((mem_kb / 1024))
        return
    fi
    if command -v sysctl >/dev/null 2>&1; then
        local mem_bytes
        mem_bytes=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
        if [ "$mem_bytes" -gt 0 ]; then
            echo $((mem_bytes / 1024 / 1024))
            return
        fi
    fi
    echo 0
}

if [ -z "${HEAP_SIZE:-}" ]; then
    total_mem_mb=$(detect_total_mem_mb)
    if [ "$total_mem_mb" -gt 0 ]; then
        if [ "$total_mem_mb" -lt 3500 ]; then
            HEAP_SIZE="1536m"
        elif [ "$total_mem_mb" -lt 7000 ]; then
            HEAP_SIZE="3g"
        elif [ "$total_mem_mb" -lt 12000 ]; then
            HEAP_SIZE="4g"
        else
            HEAP_SIZE="6g"
        fi
    else
        HEAP_SIZE="2g"
    fi
fi

# Init heap smaller than max to reduce RSS pressure on low-RAM systems
HEAP_INIT="${HEAP_INIT:-512m}"
DIRECT_MEMORY_SIZE="${DIRECT_MEMORY_SIZE:-256m}"
TOMCAT_MAX_THREADS="${TOMCAT_MAX_THREADS:-32}"
TOMCAT_MAX_CONNECTIONS="${TOMCAT_MAX_CONNECTIONS:-180}"
TOMCAT_ACCEPT_COUNT="${TOMCAT_ACCEPT_COUNT:-60}"
ENABLE_ALWAYS_PRETOUCH="${ENABLE_ALWAYS_PRETOUCH:-false}"

log() {
    local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $*"
    mkdir -p "$LOG_DIR" 2>/dev/null || true
    echo "$msg"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

start_log_maintenance_worker() {
    mkdir -p "$LOG_DIR"

    if [ -f "$MAINTENANCE_PID_FILE" ]; then
        local old_pid
        old_pid=$(cat "$MAINTENANCE_PID_FILE" 2>/dev/null || true)
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            log "✓ Log maintenance worker already running (PID: $old_pid)"
            return 0
        fi
        rm -f "$MAINTENANCE_PID_FILE" 2>/dev/null || true
    fi

    (
        trap 'rm -f "$MAINTENANCE_PID_FILE" 2>/dev/null || true; exit 0' INT TERM EXIT
        echo $$ > "$MAINTENANCE_PID_FILE"
        while true; do
            sleep 3600
            rotate_logs
            cleanup_logs_dir

            if [ -d "$LOG_DIR" ]; then
                find "$LOG_DIR" -name "gc.log*" -mtime +"$LOG_RETENTION_DAYS" -delete 2>/dev/null || true
                find "$LOG_DIR" -name "hs_err_pid*.log" -mtime +"$LOG_RETENTION_DAYS" -delete 2>/dev/null || true
            fi
        done
    ) >/dev/null 2>&1 &

    local worker_pid=$!
    echo "$worker_pid" > "$MAINTENANCE_PID_FILE"
    log "✓ Started log maintenance worker (PID: $worker_pid)"
}

rotate_logs() {
    mkdir -p "$LOG_DIR"

    if [ -f "$LOG_FILE" ]; then
        local size
        size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$size" -gt "$MAX_LOG_SIZE" ]; then
            local rotated_file="${LOG_FILE}.$(date +%Y%m%d_%H%M%S)"
            log "Rotating log file (size: $size bytes) -> $rotated_file"
            if ! mv "$LOG_FILE" "$rotated_file" 2>&1; then
                log "⚠ ERROR: Failed to rotate log file"
                return 1
            fi
            if gzip -f "$rotated_file" 2>&1; then
                log "✓ Compressed $rotated_file.gz"
            else
                log "⚠ WARNING: Failed to compress $rotated_file"
            fi
        fi
    fi

    # Delete log files older than 7 days
    find "$LOG_DIR" -maxdepth 1 -name "console.log.*" -mtime +"$LOG_RETENTION_DAYS" -delete 2>/dev/null || true

    # Keep only last 10 log files
    local log_count
    log_count=$(ls -1 "$LOG_DIR"/console.log.* 2>/dev/null | wc -l || true)
    if [ "$log_count" -gt 10 ]; then
        log "Cleaning old logs (keeping last 10, deleting $((log_count - 10)))"
        ls -1 "$LOG_DIR"/console.log.* 2>/dev/null | sort | head -n -10 | xargs rm -f 2>/dev/null || true
    fi

    # Ensure console.log exists and is writable
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE" 2>&1 || log "⚠ WARNING: Failed to create $LOG_FILE"
    fi
}

cleanup_logs_dir() {
    mkdir -p "$LOG_DIR"

    # Time-based cleanup for large/rotated logs
    find "$LOG_DIR" -maxdepth 1 -type f \
        \( -name "application.log.*" -o -name "console.log.*" -o -name "gc.log*" -o -name "hs_err_pid*.log" -o -name "*.hprof" \) \
        -mtime +"$LOG_RETENTION_DAYS" -delete 2>/dev/null || true

    # Keep a bounded number of rotated app logs
    local app_log_count
    app_log_count=$(ls -1 "$LOG_DIR"/application.log.* 2>/dev/null | wc -l || true)
    if [ "$app_log_count" -gt "$APP_LOG_MAX_FILES" ]; then
        local delete_count=$((app_log_count - APP_LOG_MAX_FILES))
        log "Cleaning old application logs (keeping $APP_LOG_MAX_FILES, deleting $delete_count)"
        ls -1 "$LOG_DIR"/application.log.* 2>/dev/null | sort | head -n "$delete_count" | xargs rm -f 2>/dev/null || true
    fi

    # Size-cap cleanup: delete oldest rotated logs until under cap
    local current_size
    current_size=$(du -sk "$LOG_DIR" 2>/dev/null | awk '{print $1 * 1024}' || echo 0)
    while [ "$current_size" -gt "$LOG_DIR_MAX_SIZE_BYTES" ]; do
        local oldest_file
        oldest_file=$(ls -1tr \
            "$LOG_DIR"/application.log.* \
            "$LOG_DIR"/console.log.* \
            "$LOG_DIR"/gc.log* \
            "$LOG_DIR"/hs_err_pid*.log \
            "$LOG_DIR"/*.hprof 2>/dev/null | head -n 1 || true)

        if [ -z "$oldest_file" ]; then
            break
        fi

        log "Deleting old log to enforce size cap: $oldest_file"
        rm -f "$oldest_file" 2>/dev/null || true
        current_size=$(du -sk "$LOG_DIR" 2>/dev/null | awk '{print $1 * 1024}' || echo 0)
    done
}

kill_by_port() {
    local port="$1"
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        local pids
        pids=$(lsof -ti:$port 2>/dev/null || true)
        
        if [ -z "$pids" ]; then
            log "✓ Port $port is now free"
            return 0
        fi
        
        if [ $attempt -eq 0 ]; then
            log "Terminating processes on port $port (PID: $pids)"
            kill $pids 2>/dev/null || true
        else
            log "Force killing processes on port $port (attempt $((attempt + 1)))"
            kill -9 $pids 2>/dev/null || true
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log "⚠ WARNING: Port $port still in use after $max_attempts attempts"
    return 1
}

kill_existing() {
    local pattern="$1"
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        local pids
        pids=$(pgrep -f "$pattern" || true)
        
        if [ -z "$pids" ]; then
            log "✓ No processes matching '$pattern'"
            return 0
        fi
        
        if [ $attempt -eq 0 ]; then
            log "Terminating processes matching '$pattern' (PID: $pids)"
            kill $pids 2>/dev/null || true
        else
            log "Force killing processes matching '$pattern' (attempt $((attempt + 1)))"
            kill -9 $pids 2>/dev/null || true
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log "⚠ WARNING: Processes matching '$pattern' still exist after $max_attempts attempts"
    return 1
}

rotate_logs
cleanup_logs_dir

# Kill by port with retry verification
if ! kill_by_port "$SOCKET_PORT"; then
    log "ERROR: Failed to release socket port $SOCKET_PORT"
    exit 1
fi

if ! kill_by_port "$APP_PORT"; then
    log "ERROR: Failed to release app port $APP_PORT"
    exit 1
fi

# Kill existing Java processes
if ! kill_existing "java .*${JAR_PREFIX}"; then
    log "ERROR: Failed to kill existing Java processes"
    exit 1
fi

# Wait extra time for TIME_WAIT state to clear (ports in CLOSE_WAIT/TIME_WAIT need time)
log "Waiting for ports to fully release from TIME_WAIT state..."
sleep 8

# Cleanup RocksDB lock files before starting
log "Cleaning up RocksDB lock files..."
if [ -d "$DB_PATH" ]; then
    find "$DB_PATH" -name "LOCK" -type f -exec rm -f {} \; 2>/dev/null || true
    find "$DB_PATH" -name "*.lock" -type f -exec rm -f {} \; 2>/dev/null || true
    log "✓ RocksDB lock files cleaned"
else
    log "⚠ WARNING: Database path not found: $DB_PATH"
fi

# Cleanup temp RocksDB native libraries
log "Cleaning up temp files..."
rm -f /tmp/librocksdbjni*.so 2>/dev/null || true

# Verify ports are actually free before proceeding
max_verify_attempts=10
for ((i=1; i<=max_verify_attempts; i++)); do
    if ! lsof -ti:$APP_PORT >/dev/null 2>&1 && ! lsof -ti:$SOCKET_PORT >/dev/null 2>&1; then
        log "✓ Ports verified free ($i/$max_verify_attempts attempts)"
        break
    fi
    if [ $i -lt $max_verify_attempts ]; then
        log "Ports still in use, waiting... (attempt $i/$max_verify_attempts)"
        # Force kill again if still occupied
        kill_by_port "$APP_PORT" || true
        kill_by_port "$SOCKET_PORT" || true
        sleep 3
    else
        log "ERROR: Ports still in use after $max_verify_attempts attempts. Aborting."
        exit 1
    fi
done

jarCount=$(ls ${JAR_PREFIX}*.jar 2>/dev/null | wc -l | tr -d ' ' || true)
if [ "$jarCount" -gt 1 ]; then
    log "ERROR: Multiple jar files found:"
    ls ${JAR_PREFIX}*.jar
    exit 1
fi

jarName=$(ls ${JAR_PREFIX}*.jar 2>/dev/null || true)
if [ -z "$jarName" ]; then
    log "ERROR: No jar file found"
    exit 1
fi

log "Starting $jarName on port $APP_PORT with performance optimizations..."

# Load environment variables from config.env (API keys, secrets)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/config.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$SCRIPT_DIR/config.env"
    set +a
    log "Loaded config.env"
    log "  GEMINI_PRO_API_KEY : ${GEMINI_PRO_API_KEY:+(set, ${#GEMINI_PRO_API_KEY} chars)}"
    log "  GEMINI_API_KEY     : ${GEMINI_API_KEY:+(set, ${#GEMINI_API_KEY} chars)}"
    log "  GOOGLE_AI_GEMINI_API_KEY: ${GOOGLE_AI_GEMINI_API_KEY:+(set, ${#GOOGLE_AI_GEMINI_API_KEY} chars)}"
else
    log "⚠ WARNING: config.env not found at $SCRIPT_DIR/config.env — Gemini API keys may be missing"
fi

# Create logs directory for GC and error logs
mkdir -p "$LOG_DIR"

PRETOUCH_FLAG=""
if [ "$ENABLE_ALWAYS_PRETOUCH" = "true" ]; then
    PRETOUCH_FLAG="-XX:+AlwaysPreTouch"
fi

# 🔥 OPTIMIZED JVM SETTINGS FOR HIGH CONCURRENCY & LOW LATENCY
# G1GC: Generational Garbage Collector for low pause times (<200ms)
# Memory: Configurable heap with proper metaspace
# Concurrency: String deduplication, compressed oops, tiered compilation
# Monitoring: GC and error logging, OOM heap dump
nohup java \
    -Xms$HEAP_INIT -Xmx$HEAP_SIZE \
    -XX:MetaspaceSize=128m \
    -XX:MaxMetaspaceSize=256m \
    -XX:MaxDirectMemorySize=$DIRECT_MEMORY_SIZE \
    -XX:+UseG1GC \
    -XX:MaxGCPauseMillis=200 \
    -XX:ParallelGCThreads=2 \
    -XX:ConcGCThreads=1 \
    -XX:InitiatingHeapOccupancyPercent=45 \
    -XX:G1HeapRegionSize=8m \
    -XX:G1ReservePercent=10 \
    -XX:+UseStringDeduplication \
    -XX:+UseCompressedOops \
    -XX:+UseCompressedClassPointers \
    -XX:+TieredCompilation \
    -XX:+DisableExplicitGC \
    $PRETOUCH_FLAG \
    -XX:+HeapDumpOnOutOfMemoryError \
    -XX:HeapDumpPath="$LOG_DIR/heapdump.hprof" \
    -XX:ErrorFile="$LOG_DIR/hs_err_pid%p.log" \
    -Djava.awt.headless=true \
    -Djava.net.preferIPv4Stack=true \
    -Dsun.net.inetaddr.ttl=60 \
    -Dfile.encoding=UTF-8 \
    -Dspring.backgroundpreinitializer.ignore=false \
    -Dspring.jmx.enabled=false \
    -Dserver.tomcat.util.net.NioEndpoint.ENABLE_PAUSE_RESUME=false \
    -Djdk.net.useFastTcpLoopback=true \
    -Xlog:gc*:file="$GC_LOG":time,uptime,level,tags \
    -Dloader.path="/root/la_server/jlib/" \
    -jar "$jarName" \
    --spring.profiles.active=prod \
    --server.port=$APP_PORT \
    --logging.file.name="$LOG_DIR/application.log" \
    --server.tomcat.threads.max="$TOMCAT_MAX_THREADS" \
    --server.tomcat.max-connections="$TOMCAT_MAX_CONNECTIONS" \
    --server.tomcat.accept-count="$TOMCAT_ACCEPT_COUNT" \
    --logging.logback.rollingpolicy.file-name-pattern="$LOG_DIR/application.log.%d{yyyy-MM-dd}.%i.gz" \
    --logging.logback.rollingpolicy.max-file-size="$APP_LOG_MAX_FILE_SIZE" \
    --logging.logback.rollingpolicy.max-history="$APP_LOG_MAX_HISTORY" \
    --logging.logback.rollingpolicy.total-size-cap="$APP_LOG_TOTAL_SIZE_CAP" \
    --logging.logback.rollingpolicy.clean-history-on-start="$APP_LOG_CLEAN_ON_START" \
    >> "$LOG_DIR/console.log" 2>&1 &
sleep 3

newPid=$(pgrep -f "java .*${JAR_PREFIX}" || true)
if [ -n "$newPid" ]; then
    log "✓ Started (PID: $newPid)"
    log "🎯 Server is running healthy"
    
    # Health check with monitoring endpoint
    sleep 2
    if curl -s http://localhost:9999/api/monitoring/health 2>/dev/null | grep -q '"status":"UP"'; then
        log "✅ Health check PASSED - Server ready to serve requests"
        log "📊 Logs: tail -f $LOG_DIR/application.log"
        log "📈 GC Logs: tail -f $GC_LOG"
    else
        log "⚠ Health check pending (server still starting up)"
    fi
else
    log "✗ Failed to start"
    if [ -f "$LOG_DIR/console.log" ]; then
        log "Recent errors:"
        tail -120 "$LOG_DIR/console.log"
        local_root_cause=$(grep -n "Caused by:\|InvalidConfigDataPropertyException\|Application run failed" "$LOG_DIR/console.log" | tail -n 1 | cut -d: -f1 || true)
        if [ -n "$local_root_cause" ]; then
            log "Root cause excerpt:"
            sed -n "${local_root_cause},$((local_root_cause + 25))p" "$LOG_DIR/console.log"
        fi
    fi
    exit 1
fi

# Start at most one background hourly log maintenance worker
start_log_maintenance_worker
