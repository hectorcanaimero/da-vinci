import { EventEmitter } from 'node:events';

// emit(tipo, ...) también emite ('*', tipo, ...) para que SSE reenvíe cualquier tipo.
class Bus extends EventEmitter {
  emit(type, ...args) {
    if (type !== '*' && type !== 'error') super.emit('*', type, ...args);
    return super.emit(type, ...args);
  }
}
export const events = new Bus();

export function sseHandler(bus = events) {
  return (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    const onEvent = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    bus.on('*', onEvent);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('close', () => {
      clearInterval(ping);
      bus.off('*', onEvent);
    });
  };
}
