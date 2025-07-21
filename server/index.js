import express from "express";
import { Server as SocketIOServer } from "socket.io";
import http from "http";
import cors from "cors";
import mediasoup from "mediasoup";
import process from "process";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// 获取当前文件的目录路径 (ES6 模块中的 __dirname 替代方案)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建 HTTP 服务器
const server = http.createServer(app);

const host = '192.168.20.146';
const serverPort = 8000;

// 配置CORS
app.use(cors({
  origin: [
    "http://localhost:5173", 
    `http://${host}:5173`, 
    `http://${host}:${serverPort}`,
    "http://localhost:3000"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));

// 托管静态文件 - 服务 dist 文件夹
app.use(express.static(path.join(__dirname, '../dist')));

const io = new SocketIOServer(server, {
  cors: {
    origin: [
      "http://localhost:5173", 
      `http://${host}:5173`, 
      `http://${host}:${serverPort}`,
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// SPA 路由支持 - 放在 Socket.IO 设置之后，避免冲突
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// 处理其他页面路由（避免与 socket.io 路径冲突）
app.get(/^\/(?!socket\.io).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Mediasoup配置
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];

const webRtcTransportOptions = {
  listenIps: [
    {
      ip: '0.0.0.0', // 监听所有网络接口
      announcedIp: host, // 只使用IP地址，不包含协议和端口
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
};

// 全局变量
let worker;
let router;
const rooms = new Map();
const peers = new Map();

// 初始化mediasoup worker
async function createWorker() {
  console.log('正在创建 Mediasoup worker...');
  worker = await mediasoup.createWorker({
    logLevel: 'debug',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ],
  });

  worker.on('died', () => {
    console.error('Mediasoup worker died, exiting in 2 seconds...');
    setTimeout(() => process.exit(1), 2000);
  });

  console.log('✅ Mediasoup worker 创建成功');
  return worker;
}

// 创建router
async function createRouter() {
  console.log('正在创建 router...');
  router = await worker.createRouter({ mediaCodecs });
  console.log('✅ Router 创建成功');
  console.log('Router RTP 能力:', router.rtpCapabilities ? '已初始化' : '未初始化');
  return router;
}

// 房间类
class Room {
  constructor(roomId) {
    this.id = roomId;
    this.peers = new Map();
  }

  addPeer(peer) {
    this.peers.set(peer.id, peer);
  }

  removePeer(peerId) {
    this.peers.delete(peerId);
  }

  getPeers() {
    return Array.from(this.peers.values());
  }

  hasPeer(peerId) {
    return this.peers.has(peerId);
  }
}

// 用户类
class Peer {
  constructor(id, socket) {
    this.id = id;
    this.socket = socket;
    this.roomId = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producer = null;
    this.consumers = new Map();
  }

  close() {
    if (this.sendTransport) {
      this.sendTransport.close();
    }
    if (this.recvTransport) {
      this.recvTransport.close();
    }
    this.consumers.clear();
  }
}

// Socket.io连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);
  
  const peer = new Peer(socket.id, socket);
  peers.set(socket.id, peer);

  // 获取router的RTP能力
  socket.on('getRouterRtpCapabilities', (callback) => {
    try {
      console.log('客户端请求 RTP 能力');
      
      if (!router) {
        console.error('Router 未初始化');
        if (typeof callback === 'function') {
          callback({ error: 'Router 未初始化' });
        }
        return;
      }
      
      if (!router.rtpCapabilities) {
        console.error('Router RTP 能力未准备就绪');
        if (typeof callback === 'function') {
          callback({ error: 'Router RTP 能力未准备就绪' });
        }
        return;
      }
      
      console.log('✅ 成功返回 RTP 能力');
      if (typeof callback === 'function') {
        callback(router.rtpCapabilities);
      }
    } catch (error) {
      console.error('获取RTP能力错误:', error);
      if (typeof callback === 'function') {
        callback({ error: error.message });
      }
    }
  });

  // 加入房间
  socket.on('joinRoom', async (data, callback) => {
    try {
      const { roomId } = data;
      peer.roomId = roomId;

      let room = rooms.get(roomId);
      if (!room) {
        room = new Room(roomId);
        rooms.set(roomId, room);
      }

      room.addPeer(peer);
      socket.join(roomId);

      console.log(`用户 ${socket.id} 加入房间 ${roomId}`);

      // 通知房间内其他用户
      socket.to(roomId).emit('userJoined', {
        peerId: socket.id,
        peers: room.getPeers().map(p => ({ id: p.id }))
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          peers: room.getPeers().filter(p => p.id !== socket.id).map(p => ({ id: p.id }))
        });
      }
    } catch (error) {
      console.error('加入房间错误:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // 创建WebRTC传输
  socket.on('createWebRtcTransport', async (data, callback) => {
    try {
      const { direction } = data; // 'send' or 'recv'
      
      const transport = await router.createWebRtcTransport({
        ...webRtcTransportOptions,
        appData: { peerId: socket.id, direction }
      });

      if (direction === 'send') {
        peer.sendTransport = transport;
      } else {
        peer.recvTransport = transport;
      }

      const transportData = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
      };

      // 监听传输连接状态
      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
          transport.close();
        }
      });

      if (typeof callback === 'function') {
        callback(transportData);
      }

    } catch (error) {
      console.error('创建传输错误:', error);
      if (typeof callback === 'function') {
        callback({ error: error.message });
      }
    }
  });

  // 连接传输
  socket.on('connectWebRtcTransport', async (data, callback) => {
    try {
      const { transportId, dtlsParameters } = data;
      
      const transport = peer.sendTransport?.id === transportId ? 
        peer.sendTransport : peer.recvTransport;
      
      if (!transport) {
        throw new Error('传输未找到');
      }

      await transport.connect({ dtlsParameters });
      
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error) {
      console.error('连接传输错误:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // 生产音频
  socket.on('produce', async (data, callback) => {
    try {
      const { kind, rtpParameters } = data;
      
      if (!peer.sendTransport) {
        throw new Error('发送传输未创建');
      }

      const producer = await peer.sendTransport.produce({
        kind,
        rtpParameters,
      });

      peer.producer = producer;

      producer.on('transportclose', () => {
        console.log('Producer关闭 - 传输关闭');
        producer.close();
      });

      if (typeof callback === 'function') {
        callback({ id: producer.id });
      }

      // 通知房间内其他用户有新的生产者
      if (peer.roomId) {
        socket.to(peer.roomId).emit('newProducer', {
          peerId: socket.id,
          producerId: producer.id,
          kind: producer.kind
        });
      }

    } catch (error) {
      console.error('生产错误:', error);
      if (typeof callback === 'function') {
        callback({ error: error.message });
      }
    }
  });

  // 消费音频
  socket.on('consume', async (data, callback) => {
    try {
      const { producerId, rtpCapabilities } = data;
      
      if (!peer.recvTransport) {
        throw new Error('接收传输未创建');
      }

      if (!router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('无法消费此生产者');
      }

      const consumer = await peer.recvTransport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      peer.consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        console.log('Consumer关闭 - 传输关闭');
        consumer.close();
      });

      consumer.on('producerclose', () => {
        console.log('Consumer关闭 - 生产者关闭');
        peer.consumers.delete(consumer.id);
        socket.emit('consumerClosed', { consumerId: consumer.id });
        consumer.close();
      });

      const consumerData = {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };

      if (typeof callback === 'function') {
        callback(consumerData);
      }

    } catch (error) {
      console.error('消费错误:', error);
      if (typeof callback === 'function') {
        callback({ error: error.message });
      }
    }
  });

  // 恢复消费者
  socket.on('resumeConsumer', async (data, callback) => {
    try {
      const { consumerId } = data;
      const consumer = peer.consumers.get(consumerId);
      
      if (!consumer) {
        throw new Error('消费者未找到');
      }

      await consumer.resume();
      
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error) {
      console.error('恢复消费者错误:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // 获取生产者列表
  socket.on('getProducers', (callback) => {
    try {
      console.log('客户端请求生产者列表, 用户:', socket.id, '房间:', peer.roomId);
      
      if (!peer.roomId) {
        console.log('用户未在房间中，返回空列表');
        if (typeof callback === 'function') {
          callback([]);
        }
        return;
      }

      const room = rooms.get(peer.roomId);
      if (!room) {
        console.log('房间不存在，返回空列表');
        if (typeof callback === 'function') {
          callback([]);
        }
        return;
      }

      const producers = [];
      room.getPeers().forEach(roomPeer => {
        if (roomPeer.id !== socket.id && roomPeer.producer) {
          producers.push({
            peerId: roomPeer.id,
            producerId: roomPeer.producer.id,
            kind: roomPeer.producer.kind
          });
        }
      });

      console.log('✅ 返回生产者列表:', producers.length, '个生产者');
      if (typeof callback === 'function') {
        callback(producers);
      }
    } catch (error) {
      console.error('获取生产者错误:', error);
      if (typeof callback === 'function') {
        callback([]);
      }
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
    
    if (peer.roomId) {
      const room = rooms.get(peer.roomId);
      if (room) {
        room.removePeer(socket.id);
        
        // 通知房间内其他用户
        socket.to(peer.roomId).emit('userLeft', { peerId: socket.id });
        
        // 如果房间为空，删除房间
        if (room.getPeers().length === 0) {
          rooms.delete(peer.roomId);
        }
      }
    }

    peer.close();
    peers.delete(socket.id);
  });
});

// 启动服务器
async function start() {
  try {
    await createWorker();
    await createRouter();
    
    server.listen(serverPort, '0.0.0.0', () => {
      console.log(`Mediasoup HTTP 语音聊天服务器运行在端口 ${serverPort} (所有网络接口)`);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
}

start();

