import { useState, useEffect, useRef } from 'react';
import MediasoupClient from '../utils/MediasoupClient.js';
import './VoiceChat.css';

const VoiceChat = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const roomIdRef = useRef('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [isProducing, setIsProducing] = useState(false);
  const [peers, setPeers] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('未连接');
  
  const clientRef = useRef(null);
  const audioElementsRef = useRef(new Map());

  useEffect(() => {
      console.log('useEffect');
        // 在网页中添加消息监听器
      window.addEventListener('message', async (event) => {
        if (event.data.type === 'webview') {
          console.log('Received audio control:', event.data.action);
          // 处理具体的音频控制逻辑
          switch(event.data.action) {
            case 'START_AUDIO':
              // 开始录音逻辑
              startSpeaking();
              break;
            case 'LEAVE_ROOM':
              console.log('LEAVE_ROOM');
              leaveRoom();
              disconnectFromServer();
              // 停止录音逻辑
              break;
            case 'ENTER_ROOM':
              // 进入房间逻辑
              if (!isConnected) {
                await connectToServer();
              } 

              if (!isInRoom) {
                setTimeout(() => {
                  roomIdRef.current = '10000';
                  joinRoom();
                }, 100);
              }

              stopSpeaking();
              break;
          }
        }
      });
  }, []);



    // 初始化MediasoupClient
  useEffect(() => {
    // 初始化MediasoupClient
    clientRef.current = new MediasoupClient();
    
    // 设置事件回调
    clientRef.current.onUserJoined = (data) => {
      setPeers(prev => [...prev, { id: data.peerId, producing: false }]);
      setStatus(`用户 ${data.peerId} 加入了房间`);
    };

    clientRef.current.onUserLeft = (data) => {
      setPeers(prev => prev.filter(peer => peer.id !== data.peerId));
      setStatus(`用户 ${data.peerId} 离开了房间`);
      
      // 清理音频元素
      const audioElement = audioElementsRef.current.get(data.peerId);
      if (audioElement) {
        audioElement.remove();
        audioElementsRef.current.delete(data.peerId);
      }
    };

    clientRef.current.onNewAudio = (audioElement, consumer) => {
      // 为音频元素添加标识
      audioElement.setAttribute('data-consumer-id', consumer.id);
      audioElementsRef.current.set(consumer.id, audioElement);
      setStatus('接收到新的音频流');
    };

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
      // 清理所有音频元素
      audioElementsRef.current.forEach(audio => audio.remove());
    };
  }, []);

  const connectToServer = async () => {
    try {
      setError('');
      setStatus('正在连接到服务器...');
      
      await clientRef.current.connect();
      await clientRef.current.initializeDevice();
      
      setIsConnected(true);
      setStatus('已连接到服务器');
    } catch (err) {
      setError(`连接失败: ${err.message}`);
      setStatus('连接失败');
    }
  };

  const joinRoom = async () => {

    if (!roomIdRef.current.trim()) {
      setError('请输入房间ID');
      return;
    }

    try {
      setError('');
      setStatus('正在加入房间...');
      
      const result = await clientRef.current.joinRoom(roomIdRef.current);
      
      if (result.success) {
        setIsInRoom(true);
        setPeers(result.peers || []);
        setStatus(`成功加入房间: ${roomIdRef.current}`);
      }
    } catch (err) {
      setError(`加入房间失败: ${err.message}`);
      setStatus('加入房间失败');
    }
  };

  const leaveRoom = () => {
    // 不要完全断开服务器连接，只清理房间相关的状态
    if (clientRef.current && clientRef.current.producer) {
      clientRef.current.stopProducing();
    }
    
    setIsInRoom(false);
    setIsProducing(false);
    setPeers([]);
    setStatus('已离开房间');
    
    // 清理音频元素
    audioElementsRef.current.forEach(audio => audio.remove());
    audioElementsRef.current.clear();
  };

  const disconnectFromServer = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    setIsConnected(false);
    setIsInRoom(false);
    setIsProducing(false);
    setPeers([]);
    setStatus('已断开服务器连接');
    
    // 清理音频元素
    audioElementsRef.current.forEach(audio => audio.remove());
    audioElementsRef.current.clear();
  };

  const startSpeaking = async () => {
    try {
      setError('');
      setStatus('正在开启麦克风...');
      
      await clientRef.current.produceAudio();
      setIsProducing(true);
      setStatus('麦克风已开启，正在发送音频');
    } catch (err) {
      setError(`开启麦克风失败: ${err.message}`);
      setStatus('开启麦克风失败');
    }
  };

  const stopSpeaking = () => {
    clientRef.current.stopProducing();
    setIsProducing(false);
    setStatus('麦克风已关闭');
  };

  return (
    <div className="voice-chat">
      <h1>语音聊天室</h1>
      
      <div className="status-section">
        <div className={`status ${error ? 'error' : ''}`}>
          {error || status}
        </div>
      </div>

      {!isConnected ? (
        <div className="connect-section">
          <button onClick={connectToServer} className="primary-btn">
            连接到服务器
          </button>
        </div>
      ) : !isInRoom ? (
        <div className="room-section">
          <div className="connection-info">
            <span className="connected-indicator">✅ 已连接到服务器</span>
            <button onClick={disconnectFromServer} className="disconnect-btn">
              断开连接
            </button>
          </div>
          <div className="input-group">
            <input
              type="text"
              placeholder="输入房间ID"
              value={roomId}
              onChange={(e) => {
                roomIdRef.current = e.target.value;
                setRoomId(e.target.value);
              }}
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
            />
            <button onClick={joinRoom} className="primary-btn">
              加入房间
            </button>
          </div>
        </div>
      ) : (
        <div className="chat-section">
          <div className="room-info">
            <h2>房间: {roomId}</h2>
            <button onClick={leaveRoom} className="secondary-btn">
              离开房间
            </button>
          </div>

          <div className="audio-controls">
            {!isProducing ? (
              <button onClick={startSpeaking} className="speak-btn">
                🎤 开始说话
              </button>
            ) : (
              <button onClick={stopSpeaking} className="stop-btn">
                🔇 停止说话
              </button>
            )}
          </div>

          <div className="peers-section">
            <h3>房间成员 ({peers.length + 1})</h3>
            <div className="peers-list">
              <div className="peer self">
                <span>🎤 你 {isProducing ? '(正在说话)' : '(静音)'}</span>
              </div>
              {peers.map(peer => (
                <div key={peer.id} className="peer">
                  <span>👤 用户 {peer.id.substring(0, 8)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="instructions">
            <h4>使用说明:</h4>
            <ul>
              <li>点击"开始说话"开启麦克风并发送音频</li>
              <li>其他用户的音频会自动播放</li>
              <li>支持多人同时语音</li>
              <li>离开房间会自动断开所有连接</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceChat; 