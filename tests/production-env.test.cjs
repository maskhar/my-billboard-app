const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const script = path.resolve(__dirname, '../scripts/check-production-env.mjs');

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:password@db.example.com:5432/billboard',
    NEXTAUTH_SECRET: 'test-nextauth-secret',
    NEXTAUTH_URL: 'https://app.example.com',
    APP_ORIGIN: 'https://app.example.com',
    SETTINGS_ENCRYPTION_KEY: 'a'.repeat(64),
    NEXT_PUBLIC_CHAT_ENABLED: 'false',
    NEXT_PUBLIC_CHAT_URL: 'https://chat.example.com',
    PRIVATE_UPLOAD_STORAGE_ROOT: path.resolve(__dirname, '../uploads/private-production'),
    CRON_SECRET: 'test-cron-secret',
    CHAT_CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
    CHAT_GUEST_TOKEN_SECRET: 'test-chat-secret',
    GEMINI_API_KEY: 'test-gemini-key',
    XENDIT_SECRET_KEY: 'test-xendit-secret',
    XENDIT_CALLBACK_TOKEN: 'test-xendit-callback-token',
    ...overrides,
  };
}

function run(overrides) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, ...productionEnv(overrides) },
  });
}

test('lulus dengan environment produksi lengkap dan HTTPS', () => {
  const result = run();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Environment produksi siap/);
  assert.equal(result.stderr, '');
});

test('gagal bila env wajib aplikasi atau Xendit kosong tanpa mencetak secret', () => {
  const secret = 'secret-yang-tidak-boleh-masuk-log';
  const result = run({
    NEXTAUTH_SECRET: '',
    XENDIT_SECRET_KEY: secret,
    XENDIT_CALLBACK_TOKEN: '',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXTAUTH_SECRET wajib diisi \(aplikasi utama\)/);
  assert.match(result.stderr, /XENDIT_CALLBACK_TOKEN wajib diisi \(Xendit\)/);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test('gagal bila URL produksi atau origin chat tidak menggunakan HTTPS', () => {
  const result = run({
    NEXT_PUBLIC_CHAT_ENABLED: 'true',
    NEXT_PUBLIC_CHAT_URL: 'http://chat.example.com',
    CHAT_CORS_ORIGINS: 'https://app.example.com,http://chat.example.com',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_CHAT_URL harus berupa URL https:\/\/ ketika chat aktif/);
  assert.match(result.stderr, /CHAT_CORS_ORIGINS hanya boleh memuat origin https:\/\//);
});

test('chat yang dipause tidak membutuhkan env server chat', () => {
  const result = run({
    NEXT_PUBLIC_CHAT_ENABLED: 'false',
    NEXT_PUBLIC_CHAT_URL: '',
    CHAT_CORS_ORIGINS: '',
    CHAT_GUEST_TOKEN_SECRET: '',
    GEMINI_API_KEY: '',
  });

  assert.equal(result.status, 0);
});

test('chat aktif mewajibkan seluruh env chat', () => {
  const result = run({
    NEXT_PUBLIC_CHAT_ENABLED: 'true',
    NEXT_PUBLIC_CHAT_URL: '',
    CHAT_CORS_ORIGINS: '',
    CHAT_GUEST_TOKEN_SECRET: '',
    GEMINI_API_KEY: '',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_CHAT_URL wajib diisi ketika chat aktif/);
  assert.match(result.stderr, /CHAT_CORS_ORIGINS wajib diisi ketika chat aktif/);
});

test('gagal bila root upload privat bukan path absolut', () => {
  const result = run({ PRIVATE_UPLOAD_STORAGE_ROOT: 'uploads/private' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PRIVATE_UPLOAD_STORAGE_ROOT harus berupa path absolut/);
});
