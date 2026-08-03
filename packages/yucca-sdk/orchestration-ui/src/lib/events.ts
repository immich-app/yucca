import { io, Socket } from 'socket.io-client';
import { defaults } from './fetch-client';

let socket: Socket;

export const events = new EventTarget();

export class SocketEvent<T> extends Event {
  constructor(
    type: string,
    readonly data: T,
  ) {
    super(type);
  }
}

function createSocket() {
  socket = io(defaults.baseUrl || undefined, {
    path: '/api/yucca/socket.io',
    transports: ['websocket'],
    autoConnect: false,
  });

  socket.onAny((msg) => {
    const payload = JSON.parse(msg);
    const event = new SocketEvent(payload.type, payload);
    events.dispatchEvent(event);
  });
}

const socketHandles = new Set();

let timer: ReturnType<typeof setTimeout>;

const socketGc = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (socketHandles.size === 0 && socket.connected) {
      socket.disconnect();
    }
  }, 1000);
};

export const useSocket = () => {
  if (!socket) {
    createSocket();
  }

  const handle = Symbol();
  socketHandles.add(handle);

  if (socket.disconnected) {
    socket.connect();
  }

  return () => {
    socketHandles.delete(handle);
    socketGc();
  };
};
