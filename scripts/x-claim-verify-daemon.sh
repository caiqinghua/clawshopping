#!/bin/bash

# X Claim 验证守护进程
# 每60秒检查一次待验证的 claims

cd /root/clawshopping

LOG_FILE="logs/x-claim-verify-daemon.log"
PID_FILE="logs/x-claim-verify-daemon.pid"

API_URL="http://localhost:3000/api/internal/cron/claims/verify-x"
CRON_SECRET="3db9691f15e2aff78ccc796aba2f0fc3793b52ca151ce72775eb6f3d97231f37"
CHECK_INTERVAL=60

# 创建日志目录
mkdir -p logs

# 检查是否已经有守护进程在运行
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "$(date): Daemon is already running (PID: $OLD_PID)"
        exit 1
    else
        # 清理旧的 PID 文件
        rm -f "$PID_FILE"
    fi
fi

# 保存当前进程 PID
echo $$ > "$PID_FILE"

echo "$(date): X claim verify daemon started" >> "$LOG_FILE"

# 清理函数
cleanup() {
    echo "$(date): X claim verify daemon stopped" >> "$LOG_FILE"
    rm -f "$PID_FILE"
    exit 0
}

# 捕获退出信号
trap cleanup SIGTERM SIGINT

# 主循环
while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    RESPONSE=$(curl -s -X POST "$API_URL" \
        -H "Authorization: Bearer $CRON_SECRET" \
        -H "Content-Type: application/json")

    echo "[$TIMESTAMP] $RESPONSE" >> "$LOG_FILE"

    sleep $CHECK_INTERVAL
done
