#!/bin/bash

# Stripe Webhook 监控脚本
# 用于 crontab 定时检查并重启挂掉的 webhook

cd /root/clawshopping

LOG_FILE="logs/stripe-webhook-monitor.log"

# 创建日志目录
mkdir -p logs

# 检查进程是否运行
if pgrep -f "stripe.*listen.*forward-to" > /dev/null; then
    echo "$(date): Stripe webhook is running (PID: $(pgrep -f 'stripe.*listen.*forward-to'))" >> "$LOG_FILE"
else
    echo "$(date): Stripe webhook is not running, starting..." >> "$LOG_FILE"
    /root/clawshopping/scripts/stripe-webhook-start.sh >> "$LOG_FILE" 2>&1
fi
