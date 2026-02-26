#!/bin/bash

# Stripe Webhook 守护进程
# 每15秒检查一次 webhook 是否运行

cd /root/clawshopping

LOG_FILE="logs/stripe-webhook-daemon.log"
PID_FILE="logs/stripe-webhook-daemon.pid"

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

echo "$(date): Stripe webhook daemon started" >> "$LOG_FILE"

# 守护循环
while true; do
    # 检查 webhook 进程是否运行
    if ! pgrep -f "stripe.*listen.*forward-to" > /dev/null; then
        echo "$(date): Stripe webhook is not running, starting..." >> "$LOG_FILE"
        /root/clawshopping/scripts/stripe-webhook-start.sh >> "$LOG_FILE" 2>&1
    fi

    # 每15秒检查一次
    sleep 15
done
