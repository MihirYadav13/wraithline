// Thin client for the multiplayer relay (server/relay.js).
export class Net {
  constructor() {
    this.ws = null;
    this.id = null;
    this.code = null;
    this.hostId = null;
    this.players = [];
    this.handlers = {};
  }

  get isHost() {
    return this.id !== null && this.id === this.hostId;
  }

  on(type, fn) {
    (this.handlers[type] ||= []).push(fn);
  }

  emit(type, ...args) {
    for (const fn of this.handlers[type] || []) fn(...args);
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/mp`;
      const ws = (this.ws = new WebSocket(url));
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not reach the multiplayer server.'));
      ws.onclose = () => this.emit('closed');
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'joined') {
          this.id = m.id;
          this.code = m.code;
          this.hostId = m.host;
          this.players = m.players;
          this.emit('roster', this.players);
          this.emit('joined', m);
        } else if (m.t === 'roster' || m.t === 'left') {
          this.players = m.players;
          this.emit('roster', this.players);
          if (m.t === 'left') this.emit('left', m.id);
        } else if (m.t === 'error') this.emit('error', m.message, m.fatal);
        else if (m.t === 'msg') this.emit('msg', m.data, m.from);
      };
    });
  }

  async host(name) {
    await this.connect();
    this.ws.send(JSON.stringify({ t: 'create', name }));
  }

  async join(code, name) {
    await this.connect();
    this.ws.send(JSON.stringify({ t: 'join', code, name }));
  }

  // send to one player id, or to everyone else when `to` is omitted
  send(data, to) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'relay', to, data }));
  }

  nameOf(id) {
    return this.players.find((p) => p.id === id)?.name ?? 'Investigator';
  }
}
