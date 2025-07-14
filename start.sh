#!/bin/bash

echo "🚀 启动 Mediasoup 语音聊天室..."

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 检查yarn
if ! command -v yarn &> /dev/null; then
    echo "❌ Yarn 未安装，请先安装 Yarn"
    exit 1
fi

# 安装依赖
echo "📦 安装前端依赖..."
yarn install

echo "📦 安装服务端依赖..."
cd server && yarn install && cd ..

# 启动服务器
echo "🌐 启动 Mediasoup 服务器 (端口 3000)..."
cd server && node index.js &
SERVER_PID=$!
cd ..

# 等待服务器启动
sleep 3

# 启动前端
echo "🎨 启动前端开发服务器 (端口 5173)..."
yarn dev &
FRONTEND_PID=$!

echo ""
echo "✅ 服务启动成功！"
echo "🌐 前端地址: http://localhost:5173"
echo "🔧 后端地址: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 清理函数
cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    kill $SERVER_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ 服务已停止"
    exit 0
}

# 捕获中断信号
trap cleanup SIGINT SIGTERM

# 等待任一进程结束
wait 