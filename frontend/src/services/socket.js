import { io } from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');

let socketInstance = null;

function createSocket() {
  return io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket'],
  });
}

export function getSocket() {
  if (!socketInstance) {
    socketInstance = createSocket();
  }
  return socketInstance;
}

export function connectSocket() {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}
