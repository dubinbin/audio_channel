# Mediasoup 语音聊天室

基于 Mediasoup 的实时语音聊天应用，支持多人同时语音通话。

## 功能特点

- 🎤 实时语音通话
- 🏠 房间系统（支持多个房间）
- 👥 多人同时在线
- 🔊 自动音频播放
- 📱 响应式设计
- 🌐 WebRTC 技术

## 技术栈

### 后端
- Node.js
- Express
- Socket.io
- Mediasoup
- CORS

### 前端
- React
- Vite
- Socket.io-client
- Mediasoup-client
- CSS3

## 快速开始

### 方法一：使用启动脚本（推荐）

```bash
# 给脚本执行权限
chmod +x start.sh

# 启动服务
./start.sh
```

### 方法二：手动启动

1. **安装依赖**
```bash
# 安装前端依赖
yarn install

# 安装服务端依赖
cd server && yarn install
```

2. **启动服务端**
```bash
cd server
node index.js
```

3. **启动前端（新终端窗口）**
```bash
yarn dev
```

## 访问应用

- 前端界面：http://localhost:5173
- 后端服务：http://localhost:3000

## 使用说明

1. **连接服务器**
   - 打开应用，点击"连接到服务器"
   - 等待连接成功

2. **加入房间**
   - 输入房间ID（任意字符串）
   - 点击"加入房间"

3. **开始语音**
   - 点击"🎤 开始说话"开启麦克风
   - 浏览器会请求麦克风权限，请允许
   - 其他用户的音频会自动播放

4. **房间功能**
   - 查看房间成员列表
   - 可以随时开启/关闭麦克风
   - 点击"离开房间"退出

## 系统要求

- Node.js >= 20.0.0
- 现代浏览器（支持WebRTC）
- 麦克风设备
- 网络连接

## 浏览器兼容性

- ✅ Chrome 80+
- ✅ Firefox 80+
- ✅ Safari 14+
- ✅ Edge 80+

## 项目结构

```
my-mediasoup/
├── src/                    # 前端源码
│   ├── components/         # React组件
│   │   ├── VoiceChat.jsx  # 主语音聊天组件
│   │   └── VoiceChat.css  # 样式文件
│   ├── utils/             # 工具类
│   │   └── MediasoupClient.js  # Mediasoup客户端封装
│   ├── App.jsx            # 主应用组件
│   └── main.jsx           # 入口文件
├── server/                # 后端服务
│   ├── index.js           # Mediasoup服务器
│   └── package.json       # 服务端依赖
├── package.json           # 前端依赖
├── start.sh               # 启动脚本
└── README.md              # 说明文档
```

## 开发说明

### 前端开发
- 基于 React 18 + Vite
- 使用 mediasoup-client 处理 WebRTC
- Socket.io 处理实时通信

### 后端开发
- Express 提供基础服务
- Socket.io 处理WebSocket连接
- Mediasoup 处理媒体路由

## 故障排除

### 常见问题

1. **麦克风权限被拒绝**
   - 检查浏览器设置，允许网站访问麦克风
   - 确保使用 HTTPS 或 localhost

2. **无法听到其他用户声音**
   - 检查扬声器/耳机音量
   - 确保音频元素自动播放被允许

3. **连接失败**
   - 检查服务器是否正常运行
   - 确认端口 3000 和 5173 未被占用

4. **音频质量问题**
   - 检查网络连接稳定性
   - 确保设备音频驱动正常

### 日志调试

服务端和前端都有详细的控制台日志，可以帮助诊断问题。

## License

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
