require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node', target: 'ES2022', esModuleInterop: true },
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
let session;
let booking;

Module._load = function (specifier, parent, isMain) {
  if (specifier === 'server-only') return {};
  if (specifier === 'next-auth') return { getServerSession: async () => session };
  if (specifier === '@/lib/auth') return { authOptions: {} };
  if (specifier === '@/lib/prisma') return { prisma: { booking: { findUnique: async () => booking } } };
  if (specifier === '@/lib/rate-limit') return {
    rateLimit: () => ({ success: true }), rateLimitHeaders: () => ({}),
  };
  if (specifier.startsWith('@/')) specifier = path.join(root, 'src', specifier.slice(2));
  return originalLoad.call(this, specifier, parent, isMain);
};
let storage;
let download;
let uploads;
try {
  storage = require('../src/lib/private-upload.ts');
  download = require('../src/app/api/files/design/[file]/route.ts').GET;
  uploads = [require('../src/app/api/upload/route.ts').POST, require('../src/app/api/upload/design/route.ts').POST];
} finally {
  Module._load = originalLoad;
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const pdf = Buffer.from('%PDF-1.7\nfixture');
const asUser = (id, role = 'USER') => ({ user: { id, role } });
const getFile = (file) => download(new Request('http://localhost/api/files/design/test'), { params: Promise.resolve({ file }) });
function uploadRequest(bytes = png, type = 'image/png', orderId = 'order-1') {
  const form = new FormData();
  form.set('file', new File([bytes], '../../unsafe.html', { type }));
  if (orderId !== null) form.set('orderId', orderId);
  return new Request('http://localhost/api/upload', { method: 'POST', body: form });
}

test('private uploads and authenticated downloads', async (suite) => {
  const previousCwd = process.cwd();
  const previousEnvironment = process.env.NODE_ENV;
  const previousStorageRoot = process.env.PRIVATE_UPLOAD_STORAGE_ROOT;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'utero-private-upload-'));
  process.env.NODE_ENV = 'test';
  delete process.env.PRIVATE_UPLOAD_STORAGE_ROOT;
  process.chdir(directory);
  try {
    await suite.test('both endpoints persist private files bound to booking owner', async () => {
      for (const upload of uploads) {
        session = asUser('staff', 'ADMIN');
        booking = { userId: 'customer' };
        const response = await upload(uploadRequest());
        assert.equal(response.status, 200);
        const { url } = await response.json();
        assert.match(url, /^\/api\/files\/design\//);
        const filename = url.split('/').pop();
        assert.ok(storage.isPrivateUploadFilename(filename));
        const metadata = JSON.parse(await fs.readFile(path.join(directory, 'uploads/private/designs', `${filename}.json`), 'utf8'));
        assert.equal(metadata.ownerUserId, 'customer');
        assert.equal(metadata.filename, filename);
        session = asUser('customer');
        const result = await getFile(filename);
        assert.equal(result.status, 200);
        assert.deepEqual(Buffer.from(await result.arrayBuffer()), png);
      }
      await assert.rejects(fs.stat(path.join(directory, 'public')), { code: 'ENOENT' });
    });

    await suite.test('standalone upload belongs to uploader and receives unique filenames', async () => {
      session = asUser('customer');
      const first = await (await uploads[0](uploadRequest(png, 'image/png', null))).json();
      const second = await (await uploads[0](uploadRequest(png, 'image/png', null))).json();
      assert.notEqual(first.url, second.url);
      assert.equal((await getFile(first.url.split('/').pop())).status, 200);
    });

    await suite.test('configured absolute root is used and production rejects unsafe setup', async () => {
      const configuredRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'utero-private-upload-root-'));
      try {
        process.env.PRIVATE_UPLOAD_STORAGE_ROOT = configuredRoot;
        const url = await storage.savePrivateUpload(png, 'png', 'owner');
        const filename = url.split('/').pop();
        await fs.access(path.join(configuredRoot, filename));
        await assert.rejects(fs.access(path.join(directory, 'uploads/private/designs', filename)), { code: 'ENOENT' });

        process.env.PRIVATE_UPLOAD_STORAGE_ROOT = 'relative-private-uploads';
        await assert.rejects(storage.savePrivateUpload(png, 'png', 'owner'), /must be an absolute path/);

        process.env.NODE_ENV = 'production';
        delete process.env.PRIVATE_UPLOAD_STORAGE_ROOT;
        await assert.rejects(storage.savePrivateUpload(png, 'png', 'owner'), /must be configured in production/);

        process.env.PRIVATE_UPLOAD_STORAGE_ROOT = configuredRoot;
        const productionUrl = await storage.savePrivateUpload(png, 'png', 'owner');
        await fs.access(path.join(configuredRoot, productionUrl.split('/').pop()));

        process.env.PRIVATE_UPLOAD_STORAGE_ROOT = path.join(configuredRoot, 'missing');
        await assert.rejects(storage.savePrivateUpload(png, 'png', 'owner'), /must be a provisioned directory/);
      } finally {
        process.env.NODE_ENV = 'test';
        delete process.env.PRIVATE_UPLOAD_STORAGE_ROOT;
        await fs.rm(configuredRoot, { recursive: true, force: true });
      }
    });

    await suite.test('anonymous, foreign accounts and CS cannot read; permitted staff can', async () => {
      const url = await storage.savePrivateUpload(png, 'png', 'owner');
      const filename = url.split('/').pop();
      session = null;
      assert.equal((await getFile(filename)).status, 401);
      for (const role of ['USER', 'CS']) {
        session = asUser('other', role);
        const result = await getFile(filename);
        assert.equal(result.status, 404);
        assert.equal(result.headers.get('cache-control'), 'private, no-store');
      }
      for (const role of ['ADMIN', 'SUPER_ADMIN', 'OPERATOR']) {
        session = asUser('staff', role);
        assert.equal((await getFile(filename)).status, 200);
      }
    });

    await suite.test('images inline, PDF attachment; all responses disable caching and sniffing', async () => {
      session = asUser('owner');
      for (const [bytes, extension, mime, disposition] of [[png, 'png', 'image/png', 'inline'], [pdf, 'pdf', 'application/pdf', 'attachment']]) {
        const url = await storage.savePrivateUpload(bytes, extension, 'owner');
        const result = await getFile(url.split('/').pop());
        assert.equal(result.headers.get('content-type'), mime);
        assert.ok(result.headers.get('content-disposition').startsWith(`${disposition};`));
        assert.equal(result.headers.get('cache-control'), 'private, no-store');
        assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
      }
    });

    await suite.test('traversal, encodings, malformed names and metadata fail closed', async () => {
      session = asUser('owner');
      const url = await storage.savePrivateUpload(png, 'png', 'owner');
      const filename = url.split('/').pop();
      for (const invalid of ['../secret', '..\\secret', '/etc/passwd', 'C:\\secret', '%2e%2e%2fsecret', '%252e%252e%252fsecret', `${filename}\n`, `${filename}\0`, `${filename}.json`, `${filename}:stream`]) {
        assert.equal(storage.isPrivateUploadFilename(invalid), false);
        assert.equal((await getFile(invalid)).status, 404);
      }
      const metadataPath = path.join(directory, 'uploads/private/designs', `${filename}.json`);
      for (const contents of ['{broken', 'null', JSON.stringify({ version: 1, filename: 'different', ownerUserId: 'owner' })]) {
        await fs.writeFile(metadataPath, contents);
        assert.equal((await getFile(filename)).status, 404);
      }
      await fs.unlink(metadataPath);
      assert.equal((await getFile(filename)).status, 404);
    });

    await suite.test('both uploads retain MIME, magic, size and booking ownership checks', async () => {
      for (const upload of uploads) {
        session = asUser('owner');
        booking = { userId: 'owner' };
        assert.equal((await upload(uploadRequest(png, 'text/html'))).status, 400);
        assert.equal((await upload(uploadRequest(Buffer.from('not a png file'), 'image/png'))).status, 400);
        assert.equal((await upload(uploadRequest(Buffer.alloc(0)))).status, 400);
        assert.equal((await upload(uploadRequest(Buffer.alloc(10 * 1024 * 1024 + 1)))).status, 400);
        const form = new FormData();
        form.set('file', 'not a file');
        form.set('orderId', 'order-1');
        assert.equal((await upload(new Request('http://localhost/api/upload', { method: 'POST', body: form }))).status, 400);
        booking = { userId: 'other' };
        assert.equal((await upload(uploadRequest())).status, 403);
        booking = null;
        assert.equal((await upload(uploadRequest())).status, 404);
        session = null;
        assert.equal((await upload(uploadRequest())).status, 401);
      }
    });
  } finally {
    process.chdir(previousCwd);
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousStorageRoot === undefined) delete process.env.PRIVATE_UPLOAD_STORAGE_ROOT;
    else process.env.PRIVATE_UPLOAD_STORAGE_ROOT = previousStorageRoot;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
