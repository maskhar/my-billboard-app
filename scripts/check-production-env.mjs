import { pathToFileURL } from 'node:url';
import path from 'node:path';

const REQUIRED_ENV = {
  'aplikasi utama': [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'APP_ORIGIN',
    'SETTINGS_ENCRYPTION_KEY',
    'NEXT_PUBLIC_CHAT_ENABLED',
    'PRIVATE_UPLOAD_STORAGE_ROOT',
    'CRON_SECRET',
  ],
  Xendit: ['XENDIT_SECRET_KEY', 'XENDIT_CALLBACK_TOKEN'],
};

const HTTPS_ENV = ['NEXTAUTH_URL', 'APP_ORIGIN'];

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function checkProductionEnv(env = process.env) {
  const failures = [];

  if (env.NODE_ENV !== 'production') {
    failures.push('NODE_ENV harus bernilai production.');
  }

  for (const [group, names] of Object.entries(REQUIRED_ENV)) {
    for (const name of names) {
      if (isBlank(env[name])) failures.push(`${name} wajib diisi (${group}).`);
    }
  }

  for (const name of HTTPS_ENV) {
    if (!isBlank(env[name]) && !isHttpsUrl(env[name].trim())) {
      failures.push(`${name} harus berupa URL https:// di production.`);
    }
  }

  if (!['true', 'false'].includes(env.NEXT_PUBLIC_CHAT_ENABLED)) {
    failures.push('NEXT_PUBLIC_CHAT_ENABLED wajib bernilai true atau false.');
  }

  if (env.NEXT_PUBLIC_CHAT_ENABLED === 'true') {
    for (const name of ['NEXT_PUBLIC_CHAT_URL', 'CHAT_CORS_ORIGINS', 'CHAT_GUEST_TOKEN_SECRET', 'GEMINI_API_KEY']) {
      if (isBlank(env[name])) failures.push(`${name} wajib diisi ketika chat aktif.`);
    }
    if (!isBlank(env.NEXT_PUBLIC_CHAT_URL) && !isHttpsUrl(env.NEXT_PUBLIC_CHAT_URL.trim())) {
      failures.push('NEXT_PUBLIC_CHAT_URL harus berupa URL https:// ketika chat aktif.');
    }
  }

  if (!isBlank(env.PRIVATE_UPLOAD_STORAGE_ROOT) && !path.isAbsolute(env.PRIVATE_UPLOAD_STORAGE_ROOT.trim())) {
    failures.push('PRIVATE_UPLOAD_STORAGE_ROOT harus berupa path absolut ke storage persisten.');
  }

  if (env.NEXT_PUBLIC_CHAT_ENABLED === 'true' && !isBlank(env.CHAT_CORS_ORIGINS)) {
    for (const origin of env.CHAT_CORS_ORIGINS.split(',').map((value) => value.trim())) {
      if (!isHttpsUrl(origin)) {
        failures.push('CHAT_CORS_ORIGINS hanya boleh memuat origin https:// di production.');
        break;
      }
    }
  }

  return failures;
}

export function formatReport(failures) {
  if (failures.length === 0) return '[production-env] Environment produksi siap.';
  return ['[production-env] Environment produksi belum siap:', ...failures.map((failure) => `- ${failure}`)].join('\n');
}

function run() {
  const failures = checkProductionEnv();
  const report = formatReport(failures);
  (failures.length === 0 ? console.log : console.error)(report);
  return failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/check-production-env.mjs\nExport app, chat, and Xendit environment variables into this process first. Secret values are never printed.');
  } else {
    process.exitCode = run();
  }
}
