import { io } from 'socket.io-client';

export const socket = io('http://localhost:22676', {
  transports: ['websocket'],
  autoConnect: false,
});

export const events = new EventTarget();

export class SocketEvent<T> extends Event {
  constructor(
    type: string,
    readonly data: T,
  ) {
    super(type);
  }
}

socket.onAny((msg) => {
  const payload = JSON.parse(msg);
  const event = new SocketEvent(payload.type, payload);
  events.dispatchEvent(event);
});

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
