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
