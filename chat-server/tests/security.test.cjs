const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buatPelacakKehadiran } = require('../kehadiran');

const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

function harness({ reset, user, token } = {}) {
  const state = { listened: false, reads: 0, writes: 0, timers: [], disconnected: false };
  state.user = user ?? { id: 'staff-1', role: 'ADMIN', sessionVersion: 2 };
  state.token = token ?? { id: 'staff-1', role: 'ADMIN', sessionVersion: 2, exp: Date.now() / 1000 + 3600 };
  const prisma = {
    user: { findUnique: async () => {
      if (state.databaseError) throw new Error('database unavailable');
      return state.user;
    } },
    chatSession: { updateMany: reset || (async () => ({ count: 0 })) },
    chatMessage: {
      findMany: async () => { state.reads++; return []; },
      create: async () => { state.writes++; return {}; },
    },
    $disconnect: async () => { state.disconnected = true; },
  };
  const app = { use() {}, get() {}, post() {} };
  const express = Object.assign(() => app, { json: () => () => {} });
  const io = {
    use(handler) { state.authenticate = handler; },
    on(event, handler) { if (event === 'connection') state.connect = handler; },
    to() { return this; },
    emit() {},
  };
  const mocked = {
    dotenv: { config() {} }, express,
    http: { createServer: () => ({ listen: () => { state.listened = true; } }) },
    'socket.io': { Server: function () { return io; } },
    cors: () => () => {},
    '@prisma/client': { PrismaClient: function () { return prisma; } },
    'next-auth/jwt': { decode: async () => state.token },
  };
  state.process = { env: { NEXTAUTH_SECRET: 'test-secret', CHAT_CORS_ORIGINS: 'http://localhost:4000' } };
  vm.runInNewContext(source, {
    require(name) {
      if (Object.hasOwn(mocked, name)) return mocked[name];
      return name.startsWith('./') ? require(path.join(__dirname, '..', name)) : require(name);
    },
    process: state.process, Buffer,
    console: { log() {}, warn() {}, error() {} },
    setInterval(callback) {
      const timer = { callback, unref() {} };
      state.timers.push(timer);
      return timer;
    },
    clearInterval(timer) { timer.cleared = true; },
  }, { filename: 'chat-server/index.js' });
  state.socket = (auth = {}) => {
    const handlers = {};
    const socket = {
      id: 'socket-1', data: {}, handshake: { auth, headers: {} }, handlers, emitted: [], rooms: new Set(),
      on(event, callback) { handlers[event] = callback; },
      emit(event, payload) { this.emitted.push({ event, payload }); },
      join(room) { this.rooms.add(room); },
      leave(room) { this.rooms.delete(room); },
      disconnect() { this.disconnected = true; this.rooms.clear(); handlers.disconnect?.(); },
    };
    return socket;
  };
  state.login = async (socket) => {
    let rejection;
    await state.authenticate(socket, error => { rejection = error; });
    if (!rejection) state.connect(socket);
    return rejection;
  };
  return state;
}

test('all exposed events tolerate null and malformed payloads without database access', async () => {
  const state = harness();
  const socket = state.socket();
  assert.equal(await state.login(socket), undefined);
  for (const event of ['claimGuestSession', 'joinRoom', 'leaveRoom', 'mintaRiwayat', 'sendMessage']) {
    for (const payload of [null, undefined, [], 42, {}, true]) {
      await assert.doesNotReject(async () => socket.handlers[event](payload));
    }
  }
  assert.equal(state.reads, 0);
  assert.equal(state.writes, 0);
  assert.ok(socket.emitted.some(entry => entry.event === 'pesanGagal'));
});

test('only ADMIN, SUPER_ADMIN and CS can join arbitrary conversation rooms', async () => {
  for (const role of ['ADMIN', 'SUPER_ADMIN', 'CS', 'OPERATOR', 'USER']) {
    const state = harness();
    state.user.role = role;
    state.token.role = role;
    const socket = state.socket({ token: 'valid' });
    assert.equal(await state.login(socket), undefined);
    await socket.handlers.joinRoom('customer-room');
    assert.equal(socket.rooms.has('customer-room'), ['ADMIN', 'SUPER_ADMIN', 'CS'].includes(role));
    if (role === 'OPERATOR') {
      await socket.handlers.mintaRiwayat({ sessionId: 'customer-room' });
      await socket.handlers.sendMessage({ sessionId: 'customer-room', message: 'unauthorized' });
      assert.equal(state.reads, 0);
      assert.equal(state.writes, 0);
    }
  }
});

test('handshake rejects revoked, legacy, deleted-user and expired sessions', async () => {
  for (const change of [
    state => { state.user.sessionVersion++; },
    state => { delete state.token.sessionVersion; },
    state => { state.user = null; },
    state => { state.token.exp = 1; },
    state => { state.user.role = 'USER'; },
  ]) {
    const state = harness();
    change(state);
    assert.ok(await state.login(state.socket({ token: 'valid' })));
  }
});

test('malformed cookie is rejected without rejected handshake promise', async () => {
  const state = harness();
  const socket = state.socket();
  socket.handshake.headers.cookie = 'next-auth.session-token=%broken';
  assert.ok(await state.login(socket));
});

test('each event checks revocation and disconnects before accessing chat data', async () => {
  for (const event of ['joinRoom', 'leaveRoom', 'claimGuestSession', 'mintaRiwayat', 'sendMessage']) {
    const state = harness();
    const socket = state.socket({ token: 'valid' });
    await state.login(socket);
    state.user.sessionVersion++;
    await socket.handlers[event]({ sessionId: 'customer-room', message: 'hello' });
    assert.equal(socket.disconnected, true);
    assert.equal(state.reads, 0);
    assert.equal(state.writes, 0);
    assert.equal(state.timers[0].cleared, true);
  }
});

test('idle staff socket is disconnected after role changes', async () => {
  const state = harness();
  const socket = state.socket({ token: 'valid' });
  await state.login(socket);
  state.user.role = 'USER';
  await state.timers[0].callback();
  assert.equal(socket.disconnected, true);
  assert.equal(socket.rooms.size, 0);
});

test('database failure fails closed during handshake and event validation', async () => {
  const state = harness();
  const socket = state.socket({ token: 'valid' });
  await state.login(socket);
  state.databaseError = true;
  assert.ok(await state.login(state.socket({ token: 'valid' })));
  await socket.handlers.mintaRiwayat({ sessionId: 'customer-room' });
  assert.equal(socket.disconnected, true);
  assert.equal(state.reads, 0);
});

test('async room adapter rejection is contained by event wrapper', async () => {
  const state = harness();
  const socket = state.socket({ token: 'valid' });
  await state.login(socket);
  socket.join = async () => { throw new Error('adapter unavailable'); };
  await assert.doesNotReject(() => socket.handlers.joinRoom('customer-room'));
  assert.ok(socket.emitted.some(entry => entry.event === 'pesanGagal'));
});

test('server does not listen until presence reset completes', async () => {
  let finish;
  const state = harness({ reset: () => new Promise(resolve => { finish = resolve; }) });
  assert.equal(state.listened, false);
  finish({ count: 3 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.listened, true);
});

test('failed presence reset prevents startup and disconnects Prisma', async () => {
  const state = harness({ reset: async () => { throw new Error('DB unavailable'); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.listened, false);
  assert.equal(state.process.exitCode, 1);
  assert.equal(state.disconnected, true);
});

test('presence reset exposes database failures to startup', async () => {
  const tracker = buatPelacakKehadiran({
    prisma: { chatSession: { updateMany: async () => { throw new Error('offline'); } } },
    catatGalat() {},
  });
  await assert.rejects(tracker.setelUlangKehadiran(), /offline/);
});
