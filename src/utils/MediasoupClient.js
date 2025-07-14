import { Device } from 'mediasoup-client';
import io from 'socket.io-client';

class MediasoupClient {
  constructor() {
    this.socket = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producer = null;
    this.consumers = new Map();
    this.isConnected = false;
    this.roomId = null;
    this.onUserJoined = null;
    this.onUserLeft = null;
    this.onNewAudio = null;
  }

  // 连接到服务器
  async connect(serverUrl = 'https://192.168.20.151:8000') {
    try {
      console.log('🔗 正在连接到服务器:', serverUrl);
      
      // 如果已经有连接，先断开
      if (this.socket) {
        console.log('🧹 清理现有连接...');
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        forceNew: true // 强制创建新连接
      });

      return new Promise((resolve, reject) => {
        this.socket.on('connect', () => {
          console.log('✅ Socket.io 连接成功, ID:', this.socket.id);
          this.isConnected = true;
          this.setupSocketEvents();
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ Socket.io 连接错误:', error);
          reject(error);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('🔌 与服务器断开连接, 原因:', reason);
          this.isConnected = false;
        });
      });
    } catch (error) {
      console.error('❌ 连接失败:', error);
      throw error;
    }
  }

  // 设置Socket事件监听
  setupSocketEvents() {
    this.socket.on('userJoined', (data) => {
      console.log('用户加入:', data);
      if (this.onUserJoined) {
        this.onUserJoined(data);
      }
    });

    this.socket.on('userLeft', (data) => {
      console.log('用户离开:', data);
      if (this.onUserLeft) {
        this.onUserLeft(data);
      }
    });

    this.socket.on('newProducer', async (data) => {
      console.log('新的音频生产者:', data);
      await this.consumeAudio(data.producerId);
    });

    this.socket.on('consumerClosed', (data) => {
      console.log('消费者关闭:', data);
      const consumer = this.consumers.get(data.consumerId);
      if (consumer) {
        consumer.close();
        this.consumers.delete(data.consumerId);
      }
    });
  }

  // 初始化设备
  async initializeDevice() {
    try {
      this.device = new Device();
      
      // 获取路由器RTP能力
      const routerRtpCapabilities = await this.socketRequest('getRouterRtpCapabilities');
      
      // 加载设备
      await this.device.load({ routerRtpCapabilities });
      
      console.log('设备初始化成功');
      return true;
    } catch (error) {
      console.error('设备初始化失败:', error);
      throw error;
    }
  }

  // 加入房间
  async joinRoom(roomId) {
    try {
      this.roomId = roomId;
      const result = await this.socketRequest('joinRoom', { roomId });
      
      if (result.success) {
        console.log('成功加入房间:', roomId);
        
        // 创建传输
        await this.createSendTransport();
        await this.createRecvTransport();
        
        // 获取现有的生产者并开始消费
        const producers = await this.socketRequest('getProducers');
        for (const producer of producers) {
          await this.consumeAudio(producer.producerId);
        }
        
        return result;
      } else {
        throw new Error(result.error || '加入房间失败');
      }
    } catch (error) {
      console.error('加入房间错误:', error);
      throw error;
    }
  }

  // 创建发送传输
  async createSendTransport() {
    try {
      const transportOptions = await this.socketRequest('createWebRtcTransport', {
        direction: 'send'
      });

      this.sendTransport = this.device.createSendTransport(transportOptions);

      this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socketRequest('connectWebRtcTransport', {
            transportId: this.sendTransport.id,
            dtlsParameters
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const result = await this.socketRequest('produce', {
            kind,
            rtpParameters
          });
          callback({ id: result.id });
        } catch (error) {
          errback(error);
        }
      });

      console.log('发送传输创建成功');
    } catch (error) {
      console.error('创建发送传输失败:', error);
      throw error;
    }
  }

  // 创建接收传输
  async createRecvTransport() {
    try {
      const transportOptions = await this.socketRequest('createWebRtcTransport', {
        direction: 'recv'
      });

      this.recvTransport = this.device.createRecvTransport(transportOptions);

      this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socketRequest('connectWebRtcTransport', {
            transportId: this.recvTransport.id,
            dtlsParameters
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      console.log('接收传输创建成功');
    } catch (error) {
      console.error('创建接收传输失败:', error);
      throw error;
    }
  }

  // 开始发送音频
  async produceAudio() {
    try {
      if (!this.sendTransport) {
        throw new Error('发送传输未创建');
      }

      // 获取用户音频流
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        },
        video: false
      });

      const audioTrack = stream.getAudioTracks()[0];
      
      // 创建生产者
      this.producer = await this.sendTransport.produce({
        track: audioTrack
      });

      console.log('开始发送音频');
      return this.producer;
    } catch (error) {
      console.error('发送音频失败:', error);
      throw error;
    }
  }

  // 停止发送音频
  stopProducing() {
    if (this.producer) {
      this.producer.close();
      this.producer = null;
      console.log('停止发送音频');
    }
  }

  // 消费音频
  async consumeAudio(producerId) {
    try {
      if (!this.recvTransport) {
        throw new Error('接收传输未创建');
      }

      const consumerData = await this.socketRequest('consume', {
        producerId,
        rtpCapabilities: this.device.rtpCapabilities
      });

      const consumer = await this.recvTransport.consume({
        id: consumerData.id,
        producerId: consumerData.producerId,
        kind: consumerData.kind,
        rtpParameters: consumerData.rtpParameters
      });

      this.consumers.set(consumer.id, consumer);

      // 恢复消费者
      await this.socketRequest('resumeConsumer', {
        consumerId: consumer.id
      });

      // 创建音频元素播放
      const audioElement = document.createElement('audio');
      audioElement.srcObject = new MediaStream([consumer.track]);
      audioElement.autoplay = true;
      audioElement.playsInline = true;
      document.body.appendChild(audioElement);

      if (this.onNewAudio) {
        this.onNewAudio(audioElement, consumer);
      }

      console.log('开始消费音频:', consumer.id);
      return consumer;
    } catch (error) {
      console.error('消费音频失败:', error);
      throw error;
    }
  }

  // Socket请求封装
  socketRequest(event, data = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🔄 发送请求: ${event}`, data);
      
      const timeout = setTimeout(() => {
        console.error(`❌ 请求超时: ${event} (10秒)`);
        reject(new Error(`请求超时: ${event}`));
      }, 10000);

      // 对于不需要数据参数的事件，只发送回调
      if (event === 'getRouterRtpCapabilities' || event === 'getProducers') {
        this.socket.emit(event, (response) => {
          console.log(`✅ 收到响应: ${event}`, response);
          clearTimeout(timeout);
          
          if (response && response.error) {
            console.error(`❌ 服务器错误: ${event}`, response.error);
            reject(new Error(response.error));
          } else {
            console.log(`✅ 请求成功: ${event}`);
            resolve(response);
          }
        });
      } else {
        // 其他事件正常发送数据和回调
        this.socket.emit(event, data, (response) => {
          console.log(`✅ 收到响应: ${event}`, response);
          clearTimeout(timeout);
          
          if (response && response.error) {
            console.error(`❌ 服务器错误: ${event}`, response.error);
            reject(new Error(response.error));
          } else {
            console.log(`✅ 请求成功: ${event}`);
            resolve(response);
          }
        });
      }
    });
  }

  // 断开连接
  disconnect() {
    if (this.producer) {
      this.producer.close();
    }

    this.consumers.forEach(consumer => consumer.close());
    this.consumers.clear();

    if (this.sendTransport) {
      this.sendTransport.close();
    }

    if (this.recvTransport) {
      this.recvTransport.close();
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.isConnected = false;
    console.log('已断开所有连接');
  }
}

export default MediasoupClient; 