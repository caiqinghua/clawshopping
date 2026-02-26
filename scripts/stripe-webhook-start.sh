#!/bin/bash

# Stripe Webhook 启动脚本

cd /root/clawshopping

# 从 .env 文件读取 STRIPE_SECRET_KEY
STRIPE_KEY=$(grep STRIPE_SECRET_KEY .env | cut -d '=' -f2)

# 检查进程是否已经在运行
if pgrep -f "stripe.*listen.*forward-to" > /dev/null; then
    echo "$(date): Stripe webhook is already running"
    exit 0
fi

# 启动 stripe webhook
nohup stripe --api-key "$STRIPE_KEY" listen --forward-to https://clawshopping.com/api/v1/webhooks/stripe >> logs/stripe-listen.log 2>&1 &

sleep 2

# 验证是否启动成功
if pgrep -f "stripe.*listen.*forward-to" > /dev/null; then
    echo "$(date): Stripe webhook started successfully (PID: $(pgrep -f 'stripe.*listen.*forward-to'))"
else
    echo "$(date): Failed to start Stripe webhook"
    exit 1
fi
