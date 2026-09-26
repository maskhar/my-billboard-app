// tests/xendit.test.cjs
//
// Regression test untuk `src/lib/xendit.ts` — satu-satunya pintu ke API Xendit.
//
// KENAPA FILE INI CJS DAN BUKAN .test.ts
// -------------------------------------
// `node --test` menjalankan file ini langsung tanpa bundler. `ts-node/register`
// dipasang di baris pertama dengan `transpileOnly` supaya modul TypeScript bisa
// di-`require` tanpa menunggu type-check seluruh proyek (tsconfig proyek memakai
// `module: esnext` + `moduleResolution: bundler` yang tidak bisa di-`require`).
//
// SEMUA JARINGAN DIPALSUKAN. Tidak ada satu pun test di sini yang menyentuh
// api.xendit.co: `globalThis.fetch` diganti pencatat, dan variabel environment
// diisi nilai palsu lalu dipulihkan. Kunci Xendit yang asli tidak pernah dibaca.
//
// Jalankan: npm run test:xendit
//   (`node --conditions=react-server --test tests/xendit.test.cjs` — kondisi itu
//    membuat `server-only` menjadi modul kosong, bukan modul yang melempar.)

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'Node',
    target: 'ES2022',
    esModuleInterop: true,
    allowJs: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    isolatedModules: false,
    verbatimModuleSyntax: false,
  },
});

const { test, describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const JALUR_MODUL = path.join(__dirname, '..', 'src', 'lib', 'xendit.ts');
const JALUR_SESI_PEMBAYARAN = path.join(__dirname, '..', 'src', 'lib', 'sesi-pembayaran.ts');
const JALUR_ROUTE_BOOKING = path.join(__dirname, '..', 'src', 'app', 'api', 'booking', 'create', 'route.ts');
const JALUR_ROUTE_REGISTER = path.join(__dirname, '..', 'src', 'app', 'api', 'register', 'route.ts');
const JALUR_ROUTE_SESI = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'api',
  'booking',
  '[id]',
  'payment-session',
  'route.ts'
);
const JALUR_KLIEN_PEMBAYARAN = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'dashboard',
  'order',
  '[id]',
  'payment',
  'PaymentClient.tsx'
);
const JALUR_PELUNASAN_WEBHOOK = path.join(
  __dirname,
  '..',
  'src',
  'lib',
  'pelunasan-webhook.ts'
);
const JALUR_ROUTE_WEBHOOK_XENDIT = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'api',
  'xendit',
  'webhook',
  'route.ts'
);
const JALUR_ROUTE_NOTIFY_LEGACY = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'api',
  'payment',
  'notify',
  'route.ts'
);
const JALUR_LEDGER = path.join(__dirname, '..', 'src', 'lib', 'pembayaran.ts');
const JALUR_ROUTE_REFUND = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'api',
  'booking',
  'request-refund',
  'route.ts'
);
const JALUR_ROUTE_UPDATE_ORDER = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'api',
  'admin',
  'update-order',
  'route.ts'
);
const JALUR_ROUTE_ADD_CHARGE = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'api',
  'admin',
  'orders',
  'add-charge',
  'route.ts'
);
const JALUR_LAPORAN = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'admin',
  '(dashboard)',
  'actions.ts'
);
const JALUR_INVOICE = path.join(__dirname, '..', 'src', 'app', 'invoice', '[id]', 'page.tsx');
const JALUR_DASHBOARD_WRAPPER = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'dashboard',
  'DashboardWrapper.tsx'
);
const JALUR_TRANSACTION_CLIENT = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'admin',
  '(dashboard)',
  'orders',
  'TransactionClient.tsx'
);
const JALUR_BOOKING_CARD = path.join(__dirname, '..', 'src', 'components', 'BookingCard.tsx');
const JALUR_USERS_CLIENT = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'admin',
  '(dashboard)',
  'users',
  'UserClientPage.tsx'
);

// ---------------------------------------------------------------------------
// Nilai palsu. Sengaja mirip bentuk aslinya supaya test kebocoran rahasia
// benar-benar menguji hal yang sama, tapi tidak ada nilai asli di sini.
// ---------------------------------------------------------------------------
const KUNCI_PALSU = 'xnd_development_KUNCI_PALSU_TES_0123456789abcdef';
const TOKEN_PALSU = 'token_callback_palsu_untuk_tes_abcdef';
const ORIGIN_PALSU = 'https://contoh.test';
const ENV_DIPAKAI = [
  'XENDIT_SECRET_KEY',
  'XENDIT_CALLBACK_TOKEN',
  'XENDIT_API_BASE_URL',
  'APP_ORIGIN',
  'ADMIN_EMAIL',
  'NODE_ENV',
];

let envAsli = null;
let fetchAsli = null;

function simpanEnv() {
  envAsli = {};
  for (const nama of ENV_DIPAKAI) envAsli[nama] = process.env[nama];
}

function pulihkanEnv() {
  if (!envAsli) return;
  for (const nama of ENV_DIPAKAI) {
    if (envAsli[nama] === undefined) delete process.env[nama];
    else process.env[nama] = envAsli[nama];
  }
  envAsli = null;
}

/** Muat ulang modul supaya ia membaca `process.env` yang sedang dipasang test. */
function muat() {
  delete require.cache[require.resolve(JALUR_MODUL)];
  return require(JALUR_MODUL);
}

/**
 * Pasang `fetch` palsu. Mengembalikan array panggilan; array yang tetap KOSONG
 * adalah cara test membuktikan penolakan terjadi SEBELUM jaringan disentuh —
 * satu-satunya jenis penolakan yang tidak bisa menagih uang pembeli.
 */
function pasangFetch(penjawab) {
  const panggilan = [];
  globalThis.fetch = async (url, init) => {
    const rekaman = { url: String(url), init: init || {} };
    panggilan.push(rekaman);
    const jawab =
      typeof penjawab === 'function' ? penjawab(rekaman, panggilan.length - 1) : penjawab;
    return await jawab;
  };
  return panggilan;
}

function jawaban({ status = 200, body = {}, teks = null, headers = {} } = {}) {
  const isi = teks !== null ? teks : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => isi,
    json: async () => JSON.parse(isi),
    clone() {
      return this;
    },
  };
}

/** Jawaban yang badannya HILANG di tengah jalan (koneksi terputus saat membaca). */
function jawabanBadanHilang(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: async () => {
      throw new TypeError('terminated');
    },
    json: async () => {
      throw new TypeError('terminated');
    },
  };
}

function headerPeta(init) {
  const peta = {};
  const h = init && init.headers;
  if (!h) return peta;
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    h.forEach((nilai, nama) => {
      peta[String(nama).toLowerCase()] = nilai;
    });
  } else if (Array.isArray(h)) {
    for (const [nama, nilai] of h) peta[String(nama).toLowerCase()] = nilai;
  } else {
    for (const [nama, nilai] of Object.entries(h)) peta[String(nama).toLowerCase()] = nilai;
  }
  return peta;
}

function badan(init) {
  assert.equal(typeof init.body, 'string', 'body harus string JSON');
  return JSON.parse(init.body);
}

/**
 * Muat satu modul route dengan dependensi batasnya diganti nilai palsu.
 * Patch hanya hidup selama evaluasi `require`; test lain tidak melihatnya.
 */
function muatDenganModulPalsu(jalur, modulPalsu) {
  const loadAsli = Module._load;
  delete require.cache[require.resolve(jalur)];
  const akarSrc = path.join(__dirname, '..', 'src');
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(modulPalsu, request)) return modulPalsu[request];
    // Alias `@/` milik tsconfig tidak dikenali loader CommonJS. Modul yang
    // tidak dipalsukan tetap dimuat dari sumber aslinya lewat jalur nyata.
    if (request.startsWith('@/')) {
      return loadAsli.call(this, path.join(akarSrc, request.slice(2)), parent, isMain);
    }
    return loadAsli.call(this, request, parent, isMain);
  };
  try {
    return require(jalur);
  } finally {
    Module._load = loadAsli;
  }
}

function inputSesi(ganti = {}) {
  return {
    referenceId: 'pay_01HZ',
    customerId: 'cust_01HZ',
    jumlah: '1500000',
    deskripsi: 'Sewa billboard Jl. Sudirman',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...ganti,
  };
}

function inputCustomer(ganti = {}) {
  return {
    referenceId: 'user_01HZ',
    email: 'pembeli@contoh.test',
    nama: 'Budi Santoso',
    ...ganti,
  };
}

/**
 * Jawaban sesi yang sehat.
 *
 * Dibuat lewat fungsi, bukan konstanta bersama: `expires_at` dihitung dari
 * `Date.now()`, dan satu objek yang dipakai seluruh file akan kedaluwarsa di
 * tengah rangkaian test yang panjang — kegagalan yang muncul dan hilang sendiri.
 */
function sesiOk(ganti = {}) {
  return {
    payment_session_id: 'ps-1',
    status: 'ACTIVE',
    mode: 'COMPONENTS',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    reference_id: 'pay_01HZ',
    customer_id: 'cust_01HZ',
    amount: 1500000,
    components_sdk_key: 'csk-palsu-untuk-tes',
    ...ganti,
  };
}

const CUSTOMER_OK = { id: 'cus-1', reference_id: 'user_01HZ' };

beforeEach(() => {
  simpanEnv();
  fetchAsli = globalThis.fetch;
  process.env.XENDIT_SECRET_KEY = KUNCI_PALSU;
  process.env.XENDIT_CALLBACK_TOKEN = TOKEN_PALSU;
  process.env.APP_ORIGIN = ORIGIN_PALSU;
  process.env.NODE_ENV = 'test';
  delete process.env.XENDIT_API_BASE_URL;
});

afterEach(() => {
  globalThis.fetch = fetchAsli;
  pulihkanEnv();
  delete require.cache[require.resolve(JALUR_MODUL)];
});

// ===========================================================================
// NOMINAL
// ===========================================================================
describe('nominal sesi pembayaran', () => {
  const nominalDiterima = [
    ['string bulat', '1000', 1000],
    ['string desimal .00', '1000.00', 1000],
    ['string desimal .0', '1000.0', 1000],
    ['number bulat', 1000, 1000],
    ['Prisma.Decimal bulat', () => new (require('@prisma/client').Prisma.Decimal)('1000.00'), 1000],
    ['MAX_SAFE_INTEGER', String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ];

  for (const [judul, masukan, keluaran] of nominalDiterima) {
    it(`nominalUntukXendit menerima ${judul} dan menghasilkan number tepat`, () => {
      const { nominalUntukXendit } = muat();
      const nilai = typeof masukan === 'function' ? masukan() : masukan;
      const hasil = nominalUntukXendit(nilai);
      assert.equal(typeof hasil, 'number');
      assert.equal(hasil, keluaran);
    });
  }

  const nominalTidakValid = [
    ['pecahan bukan nol (string)', '1000.50'],
    ['pecahan bukan nol (number)', 1000.5],
    [
      'pecahan bukan nol (Decimal)',
      () => new (require('@prisma/client').Prisma.Decimal)('1000.50'),
    ],
    // Infinity lolos dari `keDecimal` (ia bukan NaN) dan tersaring di
    // pemeriksaan bilangan bulat.
    ['Infinity', 'Infinity'],
    ['-Infinity', '-Infinity'],
  ];

  for (const [judul, masukan] of nominalTidakValid) {
    it(`nominalUntukXendit menolak ${judul} dengan NOMINAL_TIDAK_VALID`, () => {
      const { GalatXendit, nominalUntukXendit } = muat();
      const nilai = typeof masukan === 'function' ? masukan() : masukan;
      assert.throws(
        () => nominalUntukXendit(nilai),
        (error) => error instanceof GalatXendit && error.kodeGalat === 'NOMINAL_TIDAK_VALID'
      );
    });
  }

  const nominalDiLuarBatas = [
    ['negatif', '-1000'],
    ['NaN harfiah', 'NaN'],
    ['kosong', ''],
    ['null', null],
    ['undefined', undefined],
    ['bukan angka', 'abc'],
    ['nol', '0'],
    ['nol dengan pecahan nol', '0.00'],
    ['di atas MAX_SAFE_INTEGER', '9007199254740992'],
    ['jauh di atas MAX_SAFE_INTEGER', '99999999999999999999'],
  ];

  for (const [judul, nilai] of nominalDiLuarBatas) {
    it(`nominalUntukXendit menolak ${judul} dengan NOMINAL_DI_LUAR_BATAS`, () => {
      const { GalatXendit, nominalUntukXendit } = muat();
      assert.throws(
        () => nominalUntukXendit(nilai),
        (error) => error instanceof GalatXendit && error.kodeGalat === 'NOMINAL_DI_LUAR_BATAS'
      );
    });
  }

  it('buatSesiPembayaran mengirim amount sebagai NUMBER JSON', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi({ jumlah: '1500000.00' }));

    assert.equal(panggilan.length, 1);
    const isi = badan(panggilan[0].init);
    assert.equal(typeof isi.amount, 'number', 'amount wajib number, bukan string');
    assert.equal(isi.amount, 1500000);
    assert.match(panggilan[0].init.body, /"amount":\s*1500000(,|})/);
  });

  const nominalSesiDitolak = [
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['nol', '0'],
    ['negatif', '-1000'],
    ['pecahan bukan nol', '1000.50'],
    ['melebihi MAX_SAFE_INTEGER', '9007199254740992'],
  ];

  for (const [judul, jumlah] of nominalSesiDitolak) {
    it(`buatSesiPembayaran menolak nominal ${judul} sebelum fetch`, async () => {
      const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
      const { GalatXendit, buatSesiPembayaran } = muat();

      await assert.rejects(
        () => buatSesiPembayaran(inputSesi({ jumlah })),
        (error) => error instanceof GalatXendit
      );
      assert.equal(panggilan.length, 0, 'fetch tidak boleh dipanggil untuk nominal tidak sah');
    });
  }
});

// ===========================================================================
// URL KEMBALI
// ===========================================================================
describe('URL kembali', () => {
  it('disusun sendiri dari APP_ORIGIN, bukan dari masukan pemanggil', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    // Kalau pemanggil masih bisa menentukan URL kembali, kolom-kolom ini akan
    // terbawa ke badan permintaan. Route yang memegang objek request lalu bisa
    // mengisinya dari header — yang artinya pengirim permintaan menentukan ke
    // mana pembeli dipulangkan setelah membayar.
    await buatSesiPembayaran(
      inputSesi({
        returnUrl: 'https://penyerang.example.com/ambil',
        origins: ['https://penyerang.example.com'],
      })
    );

    const isi = badan(panggilan[0].init);
    assert.equal(
      isi.components_configuration.return_url,
      'https://contoh.test/pembayaran/selesai'
    );
    assert.deepEqual(isi.components_configuration.origins, ['https://contoh.test']);
  });

  it('memakai http untuk origin lokal supaya pengembangan tidak tertutup', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    process.env.APP_ORIGIN = 'http://localhost:4000';
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    assert.equal(
      badan(panggilan[0].init).components_configuration.return_url,
      'http://localhost:4000/pembayaran/selesai'
    );
  });

  it('TIDAK mengirim URL halaman pembayaran milik Xendit', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    const isi = badan(panggilan[0].init);
    // Kolom ini milik alur tautan pembayaran milik Xendit. Mengirimnya pada mode
    // COMPONENTS berarti sebagian pembeli tetap bisa terlempar ke halaman
    // gerbang pembayaran, padahal seluruh titik mode ini adalah halaman sendiri.
    assert.ok(!('success_return_url' in isi));
    assert.ok(!('cancel_return_url' in isi));
  });
});

// ===========================================================================
// ORIGIN KOMPONEN PEMBAYARAN
// ===========================================================================
describe('APP_ORIGIN', () => {
  it('meneruskan origin https dari konfigurasi server', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    process.env.APP_ORIGIN = 'https://bayar.contoh.test:8443';
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    assert.deepEqual(badan(panggilan[0].init).components_configuration.origins, [
      'https://bayar.contoh.test:8443',
    ]);
  });

  const lokalDiterima = [
    ['localhost dengan port', 'http://localhost:4000'],
    ['127.0.0.1', 'http://127.0.0.1:4000'],
    ['IPv6 loopback', 'http://[::1]:4000'],
  ];

  for (const [judul, origin] of lokalDiterima) {
    it(`menerima http untuk host lokal di luar production: ${judul}`, async () => {
      const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
      process.env.APP_ORIGIN = origin;
      const { buatSesiPembayaran } = muat();

      await buatSesiPembayaran(inputSesi());

      assert.deepEqual(badan(panggilan[0].init).components_configuration.origins, [origin]);
    });
  }

  const originDitolak = [
    ['kosong', '', 'ORIGIN_BELUM_DIISI'],
    ['http bukan host lokal', 'http://contoh.test', 'ORIGIN_BUKAN_HTTPS'],
    ['http host mirip localhost', 'http://localhost.evil.example.com', 'ORIGIN_BUKAN_HTTPS'],
    ['javascript:', 'javascript:alert(1)', 'ORIGIN_BUKAN_HTTPS'],
    ['data:', 'data:text/html,<b>x</b>', 'ORIGIN_BUKAN_HTTPS'],
    ['berisi kredensial', 'https://pengguna:sandi@contoh.test', 'ORIGIN_BERISI_KREDENSIAL'],
    ['berisi username saja', 'https://pengguna@contoh.test', 'ORIGIN_BERISI_KREDENSIAL'],
    ['ada path', 'https://contoh.test/bayar', 'ORIGIN_BUKAN_ORIGIN'],
    ['ada query', 'https://contoh.test/?a=1', 'ORIGIN_BUKAN_ORIGIN'],
    ['ada fragmen', 'https://contoh.test/#x', 'ORIGIN_BUKAN_ORIGIN'],
    ['bukan URL', 'contoh.test', 'ORIGIN_TIDAK_VALID'],
  ];

  for (const [judul, origin, kodeGalat] of originDitolak) {
    it(`menolak origin ${judul} sebelum fetch`, async () => {
      const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
      process.env.APP_ORIGIN = origin;
      const { GalatXendit, buatSesiPembayaran } = muat();

      await assert.rejects(
        () => buatSesiPembayaran(inputSesi()),
        (error) => error instanceof GalatXendit && error.kodeGalat === kodeGalat
      );
      assert.equal(panggilan.length, 0, 'origin tidak sah tidak boleh sampai ke jaringan');
    });
  }

  it('menolak http lokal di production sebelum fetch', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    process.env.APP_ORIGIN = 'http://localhost:4000';
    process.env.NODE_ENV = 'production';
    const { GalatXendit, buatSesiPembayaran } = muat();

    await assert.rejects(
      () => buatSesiPembayaran(inputSesi()),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'ORIGIN_BUKAN_HTTPS'
    );
    assert.equal(panggilan.length, 0);
  });
});

// ===========================================================================
// REFERENCE
// ===========================================================================
describe('reference_id', () => {
  it('menerima 1 karakter', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk({ reference_id: 'a' }) }));
    const { buatSesiPembayaran } = muat();
    await buatSesiPembayaran(inputSesi({ referenceId: 'a' }));
    assert.equal(badan(panggilan[0].init).reference_id, 'a');
  });

  it('menerima 64 karakter (batas atas)', async () => {
    const ref = 'a'.repeat(64);
    const panggilan = pasangFetch(jawaban({ body: sesiOk({ reference_id: ref }) }));
    const { buatSesiPembayaran } = muat();
    await buatSesiPembayaran(inputSesi({ referenceId: ref }));
    assert.equal(badan(panggilan[0].init).reference_id, ref);
  });

  it('menolak reference kosong sebelum fetch', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { GalatXendit, buatSesiPembayaran } = muat();
    await assert.rejects(
      () => buatSesiPembayaran(inputSesi({ referenceId: '' })),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'REFERENCE_TIDAK_VALID'
    );
    assert.equal(panggilan.length, 0);
  });

  it('menolak reference 65 karakter sebelum fetch', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { GalatXendit, buatSesiPembayaran } = muat();
    await assert.rejects(
      () => buatSesiPembayaran(inputSesi({ referenceId: 'a'.repeat(65) })),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'REFERENCE_TIDAK_VALID'
    );
    assert.equal(panggilan.length, 0);
  });
});

// ===========================================================================
// BENTUK BADAN SESI
// ===========================================================================
describe('badan POST /sessions', () => {
  it('memakai mode COMPONENTS dengan konfigurasi komponen lengkap', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    const isi = badan(panggilan[0].init);
    assert.equal(isi.capture_method, 'AUTOMATIC');
    assert.equal(isi.allow_save_payment_method, 'DISABLED');
    assert.equal(isi.currency, 'IDR');
    assert.equal(isi.country, 'ID');
    assert.equal(isi.mode, 'COMPONENTS');
    assert.equal(isi.session_type, 'PAY');
    assert.deepEqual(isi.components_configuration, {
      origins: ['https://contoh.test'],
      return_url: 'https://contoh.test/pembayaran/selesai',
    });
  });

  it('mengembalikan components_sdk_key kepada pemanggil tanpa mengubah nilainya', async () => {
    pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    const sesi = await buatSesiPembayaran(inputSesi());

    assert.equal(sesi.components_sdk_key, sesiOk().components_sdk_key);
  });
});

// ===========================================================================
// KEDALUWARSA
// ===========================================================================
describe('expires_at', () => {
  it('mengirim waktu masa depan sebagai ISO 8601', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();
    const kapan = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await buatSesiPembayaran(inputSesi({ expiresAt: kapan }));

    assert.equal(badan(panggilan[0].init).expires_at, kapan.toISOString());
  });

  it('menolak waktu yang sudah lewat sebelum fetch', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { GalatXendit, buatSesiPembayaran } = muat();
    await assert.rejects(
      () => buatSesiPembayaran(inputSesi({ expiresAt: new Date(Date.now() - 1000) })),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'TENGGAT_SUDAH_LEWAT'
    );
    assert.equal(panggilan.length, 0);
  });

  it('menolak Date tidak sah (NaN) sebelum fetch', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { GalatXendit, buatSesiPembayaran } = muat();
    await assert.rejects(
      () => buatSesiPembayaran(inputSesi({ expiresAt: new Date('bukan tanggal') })),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'TENGGAT_TIDAK_VALID'
    );
    assert.equal(panggilan.length, 0);
  });
});

// ===========================================================================
// HOST
// ===========================================================================
describe('host tujuan', () => {
  it('memakai https://api.xendit.co bila XENDIT_API_BASE_URL tidak diisi', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    assert.ok(
      panggilan[0].url.startsWith('https://api.xendit.co/'),
      `URL tujuan tidak sesuai: ${panggilan[0].url}`
    );
  });

  for (const base of ['https://api.xendit.co', 'https://api.xendit.co/']) {
    it(`menerima XENDIT_API_BASE_URL resmi ${JSON.stringify(base)}`, async () => {
      process.env.XENDIT_API_BASE_URL = base;
      const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
      const { buatSesiPembayaran } = muat();

      await buatSesiPembayaran(inputSesi());

      // Satu garis miring saja, bukan `...co//sessions`.
      assert.equal(panggilan[0].url, 'https://api.xendit.co/sessions');
    });
  }

  const hostDitolak = [
    ['subdomain Xendit tidak resmi', 'https://api-sandbox.xendit.co', 'BASE_URL_BUKAN_HOST_XENDIT'],
    ['domain asing', 'https://evil.example.com', 'BASE_URL_BUKAN_HOST_XENDIT'],
    ['domain mirip (suffix)', 'https://api.xendit.co.evil.example.com', 'BASE_URL_BUKAN_HOST_XENDIT'],
    ['domain mirip (prefix)', 'https://api.xendit.co.id', 'BASE_URL_BUKAN_HOST_XENDIT'],
    ['domain mirip tanpa titik', 'https://notxendit.co', 'BASE_URL_BUKAN_HOST_XENDIT'],
    ['http tanpa TLS', 'http://api.xendit.co', 'BASE_URL_BUKAN_HTTPS'],
    ['berisi kredensial', 'https://pengguna:sandi@api.xendit.co', 'BASE_URL_BERISI_KREDENSIAL'],
    ['port khusus', 'https://api.xendit.co:8443', 'BASE_URL_TIDAK_VALID'],
    ['path', 'https://api.xendit.co/v2', 'BASE_URL_TIDAK_VALID'],
    ['query', 'https://api.xendit.co?tujuan=evil', 'BASE_URL_TIDAK_VALID'],
    ['fragment', 'https://api.xendit.co/#tujuan-evil', 'BASE_URL_TIDAK_VALID'],
    ['localhost', 'http://localhost:8080', 'BASE_URL_BUKAN_HTTPS'],
    ['bukan URL', 'api.xendit.co', 'BASE_URL_TIDAK_VALID'],
  ];

  for (const [judul, base, kodeGalat] of hostDitolak) {
    it(`menolak XENDIT_API_BASE_URL ${judul} sebelum fetch`, async () => {
      process.env.XENDIT_API_BASE_URL = base;
      const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
      const { GalatXendit, buatSesiPembayaran } = muat();

      await assert.rejects(
        () => buatSesiPembayaran(inputSesi()),
        (error) => error instanceof GalatXendit && error.kodeGalat === kodeGalat
      );
      assert.equal(panggilan.length, 0, `fetch dipanggil ke host tidak resmi: ${base}`);
    });
  }
});

// ===========================================================================
// PERILAKU JARINGAN
// ===========================================================================
describe('perilaku fetch', () => {
  it('melarang redirect diikuti otomatis (redirect: error)', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    assert.equal(
      panggilan[0].init.redirect,
      'error',
      'redirect harus "error": mengikuti 3xx bisa mengirim Authorization ke host lain'
    );
  });

  it('tidak menyimpan jawaban di cache', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    assert.equal(panggilan[0].init.cache, 'no-store');
  });

  it('memasang batas waktu (AbortSignal)', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    assert.ok(panggilan[0].init.signal, 'signal batas waktu wajib ada');
  });

  it('TIDAK mengulang permintaan saat jaringan gagal (JARINGAN_GAGAL)', async () => {
    const panggilan = pasangFetch(() => {
      throw new TypeError('fetch failed');
    });
    const { GalatXendit, buatSesiPembayaran } = muat();

    await assert.rejects(
      () => buatSesiPembayaran(inputSesi()),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'JARINGAN_GAGAL'
    );
    assert.equal(panggilan.length, 1, 'POST /sessions tidak boleh diulang otomatis');
  });

  it('TIDAK mengulang permintaan saat batas waktu tercapai (BATAS_WAKTU)', async () => {
    const panggilan = pasangFetch(() => {
      const galat = new Error('The operation was aborted due to timeout');
      galat.name = 'TimeoutError';
      throw galat;
    });
    const { GalatXendit, buatSesiPembayaran } = muat();

    await assert.rejects(
      () => buatSesiPembayaran(inputSesi()),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'BATAS_WAKTU'
    );
    assert.equal(panggilan.length, 1);
  });

  it('TIDAK mengulang saat badan jawaban terputus di tengah (JAWABAN_TERPUTUS)', async () => {
    const panggilan = pasangFetch(jawabanBadanHilang(200));
    const { GalatXendit, buatSesiPembayaran } = muat();

    await assert.rejects(
      () => buatSesiPembayaran(inputSesi()),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'JAWABAN_TERPUTUS'
    );
    assert.equal(
      panggilan.length,
      1,
      'badan yang hilang bukan alasan mengulang: sesi mungkin sudah terbuat'
    );
  });

  it('melempar JAWABAN_BUKAN_JSON untuk jawaban 200 bukan JSON', async () => {
    pasangFetch(jawaban({ status: 200, teks: '<html>proxy</html>' }));
    const { GalatXendit, buatSesiPembayaran } = muat();

    await assert.rejects(
      () => buatSesiPembayaran(inputSesi()),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'JAWABAN_BUKAN_JSON'
    );
  });

  it('TIDAK mengulang permintaan saat Xendit menjawab 5xx', async () => {
    const panggilan = pasangFetch(
      jawaban({ status: 503, body: { error_code: 'SERVER_ERROR', message: 'coba lagi' } })
    );
    const { buatSesiPembayaran } = muat();

    await assert.rejects(() => buatSesiPembayaran(inputSesi()));
    assert.equal(panggilan.length, 1);
  });

  it('memasang HTTP Basic dengan kunci sebagai username dan password kosong', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    const auth = headerPeta(panggilan[0].init).authorization;
    assert.ok(auth && auth.startsWith('Basic '), 'header Authorization Basic wajib ada');
    assert.equal(Buffer.from(auth.slice(6), 'base64').toString('utf8'), `${KUNCI_PALSU}:`);
  });
});

// ===========================================================================
// IDEMPOTENCY
// ===========================================================================
describe('idempotency', () => {
  it('TIDAK mengirim idempotency-key pada POST /sessions (tidak didokumentasikan Xendit)', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    await buatSesiPembayaran(inputSesi());

    const header = headerPeta(panggilan[0].init);
    assert.equal(
      header['idempotency-key'],
      undefined,
      'header idempotency-key pada /sessions memberi rasa aman yang tidak dijamin Xendit'
    );
    assert.equal(header['x-idempotency-key'], undefined);
  });

  it('mengirim idempotency-key pada POST /customers', async () => {
    const panggilan = pasangFetch(jawaban({ body: CUSTOMER_OK }));
    const { pastikanCustomer } = muat();

    await pastikanCustomer(inputCustomer());

    assert.equal(headerPeta(panggilan[0].init)['idempotency-key'], 'customer-user_01HZ');
  });

  it('kunci idempotency customer stabil antar panggilan untuk reference yang sama', async () => {
    const panggilan = pasangFetch(jawaban({ body: CUSTOMER_OK }));
    const { pastikanCustomer } = muat();

    await pastikanCustomer(inputCustomer());
    await pastikanCustomer(inputCustomer({ nama: 'Nama Berbeda' }));

    const a = headerPeta(panggilan[0].init)['idempotency-key'];
    const b = headerPeta(panggilan[1].init)['idempotency-key'];
    assert.equal(a, b);
  });
});

// ===========================================================================
// CUSTOMER: 409 DAN PENCARIAN
// ===========================================================================
describe('pastikanCustomer pada 409', () => {
  it('mencari berdasarkan reference yang sama dan memakai hasilnya', async () => {
    const panggilan = pasangFetch((rekaman) => {
      if (rekaman.init.method === 'POST') {
        return jawaban({
          status: 409,
          body: { error_code: 'DUPLICATE_ERROR', message: 'sudah ada' },
        });
      }
      return jawaban({ body: { data: [CUSTOMER_OK] } });
    });
    const { pastikanCustomer } = muat();

    const hasil = await pastikanCustomer(inputCustomer());

    assert.equal(hasil.id, CUSTOMER_OK.id);
    assert.equal(panggilan.length, 2);
    assert.ok(
      panggilan[1].url.includes(`reference_id=${encodeURIComponent('user_01HZ')}`),
      `pencarian harus memakai reference persis: ${panggilan[1].url}`
    );
  });

  it('menolak customer yang reference_id-nya BERBEDA dari yang dicari', async () => {
    pasangFetch((rekaman) => {
      if (rekaman.init.method === 'POST') {
        return jawaban({
          status: 409,
          body: { error_code: 'DUPLICATE_ERROR', message: 'sudah ada' },
        });
      }
      // Xendit (atau perantara) menjawab dengan customer milik orang lain.
      return jawaban({ body: { data: [{ id: 'cus-orang-lain', reference_id: 'user_LAIN' }] } });
    });
    const { pastikanCustomer } = muat();

    await assert.rejects(
      () => pastikanCustomer(inputCustomer()),
      'customer orang lain tidak boleh dipakai untuk membayar'
    );
  });

  it('cariCustomer menyaring hasil dan hanya menerima reference_id yang persis sama', async () => {
    pasangFetch(
      jawaban({
        body: {
          data: [
            { id: 'cus-salah', reference_id: 'user_01HZ_suffix' },
            CUSTOMER_OK,
            { id: 'cus-juga-salah', reference_id: 'USER_01HZ' },
          ],
        },
      })
    );
    const { cariCustomer } = muat();

    const hasil = await cariCustomer('user_01HZ');
    assert.deepEqual(hasil, CUSTOMER_OK);
  });

  it('cariCustomer memberi null bila tidak ada reference_id yang persis sama', async () => {
    pasangFetch(jawaban({ body: { data: [{ id: 'cus-salah', reference_id: 'user_01HZ ' }] } }));
    const { cariCustomer } = muat();

    assert.equal(await cariCustomer('user_01HZ'), null);
  });

  it('melempar bila pencarian tidak menemukan apa pun', async () => {
    pasangFetch((rekaman) =>
      rekaman.init.method === 'POST'
        ? jawaban({ status: 409, body: { error_code: 'DUPLICATE_ERROR', message: 'sudah ada' } })
        : jawaban({ body: { data: [] } })
    );
    const { pastikanCustomer } = muat();

    await assert.rejects(() => pastikanCustomer(inputCustomer()));
  });

  it('tidak mencari-cari pada galat selain 409', async () => {
    const panggilan = pasangFetch(
      jawaban({ status: 400, body: { error_code: 'API_VALIDATION_ERROR', message: 'salah' } })
    );
    const { pastikanCustomer } = muat();

    await assert.rejects(() => pastikanCustomer(inputCustomer()));
    assert.equal(panggilan.length, 1);
  });
});

// ===========================================================================
// SANITASI given_names DAN NOMOR HP
// ===========================================================================
describe('given_names', () => {
  const E164 = /^\+[1-9]\d{7,14}$/;

  async function kirimCustomer(ganti) {
    const panggilan = pasangFetch(jawaban({ body: CUSTOMER_OK }));
    const { pastikanCustomer } = muat();
    await pastikanCustomer(inputCustomer(ganti));
    return badan(panggilan[0].init);
  }

  it('hanya mengirim huruf, angka, dan spasi ASCII', async () => {
    const isi = await kirimCustomer({ nama: 'Budi <script>alert(1)</script> Santoso' });
    const nama = isi.individual_detail.given_names;
    assert.match(nama, /^[A-Za-z0-9 ]+$/, `given_names belum bersih: ${JSON.stringify(nama)}`);
    assert.ok(!nama.includes('<'));
    assert.ok(!nama.includes('('));
  });

  it('membuang karakter non-ASCII', async () => {
    const isi = await kirimCustomer({ nama: 'Bimo Kharismantörö 日本語' });
    assert.match(isi.individual_detail.given_names, /^[A-Za-z0-9 ]+$/);
  });

  it('membuang karakter kontrol dan baris baru', async () => {
    const isi = await kirimCustomer({ nama: 'Budi\r\nX-Injected: 1\tSantoso' });
    const nama = isi.individual_detail.given_names;
    assert.match(nama, /^[A-Za-z0-9 ]+$/);
    assert.ok(!/[\r\n\t]/.test(nama));
  });

  it('memotong pada 255 karakter', async () => {
    const isi = await kirimCustomer({ nama: 'a'.repeat(400) });
    assert.ok(
      isi.individual_detail.given_names.length <= 255,
      `panjang ${isi.individual_detail.given_names.length} melewati 255`
    );
  });

  it('memakai "Pelanggan" bila nama null', async () => {
    const isi = await kirimCustomer({ nama: null });
    assert.equal(isi.individual_detail.given_names, 'Pelanggan');
  });

  it('memakai "Pelanggan" bila nama hanya spasi', async () => {
    const isi = await kirimCustomer({ nama: '    ' });
    assert.equal(isi.individual_detail.given_names, 'Pelanggan');
  });

  it('memakai "Pelanggan" bila semua karakter nama terbuang', async () => {
    const isi = await kirimCustomer({ nama: '!!!@#$%^&*()' });
    assert.equal(isi.individual_detail.given_names, 'Pelanggan');
  });

  it('meneruskan nomor E.164 yang sah', async () => {
    const isi = await kirimCustomer({ nomorHp: '+6281234567890' });
    assert.equal(isi.mobile_number, '+6281234567890');
  });

  it('meneruskan nomor E.164 terpendek yang sah (8 digit setelah +)', async () => {
    const isi = await kirimCustomer({ nomorHp: '+62812345' });
    assert.equal(isi.mobile_number, '+62812345');
  });

  const hpDinormalisasi = [
    ['format lokal', '08123456789', '+628123456789'],
    ['tanpa tanda plus', '628123456789', '+628123456789'],
    ['berawalan 8', '8123456789', '+628123456789'],
    ['spasi dan tanda hubung', '+62 812-3456-7890', '+6281234567890'],
    ['kurung dan titik', '0812.3456 (7890)', '+6281234567890'],
  ];

  for (const [judul, nomor, harapan] of hpDinormalisasi) {
    it(`menormalisasi mobile_number untuk nomor ${judul}`, async () => {
      const isi = await kirimCustomer({ nomorHp: nomor });
      assert.equal(isi.mobile_number, harapan);
    });
  }

  const hpDitolak = [
    ['tanpa + dan bukan angka', 'nomor saya'],
    ['dimulai nol setelah +', '+0123456789'],
    ['terlalu pendek (7 digit)', '+6281234'],
    ['terlalu panjang (16 digit)', '+6212345678901234'],
    ['hanya tanda +', '+'],
    ['ada huruf', '+62812ABC4567'],
    ['ada simbol tak dikenal', '0812/3456/7890'],
    ['kosong', ''],
    ['null', null],
  ];

  for (const [judul, nomor] of hpDitolak) {
    it(`tidak mengirim mobile_number untuk nomor ${judul}`, async () => {
      const isi = await kirimCustomer({ nomorHp: nomor });
      if ('mobile_number' in isi) {
        assert.match(
          isi.mobile_number,
          E164,
          `nomor tidak sah ikut terkirim: ${JSON.stringify(isi.mobile_number)}`
        );
      }
      assert.ok(
        !('mobile_number' in isi),
        `mobile_number seharusnya dihilangkan untuk ${JSON.stringify(nomor)}`
      );
    });
  }
});

// ===========================================================================
// KEBOCORAN RAHASIA
// ===========================================================================
describe('galat tidak membocorkan apa pun', () => {
  function semuaTeks(galat) {
    const bagian = [
      String(galat && galat.message),
      String(galat && galat.stack),
      (() => {
        try {
          return JSON.stringify(galat, Object.getOwnPropertyNames(galat || {}));
        } catch {
          return '';
        }
      })(),
      (() => {
        try {
          return require('node:util').inspect(galat, { depth: 6 });
        } catch {
          return '';
        }
      })(),
    ];
    return bagian.join('\n');
  }

  it('kunci rahasia tidak pernah muncul di galat 401', async () => {
    pasangFetch(
      jawaban({
        status: 401,
        body: {
          error_code: 'INVALID_API_KEY',
          message: `Kunci ${KUNCI_PALSU} ditolak. jejak-internal-rahasia-xyz`,
        },
      })
    );
    const { buatSesiPembayaran } = muat();

    const galat = await buatSesiPembayaran(inputSesi()).then(
      () => null,
      (e) => e
    );
    assert.ok(galat, 'seharusnya melempar');
    const teks = semuaTeks(galat);
    assert.ok(!teks.includes(KUNCI_PALSU), 'kunci rahasia bocor ke galat');
    assert.ok(
      !teks.includes('jejak-internal-rahasia-xyz'),
      'response.message mentah bocor ke galat'
    );
  });

  it('response.message mentah tidak diteruskan pada galat 400', async () => {
    pasangFetch(
      jawaban({
        status: 400,
        body: { error_code: 'API_VALIDATION_ERROR', message: 'PESAN-MENTAH-DARI-XENDIT' },
      })
    );
    const { buatSesiPembayaran } = muat();

    const galat = await buatSesiPembayaran(inputSesi()).then(
      () => null,
      (e) => e
    );
    assert.ok(galat);
    assert.ok(
      !semuaTeks(galat).includes('PESAN-MENTAH-DARI-XENDIT'),
      'pesan dari pihak ketiga tidak boleh masuk galat kita apa adanya'
    );
  });

  it('isi jawaban bukan JSON tidak diteruskan ke galat', async () => {
    pasangFetch(
      jawaban({
        status: 502,
        teks: '<html>Proxy Error set-cookie: sesi-proxy-RAHASIA</html>',
      })
    );
    const { buatSesiPembayaran } = muat();

    const galat = await buatSesiPembayaran(inputSesi()).then(
      () => null,
      (e) => e
    );
    assert.ok(galat);
    const teks = semuaTeks(galat);
    assert.ok(!teks.includes('sesi-proxy-RAHASIA'));
    assert.ok(!teks.includes('<html>'));
  });

  it('KUNCI_BELUM_DIISI dan tidak ada fetch bila env kunci kosong', async () => {
    delete process.env.XENDIT_SECRET_KEY;
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { GalatXendit, buatSesiPembayaran } = muat();

    await assert.rejects(
      () => buatSesiPembayaran(inputSesi()),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'KUNCI_BELUM_DIISI'
    );
    assert.equal(panggilan.length, 0);
  });

  it('pesan galat selalu berbentuk "Xendit menolak permintaan (<kode>)"', async () => {
    pasangFetch(
      jawaban({
        status: 400,
        body: { error_code: 'API_VALIDATION_ERROR', message: 'rahasia-jangan-bocor' },
      })
    );
    const { GalatXendit, buatSesiPembayaran } = muat();

    const galat = await buatSesiPembayaran(inputSesi()).then(
      () => null,
      (e) => e
    );
    assert.ok(galat instanceof GalatXendit);
    assert.equal(galat.status, 400);
    assert.equal(galat.kodeGalat, 'API_VALIDATION_ERROR');
    assert.equal(galat.message, 'Xendit menolak permintaan (API_VALIDATION_ERROR).');
  });

  it('console.error menyamarkan kunci rahasia yang ikut pada pesan Xendit', async () => {
    pasangFetch(
      jawaban({
        status: 401,
        body: { error_code: 'INVALID_API_KEY', message: `Kunci ${KUNCI_PALSU} ditolak` },
      })
    );
    const { buatSesiPembayaran } = muat();

    const errorAsli = console.error;
    const tercatat = [];
    console.error = (...arg) => tercatat.push(arg.map((x) => String(x)).join(' '));
    try {
      await buatSesiPembayaran(inputSesi()).catch(() => {});
    } finally {
      console.error = errorAsli;
    }

    const semua = tercatat.join('\n');
    assert.ok(!semua.includes(KUNCI_PALSU), 'kunci rahasia bocor ke console.error');
    assert.ok(
      semua.includes('[KUNCI_DISAMARKAN]'),
      `penyamaran tidak terlihat di log: ${JSON.stringify(semua)}`
    );
  });

  it('kunci rahasia tidak ikut pada galat jaringan', async () => {
    pasangFetch(() => {
      throw new TypeError(`fetch failed ke ${KUNCI_PALSU}`);
    });
    const { buatSesiPembayaran } = muat();

    const galat = await buatSesiPembayaran(inputSesi()).then(
      () => null,
      (e) => e
    );
    assert.ok(galat);
    assert.ok(!semuaTeks(galat).includes(KUNCI_PALSU), 'kunci bocor lewat galat jaringan');
  });
});

// ===========================================================================
// TOKEN WEBHOOK
// ===========================================================================
describe('tokenWebhookCocok', () => {
  it('true untuk token yang benar', () => {
    const { tokenWebhookCocok } = muat();
    assert.equal(tokenWebhookCocok(TOKEN_PALSU), true);
  });

  it('false untuk token null', () => {
    const { tokenWebhookCocok } = muat();
    assert.equal(tokenWebhookCocok(null), false);
  });

  it('false untuk token kosong', () => {
    const { tokenWebhookCocok } = muat();
    assert.equal(tokenWebhookCocok(''), false);
  });

  it('false untuk token salah dengan panjang SAMA', () => {
    const { tokenWebhookCocok } = muat();
    const salah = 'X'.repeat(TOKEN_PALSU.length);
    assert.equal(salah.length, TOKEN_PALSU.length);
    assert.equal(tokenWebhookCocok(salah), false);
  });

  it('false untuk token salah dengan panjang BERBEDA', () => {
    const { tokenWebhookCocok } = muat();
    assert.equal(tokenWebhookCocok(TOKEN_PALSU + 'lebihpanjang'), false);
    assert.equal(tokenWebhookCocok(TOKEN_PALSU.slice(0, -3)), false);
  });

  it('false untuk awalan token yang benar (bukan cocok sebagian)', () => {
    const { tokenWebhookCocok } = muat();
    assert.equal(tokenWebhookCocok(TOKEN_PALSU.slice(0, 5)), false);
  });

  it('false bila XENDIT_CALLBACK_TOKEN belum diisi, meski token dikirim', () => {
    delete process.env.XENDIT_CALLBACK_TOKEN;
    const { tokenWebhookCocok } = muat();
    assert.equal(tokenWebhookCocok('apa pun'), false);
    assert.equal(tokenWebhookCocok(''), false);
    assert.equal(tokenWebhookCocok(null), false);
  });

});

// ===========================================================================
// AMBIL SESI
// ===========================================================================
describe('ambilSesi', () => {
  it('menolak sessionId kosong sebelum fetch', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { GalatXendit, ambilSesi } = muat();

    await assert.rejects(
      () => ambilSesi(''),
      (error) => error instanceof GalatXendit && error.kodeGalat === 'SESSION_ID_KOSONG'
    );
    assert.equal(panggilan.length, 0);
  });

  it('meneruskan sessionId berisi spasi setelah di-encode', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { ambilSesi } = muat();

    await ambilSesi('   ');
    assert.ok(panggilan[0].url.endsWith('/sessions/%20%20%20'));
  });


  it('meng-encode sessionId pada jalur URL', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { ambilSesi } = muat();

    await ambilSesi('ps 1/../customers');

    assert.ok(
      !panggilan[0].url.includes('/../'),
      `jalur tidak di-encode, bisa keluar dari /sessions: ${panggilan[0].url}`
    );
    assert.ok(panggilan[0].url.includes('/sessions/'));
  });

  it('memakai GET dan tidak membawa badan', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { ambilSesi } = muat();

    await ambilSesi('ps-1');

    assert.equal(panggilan[0].init.method, 'GET');
    assert.equal(panggilan[0].init.body, undefined);
  });

  it('tidak mengulang saat gagal', async () => {
    const panggilan = pasangFetch(() => {
      throw new TypeError('fetch failed');
    });
    const { ambilSesi } = muat();

    await assert.rejects(() => ambilSesi('ps-1'));
    assert.equal(panggilan.length, 1);
  });

  it('membaca sesi COMPLETED tanpa menuntut kunci SDK maupun tenggat', async () => {
    pasangFetch(
      jawaban({
        body: sesiOk({
          status: 'COMPLETED',
          expires_at: new Date(Date.now() - 1000).toISOString(),
          components_sdk_key: null,
          payment_id: 'pay-xnd-1',
        }),
      })
    );
    const { ambilSesi } = muat();

    const sesi = await ambilSesi('ps-1');

    assert.equal(sesi.status, 'COMPLETED');
    assert.equal(sesi.components_sdk_key, null);
    assert.equal(sesi.payment_id, 'pay-xnd-1');
  });
});

// ===========================================================================
// VALIDASI JAWABAN SESI
// ===========================================================================
//
// `panggilXendit` ditutup dengan `data as T` — cast, bukan pemeriksaan. Tanpa
// suite ini, jawaban berbentuk lain (proxy yang menyisip, kontrak API yang
// berubah, sesi milik tagihan lain) lolos sebagai "sukses" dan baris Payment
// ditautkan ke sesi yang salah.
describe('validasi jawaban POST /sessions', () => {
  const jawabanDitolak = [
    ['bukan objek', 'bukan-json-objek'],
    ['null', null],
    ['payment_session_id hilang', sesiOk({ payment_session_id: undefined })],
    ['payment_session_id kosong', sesiOk({ payment_session_id: '' })],
    ['status hilang', sesiOk({ status: undefined })],
    ['reference_id hilang', sesiOk({ reference_id: undefined })],
    ['reference_id milik tagihan lain', sesiOk({ reference_id: 'pay_ORANG_LAIN' })],
    ['customer_id milik orang lain', sesiOk({ customer_id: 'cust_ORANG_LAIN' })],
    ['customer_id hilang', sesiOk({ customer_id: undefined })],
    ['amount berbeda dari yang dikirim', sesiOk({ amount: 1 })],
    ['amount sebagai string', sesiOk({ amount: '1500000' })],
    ['amount NaN', sesiOk({ amount: Number.NaN })],
    ['mode bukan COMPONENTS', sesiOk({ mode: 'PAYMENT_LINK' })],
    ['mode hilang', sesiOk({ mode: undefined })],
    ['status bukan ACTIVE', sesiOk({ status: 'EXPIRED' })],
    ['components_sdk_key hilang', sesiOk({ components_sdk_key: undefined })],
    ['components_sdk_key kosong', sesiOk({ components_sdk_key: '' })],
    ['components_sdk_key null', sesiOk({ components_sdk_key: null })],
    ['expires_at hilang', sesiOk({ expires_at: undefined })],
    ['expires_at bukan tanggal', sesiOk({ expires_at: 'kapan-kapan' })],
    ['expires_at sudah lewat', sesiOk({ expires_at: new Date(Date.now() - 1000).toISOString() })],
  ];

  for (const [judul, body] of jawabanDitolak) {
    it(`menolak sesi baru dengan ${judul}`, async () => {
      pasangFetch(jawaban({ body }));
      const { GalatXendit, buatSesiPembayaran } = muat();

      await assert.rejects(
        () => buatSesiPembayaran(inputSesi()),
        (error) => error instanceof GalatXendit && error.kodeGalat === 'SESI_TIDAK_SESUAI'
      );
    });
  }

  it('galat penolakan tidak memuat kunci SDK dari jawaban', async () => {
    const kunciSdk = 'csk-BOCOR-JANGAN-DICATAT';
    pasangFetch(jawaban({ body: sesiOk({ status: 'EXPIRED', components_sdk_key: kunciSdk }) }));
    const { buatSesiPembayaran } = muat();

    const galat = await buatSesiPembayaran(inputSesi()).then(
      () => null,
      (error) => error
    );

    assert.ok(galat, 'sesi EXPIRED harus ditolak');
    assert.ok(
      !galat.message.includes(kunciSdk),
      `kunci SDK ikut pada pesan galat: ${galat.message}`
    );
  });

  it('meneruskan nilai jawaban yang sah tanpa mengubahnya', async () => {
    pasangFetch(jawaban({ body: sesiOk() }));
    const { buatSesiPembayaran } = muat();

    const sesi = await buatSesiPembayaran(inputSesi());

    assert.equal(sesi.payment_session_id, 'ps-1');
    assert.equal(sesi.status, 'ACTIVE');
    assert.equal(sesi.mode, 'COMPONENTS');
    assert.equal(sesi.reference_id, 'pay_01HZ');
    assert.equal(sesi.customer_id, 'cust_01HZ');
    assert.equal(sesi.amount, 1500000);
  });
});

// ===========================================================================
// PEMULIHAN SESI AKTIF
// ===========================================================================
describe('ambilSesiAktifUntukKomponen', () => {
  const harapan = { referenceId: 'pay_01HZ', customerId: 'cust_01HZ', nominal: 1500000 };

  it('membedakan sesi aktif dan menjamin kunci SDK serta tenggatnya', async () => {
    pasangFetch(jawaban({ body: sesiOk() }));
    const { ambilSesiAktifUntukKomponen } = muat();

    const hasil = await ambilSesiAktifUntukKomponen('ps-1', harapan);

    assert.equal(hasil.keadaan, 'AKTIF');
    assert.equal(hasil.sesi.components_sdk_key, 'csk-palsu-untuk-tes');
    assert.equal(typeof hasil.sesi.expires_at, 'string');
  });

  // Adanya uang selalu menang atas status lain. Webhook bisa belum tiba ketika
  // browser sudah menyelesaikan pembayaran; keadaan ini tidak pernah memberi izin
  // membuka tagihan pengganti.
  const sudahDibayar = [
    ['status COMPLETED', sesiOk({ status: 'COMPLETED' })],
    ['payment_id sudah ada', sesiOk({ status: 'EXPIRED', payment_id: 'pay-xnd-1' })],
  ];

  for (const [judul, body] of sudahDibayar) {
    it(`memberi DIBAYAR bila ${judul}`, async () => {
      pasangFetch(jawaban({ body }));
      const { ambilSesiAktifUntukKomponen } = muat();

      const hasil = await ambilSesiAktifUntukKomponen('ps-1', harapan);
      assert.equal(hasil.keadaan, 'DIBAYAR');
    });
  }

  const terbuktiMati = [
    ['status EXPIRED', sesiOk({ status: 'EXPIRED' })],
    ['status CANCELED', sesiOk({ status: 'CANCELED' })],
    ['status CANCELLED', sesiOk({ status: 'CANCELLED' })],
    [
      'tenggat sudah lewat lebih dari masa tenang',
      sesiOk({
        status: 'ACTIVE',
        expires_at: new Date(Date.now() - 10 * 60 * 1000 - 1000).toISOString(),
      }),
    ],
  ];

  for (const [judul, body] of terbuktiMati) {
    it(`memberi MATI bila ${judul}`, async () => {
      pasangFetch(jawaban({ body }));
      const { ambilSesiAktifUntukKomponen } = muat();

      const hasil = await ambilSesiAktifUntukKomponen('ps-1', harapan);
      assert.equal(hasil.keadaan, 'MATI');
    });
  }

  // Tidak bisa dipakai belum tentu aman diganti. Status atau bentuk yang tidak
  // dikenal harus gagal tertutup agar perubahan kontrak gerbang tidak berubah
  // menjadi izin menagih pembeli dua kali.
  const belumPasti = [
    ['kunci SDK sudah tidak ada', sesiOk({ components_sdk_key: null })],
    ['mode bukan COMPONENTS', sesiOk({ mode: 'PAYMENT_LINK' })],
    ['status tidak dikenal', sesiOk({ status: 'PROCESSING' })],
    [
      'tenggat baru saja lewat',
      sesiOk({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    ],
    ['tenggat bukan tanggal', sesiOk({ expires_at: 'kapan-kapan' })],
    ['tenggat hilang', sesiOk({ expires_at: undefined })],
  ];

  for (const [judul, body] of belumPasti) {
    it(`memberi TIDAK_PASTI bila ${judul}`, async () => {
      pasangFetch(jawaban({ body }));
      const { ambilSesiAktifUntukKomponen } = muat();

      const hasil = await ambilSesiAktifUntukKomponen('ps-1', harapan);
      assert.equal(hasil.keadaan, 'TIDAK_PASTI');
    });
  }

  // Identitas yang tidak cocok BUKAN "sesi tidak bisa dipakai" — ia berarti
  // jawabannya milik tagihan lain. Memberi `null` di sini akan menyembunyikan
  // kekeliruan itu di balik pembuatan sesi baru yang terlihat normal.
  const melempar = [
    ['reference milik tagihan lain', sesiOk({ reference_id: 'pay_LAIN' })],
    ['customer milik orang lain', sesiOk({ customer_id: 'cust_LAIN' })],
    ['nominal berbeda', sesiOk({ amount: 1 })],
  ];

  for (const [judul, body] of melempar) {
    it(`melempar bila ${judul}`, async () => {
      pasangFetch(jawaban({ body }));
      const { GalatXendit, ambilSesiAktifUntukKomponen } = muat();

      await assert.rejects(
        () => ambilSesiAktifUntukKomponen('ps-1', harapan),
        (error) => error instanceof GalatXendit && error.kodeGalat === 'SESI_TIDAK_SESUAI'
      );
    });
  }

  it('memakai GET tanpa badan dan meng-encode sessionId', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { ambilSesiAktifUntukKomponen } = muat();

    await ambilSesiAktifUntukKomponen('ps 1/../customers', harapan);

    assert.equal(panggilan[0].init.method, 'GET');
    assert.equal(panggilan[0].init.body, undefined);
    assert.ok(!panggilan[0].url.includes('/../'), `jalur tidak di-encode: ${panggilan[0].url}`);
  });

  it('menolak nominal tidak sah sebelum fetch', async () => {
    const panggilan = pasangFetch(jawaban({ body: sesiOk() }));
    const { GalatXendit, ambilSesiAktifUntukKomponen } = muat();

    await assert.rejects(
      () => ambilSesiAktifUntukKomponen('ps-1', { ...harapan, nominal: 0 }),
      (error) => error instanceof GalatXendit
    );
    assert.equal(panggilan.length, 0);
  });
});

// ===========================================================================
// ORKESTRASI SESI: LEASE, PENGGANTIAN, DAN BATAS KEWENANGAN BROWSER
// ===========================================================================
// Test HTTP di atas membuktikan kontrak gerbang. Suite ini membuktikan urutan
// yang lebih penting: claim sebelum POST, HTTP di luar transaksi, dan kunci SDK
// baru pulang sesudah `providerSessionId` tersimpan.
describe('siapkanSesiPembayaran', () => {
  const { Prisma, PaymentStatus, PaymentTujuan, BookingStatus } = require('@prisma/client');
  const SEKARANG = new Date('2026-09-26T09:00:00.000Z');
  const TENGGAT = new Date(SEKARANG.getTime() + 60 * 60 * 1000);
  const MASUK = { bookingId: 'booking-1', userId: 'user-1' };

  // `sesi-pembayaran.ts` memakai `instanceof GalatXendit`. Muat service sesudah
  // instance `xendit.ts` segar supaya galat palsu dan service memakai konstruktor
  // kelas yang sama.
  function muatService() {
    const xendit = muat();
    delete require.cache[require.resolve(JALUR_SESI_PEMBAYARAN)];
    return { ...xendit, ...require(JALUR_SESI_PEMBAYARAN) };
  }

  function buatPayment(ganti = {}) {
    return {
      id: 'pay-1',
      bookingId: 'booking-1',
      tujuan: PaymentTujuan.FULL,
      status: PaymentStatus.PENDING,
      jumlah: new Prisma.Decimal('1500000'),
      providerReferenceId: null,
      providerSessionId: null,
      expiresAt: null,
      sesiClaimToken: null,
      sesiClaimedAt: null,
      sesiClaimExpiresAt: null,
      createdAt: new Date('2026-09-26T08:00:00.000Z'),
      ...ganti,
    };
  }

  function cocok(row, where) {
    if (!where) return true;
    for (const [nama, syarat] of Object.entries(where)) {
      if (nama === 'OR') {
        if (!syarat.some((bagian) => cocok(row, bagian))) return false;
      } else if (
        syarat &&
        typeof syarat === 'object' &&
        !(syarat instanceof Date) &&
        Object.hasOwn(syarat, 'lte')
      ) {
        if (!(row[nama] instanceof Date) || row[nama].getTime() > syarat.lte.getTime()) return false;
      } else if (row[nama] !== syarat) {
        return false;
      }
    }
    return true;
  }

  /**
   * Database stateful, bukan mock nilai berurutan. Ia memberi test perlombaan
   * claim dan rollback transaksi bentuk yang sama seperti database sungguhan.
   */
  function buatFake(options = {}) {
    let rows = (options.payments ?? [buatPayment()]).map((row) => ({ ...row }));
    const booking = {
      id: 'booking-1',
      status: BookingStatus.PENDING_PAYMENT,
      expiresAt: TENGGAT,
      ...(options.booking ?? {}),
    };
    const user = {
      id: 'user-1',
      email: 'pembeli@contoh.test',
      name: 'Budi Santoso',
      whatsapp: '081234567890',
      xenditCustomerId: 'cust-1',
      ...(options.user ?? {}),
    };
    const calls = [];
    const gerbangCalls = { ambil: [], buat: [], customer: [] };
    let transaksiAktif = false;
    let nomorPayment = 2;

    function tabel(ambilRows, simpanRows, nama) {
      return {
        async findFirst(args) {
          calls.push(`${nama}.findFirst`);
          return ambilRows().find((row) => cocok(row, args.where)) ?? null;
        },
        async updateMany(args) {
          calls.push(`${nama}.updateMany`);
          let count = 0;
          simpanRows(
            ambilRows().map((row) => {
              if (!cocok(row, args.where)) return row;
              count += 1;
              return { ...row, ...args.data };
            })
          );
          return { count };
        },
        async create(args) {
          calls.push(`${nama}.create`);
          if (typeof options.gagalCreate === 'function') throw options.gagalCreate();
          if (options.gagalCreate) throw options.gagalCreate;
          const data = args.data;
          const kini = ambilRows();
          if (
            data.status === PaymentStatus.PENDING &&
            kini.some(
              (row) =>
                row.bookingId === data.bookingId &&
                row.tujuan === data.tujuan &&
                row.status === PaymentStatus.PENDING
            )
          ) {
            throw new Error('indeks tagihan menganggur dilanggar');
          }
          const baru = buatPayment({
            ...data,
            id: `pay-${nomorPayment++}`,
            createdAt: new Date(SEKARANG.getTime() + nomorPayment),
          });
          simpanRows([...kini, baru]);
          return baru;
        },
      };
    }

    const db = {
      booking: {
        async findFirst() {
          calls.push('booking.findFirst');
          if (options.bookingHilang) return null;
          return {
            ...booking,
            payments: rows.filter((row) => row.status === PaymentStatus.PENDING),
          };
        },
      },
      user: {
        async findUnique() {
          calls.push('user.findUnique');
          return options.userHilang ? null : { ...user };
        },
        async updateMany(args) {
          calls.push('user.updateMany');
          if (user.xenditCustomerId !== null) return { count: 0 };
          user.xenditCustomerId = args.data.xenditCustomerId;
          return { count: 1 };
        },
      },
      payment: tabel(
        () => rows,
        (nilai) => {
          rows = nilai;
        },
        'payment'
      ),
      async $transaction(kerja) {
        calls.push('transaction.begin');
        assert.equal(transaksiAktif, false, 'transaksi tidak boleh bertumpuk');
        const sebelum = rows;
        let salinan = rows.map((row) => ({ ...row }));
        transaksiAktif = true;
        try {
          const hasil = await kerja({
            payment: tabel(
              () => salinan,
              (nilai) => {
                salinan = nilai;
              },
              'tx.payment'
            ),
          });
          rows = salinan;
          calls.push('transaction.commit');
          return hasil;
        } catch (error) {
          rows = sebelum;
          calls.push('transaction.rollback');
          throw error;
        } finally {
          transaksiAktif = false;
        }
      },
    };

    const gerbang = {
      async pastikanCustomer(arg) {
        assert.equal(transaksiAktif, false, 'HTTP customer tidak boleh di dalam transaksi');
        gerbangCalls.customer.push(arg);
        return { id: 'cust-baru', reference_id: arg.referenceId };
      },
      async ambilSesiAktifUntukKomponen(sessionId, harapan) {
        assert.equal(transaksiAktif, false, 'GET sesi tidak boleh di dalam transaksi');
        gerbangCalls.ambil.push({ sessionId, harapan });
        if (options.ambilSesi) return options.ambilSesi(sessionId, harapan);
        return {
          keadaan: 'AKTIF',
          sesi: sesiOk({
            payment_session_id: sessionId,
            reference_id: harapan.referenceId,
            customer_id: harapan.customerId,
            amount: harapan.nominal,
          }),
        };
      },
      async buatSesiPembayaran(arg) {
        assert.equal(transaksiAktif, false, 'POST /sessions tidak boleh di dalam transaksi');
        calls.push('gerbang.buat');
        gerbangCalls.buat.push(arg);
        if (options.buatSesi) return options.buatSesi(arg, { rows });
        return sesiOk({
          payment_session_id: 'ps-baru',
          reference_id: arg.referenceId,
          customer_id: arg.customerId,
          amount: arg.jumlah,
        });
      },
    };

    return {
      deps: {
        db,
        gerbang,
        sekarang: options.sekarang ?? (() => new Date(SEKARANG)),
        tokenBaru: options.tokenBaru ?? (() => 'claim-1'),
      },
      calls,
      gerbangCalls,
      rows: () => rows.map((row) => ({ ...row })),
      // Untuk memerankan baris yang DIBUAT permintaan lain dan sudah commit di
      // luar transaksi yang sedang berjalan di sini.
      sisipkanRow: (row) => {
        rows = [...rows, { ...row }];
      },
    };
  }

  async function dapatGalat(janji) {
    try {
      await janji;
      return null;
    } catch (error) {
      return error;
    }
  }

  // Penolakan awal dibuktikan di service, bukan hanya di route. Test route
  // memalsukan service, jadi ia hanya membuktikan pemetaan HTTP; yang penting di
  // sini: pesanan orang lain, status salah, dan tenggat lewat TIDAK PERNAH
  // membuka sesi di gerbang pembayaran maupun menyentuh tabel uang.
  for (const [judul, options, kode, status] of [
    ['pesanan tidak terbaca (bukan milik pemanggil)', { bookingHilang: true }, 'PESANAN_TIDAK_DITEMUKAN', 404],
    ['status bukan PENDING_PAYMENT', { booking: { status: BookingStatus.CONFIRMED } }, 'STATUS_TIDAK_MENUNGGU_BAYAR', 409],
    [
      'tenggat sudah lewat',
      { booking: { expiresAt: new Date(SEKARANG.getTime() - 1000) } },
      'TENGGAT_LEWAT',
      409,
    ],
    [
      'sisa waktu terlalu tipis untuk dibayar',
      { booking: { expiresAt: new Date(SEKARANG.getTime() + 60 * 1000) } },
      'TENGGAT_TERLALU_DEKAT',
      409,
    ],
    ['tidak ada tagihan menganggur', { payments: [] }, 'TIDAK_ADA_TAGIHAN', 409],
  ]) {
    it(`menolak ${judul} tanpa menyentuh gerbang`, async () => {
      const fake = buatFake(options);
      const { GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();

      const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

      assert.ok(galat instanceof GalatSesiPembayaran);
      assert.equal(galat.kode, kode);
      assert.equal(galat.status, status);
      assert.equal(fake.calls.includes('user.findUnique'), false);
      assert.equal(fake.calls.includes('payment.updateMany'), false);
      assert.equal(fake.calls.includes('transaction.begin'), false);
      assert.equal(fake.gerbangCalls.customer.length, 0);
      assert.equal(fake.gerbangCalls.ambil.length, 0);
      assert.equal(fake.gerbangCalls.buat.length, 0);
    });
  }

  // Profil kurang ditolak SESUDAH tagihan ditemukan tetapi SEBELUM satu pun
  // panggilan gerbang: data yang kurang akan ditolak di sana dengan galat yang
  // tidak menyebut kolom mana, dan penolakan itu bisa datang sesudah sesinya
  // sempat terbentuk.
  for (const [judul, user, kurang] of [
    ['nama kosong', { name: '   ' }, 'nama lengkap'],
    ['email kosong', { email: '' }, 'email'],
    ['WhatsApp null', { whatsapp: null }, 'nomor WhatsApp'],
    ['WhatsApp tercemar huruf', { whatsapp: '+62812ABC4567' }, 'nomor WhatsApp'],
  ]) {
    it(`menolak profil kurang (${judul}) sebelum gerbang dipanggil`, async () => {
      const fake = buatFake({ user });
      const { GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();

      const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

      assert.ok(galat instanceof GalatSesiPembayaran);
      assert.equal(galat.kode, 'PROFIL_BELUM_LENGKAP');
      assert.equal(galat.status, 422);
      assert.ok(galat.message.includes(kurang), `pesan tidak menyebut ${kurang}: ${galat.message}`);
      assert.equal(fake.calls.includes('payment.updateMany'), false);
      assert.equal(fake.gerbangCalls.customer.length, 0);
      assert.equal(fake.gerbangCalls.buat.length, 0);
      assert.equal(fake.rows()[0].providerReferenceId, null);
    });
  }

  it('menolak tenggat null sebelum membaca profil atau menyentuh gerbang', async () => {
    const fake = buatFake({ booking: { expiresAt: null } });
    const { GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();

    const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

    assert.ok(galat instanceof GalatSesiPembayaran);
    assert.equal(galat.kode, 'TENGGAT_TIDAK_TERSEDIA');
    assert.equal(fake.calls.includes('user.findUnique'), false);
    assert.equal(fake.gerbangCalls.buat.length, 0);
  });

  it('memakai ulang sesi aktif tanpa POST /sessions kedua', async () => {
    const fake = buatFake({
      payments: [buatPayment({ providerReferenceId: 'pay_pay-1', providerSessionId: 'ps-lama' })],
    });
    const { siapkanSesiPembayaran } = muatService();

    const hasil = await siapkanSesiPembayaran(MASUK, fake.deps);

    assert.equal(hasil.paymentId, 'pay-1');
    assert.equal(hasil.componentsSdkKey, 'csk-palsu-untuk-tes');
    assert.equal(fake.gerbangCalls.ambil.length, 1);
    assert.equal(fake.gerbangCalls.buat.length, 0);
  });

  for (const [keadaan, kode] of [
    ['DIBAYAR', 'MENUNGGU_KONFIRMASI'],
    ['TIDAK_PASTI', 'SESI_BELUM_PASTI'],
  ]) {
    it(`keadaan ${keadaan} tidak menutup atau mengganti tagihan`, async () => {
      const lama = buatPayment({ providerReferenceId: 'pay_pay-1', providerSessionId: 'ps-lama' });
      const fake = buatFake({
        payments: [lama],
        ambilSesi: async () => ({ keadaan, sesi: sesiOk() }),
      });
      const { GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();

      const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

      assert.ok(galat instanceof GalatSesiPembayaran);
      assert.equal(galat.kode, kode);
      assert.equal(fake.calls.includes('transaction.begin'), false);
      assert.equal(fake.gerbangCalls.buat.length, 0);
      assert.equal(fake.rows()[0].status, PaymentStatus.PENDING);
      assert.equal(fake.rows()[0].providerSessionId, 'ps-lama');
    });
  }

  it('menutup sesi mati dan membuka pengganti secara atomik tanpa menimpa id lama', async () => {
    const fake = buatFake({
      payments: [buatPayment({ providerReferenceId: 'pay_pay-1', providerSessionId: 'ps-mati' })],
      ambilSesi: async () => ({ keadaan: 'MATI', sesi: sesiOk({ status: 'EXPIRED' }) }),
      buatSesi: async (arg, { rows }) => {
        assert.equal(rows.filter((row) => row.status === PaymentStatus.PENDING).length, 1);
        return sesiOk({
          payment_session_id: 'ps-pengganti',
          reference_id: arg.referenceId,
          customer_id: arg.customerId,
          amount: arg.jumlah,
        });
      },
    });
    const { siapkanSesiPembayaran } = muatService();

    const hasil = await siapkanSesiPembayaran(MASUK, fake.deps);
    const rows = fake.rows();
    const lama = rows.find((row) => row.id === 'pay-1');
    const baru = rows.find((row) => row.id === hasil.paymentId);

    assert.equal(lama.status, PaymentStatus.EXPIRED);
    assert.equal(lama.providerSessionId, 'ps-mati');
    assert.equal(baru.status, PaymentStatus.PENDING);
    assert.equal(baru.providerSessionId, 'ps-pengganti');
    assert.ok(
      fake.calls.indexOf('transaction.commit') < fake.calls.indexOf('gerbang.buat'),
      `POST terjadi sebelum transaksi commit: ${fake.calls.join(' > ')}`
    );
  });

  it('rollback penggantian menjaga tagihan lama tetap menganggur bila create gagal', async () => {
    const lama = buatPayment({ providerReferenceId: 'pay_pay-1', providerSessionId: 'ps-mati' });
    const fake = buatFake({
      payments: [lama],
      ambilSesi: async () => ({ keadaan: 'MATI', sesi: sesiOk({ status: 'EXPIRED' }) }),
      gagalCreate: new Error('database menolak'),
    });
    const { siapkanSesiPembayaran } = muatService();

    await assert.rejects(() => siapkanSesiPembayaran(MASUK, fake.deps), /database menolak/);

    assert.equal(fake.gerbangCalls.buat.length, 0);
    assert.equal(fake.rows()[0].status, PaymentStatus.PENDING);
    assert.equal(fake.rows()[0].providerSessionId, 'ps-mati');
  });

  it('memakai ulang pemenang P2002 beserta nominal dan reference miliknya', async () => {
    const lama = buatPayment({ providerReferenceId: 'pay_pay-1', providerSessionId: 'ps-mati' });
    const pemenang = buatPayment({
      id: 'pay-pemenang',
      jumlah: new Prisma.Decimal('2750000'),
      providerReferenceId: 'pay_pemenang',
      createdAt: new Date(SEKARANG.getTime() - 1000),
    });
    const bentrok = new Prisma.PrismaClientKnownRequestError('duplikat', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const fake = buatFake({
      payments: [lama],
      ambilSesi: async () => ({ keadaan: 'MATI', sesi: sesiOk({ status: 'EXPIRED' }) }),
      gagalCreate: () => bentrok,
      buatSesi: async (arg) => {
        assert.equal(arg.referenceId, 'pay_pemenang');
        assert.equal(arg.jumlah, 2750000);
        return sesiOk({
          payment_session_id: 'ps-pemenang',
          reference_id: arg.referenceId,
          customer_id: arg.customerId,
          amount: arg.jumlah,
        });
      },
    });
    const cariAsli = fake.deps.db.payment.findFirst;
    const updateAsli = fake.deps.db.payment.updateMany;
    fake.deps.db.payment.findFirst = async (args) => {
      fake.deps.db.payment.findFirst = cariAsli;
      // Transaksi kita sudah rollback. Yang tampak sekarang adalah hasil commit
      // permintaan lain: baris lama ditutup olehnya, dan penggantinya terbuka.
      await updateAsli({ where: { id: 'pay-1' }, data: { status: PaymentStatus.EXPIRED } });
      fake.sisipkanRow(pemenang);
      return cariAsli(args);
    };
    const { siapkanSesiPembayaran } = muatService();

    const hasil = await siapkanSesiPembayaran(MASUK, fake.deps);
    const rows = fake.rows();

    assert.equal(hasil.paymentId, 'pay-pemenang');
    assert.equal(hasil.jumlah, 2750000);
    assert.equal(fake.gerbangCalls.buat.length, 1);
    // Nominal dan reference milik PEMENANG yang dipakai, bukan milik baris lama.
    assert.equal(rows.find((row) => row.id === 'pay-pemenang').providerSessionId, 'ps-pemenang');
    assert.equal(rows.find((row) => row.id === 'pay-1').providerSessionId, 'ps-mati');
  });

  it('membaca jam baru tepat sebelum CAS claim', async () => {
    const dibaca = [];
    const awal = new Date(SEKARANG);
    const sesudahCustomer = new Date(SEKARANG.getTime() + 30_000);
    const fake = buatFake({
      user: { xenditCustomerId: null },
      sekarang: () => {
        const nilai = dibaca.length === 0 ? awal : sesudahCustomer;
        dibaca.push(nilai);
        return new Date(nilai);
      },
    });
    const updateAsli = fake.deps.db.payment.updateMany;
    fake.deps.db.payment.updateMany = async (args) => {
      if (args.data.sesiClaimToken) {
        assert.equal(dibaca.length, 2);
        assert.equal(args.data.sesiClaimedAt.getTime(), sesudahCustomer.getTime());
        assert.equal(args.where.OR[1].sesiClaimExpiresAt.lte.getTime(), sesudahCustomer.getTime());
      }
      return updateAsli(args);
    };
    const { siapkanSesiPembayaran } = muatService();

    await siapkanSesiPembayaran(MASUK, fake.deps);

    assert.equal(fake.gerbangCalls.customer.length, 1);
  });

  it('dua permintaan bersamaan hanya membuat satu sesi provider', async () => {
    let lanjutkan;
    const tertahan = new Promise((resolve) => {
      lanjutkan = resolve;
    });
    let beriTandaMulai;
    const mulai = new Promise((resolve) => {
      beriTandaMulai = resolve;
    });
    const fake = buatFake({
      buatSesi: async (arg) => {
        beriTandaMulai();
        await tertahan;
        return sesiOk({
          payment_session_id: 'ps-tunggal',
          reference_id: arg.referenceId,
          customer_id: arg.customerId,
          amount: arg.jumlah,
        });
      },
    });
    const { GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();

    const pertama = siapkanSesiPembayaran(MASUK, fake.deps);
    await mulai;
    const kedua = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));
    lanjutkan();
    await pertama;

    assert.ok(kedua instanceof GalatSesiPembayaran);
    assert.equal(kedua.kode, 'SEDANG_DISIAPKAN');
    assert.equal(fake.gerbangCalls.buat.length, 1);
  });

  // Lease yang habis HARUS bisa diambil alih, kalau tidak satu POST yang
  // jawabannya hilang akan membuat tagihan itu tidak pernah bisa dibayar lagi.
  // Yang tidak boleh: pemegang lama kemudian menimpa sesi pemegang baru.
  it('claim kedaluwarsa bisa diambil alih dan pemegang lama gagal menyimpan', async () => {
    const fake = buatFake({
      payments: [
        buatPayment({
          providerReferenceId: 'pay_pay-1',
          sesiClaimToken: 'claim-lama',
          sesiClaimedAt: new Date(SEKARANG.getTime() - 3 * 60 * 1000),
          sesiClaimExpiresAt: new Date(SEKARANG.getTime() - 60 * 1000),
        }),
      ],
      tokenBaru: () => 'claim-baru',
    });
    const { siapkanSesiPembayaran } = muatService();

    const hasil = await siapkanSesiPembayaran(MASUK, fake.deps);

    assert.equal(hasil.componentsSdkKey, 'csk-palsu-untuk-tes');
    assert.equal(fake.rows()[0].providerSessionId, 'ps-baru');
    assert.equal(fake.rows()[0].sesiClaimToken, null);

    // Jawaban POST pemegang LAMA baru tiba sekarang. Simpan bersyarat token wajib
    // menolaknya; tanpa itu, sesi yang kuncinya sudah dipegang browser ditimpa
    // oleh sesi yatim.
    const terlambat = await fake.deps.db.payment.updateMany({
      where: { id: 'pay-1', sesiClaimToken: 'claim-lama', providerSessionId: null },
      data: { providerSessionId: 'ps-yatim' },
    });

    assert.equal(terlambat.count, 0);
    assert.equal(fake.rows()[0].providerSessionId, 'ps-baru');
  });

  it('reference tersimpan sebelum POST dan SDK key baru pulang sesudah id sesi tersimpan', async () => {
    let sedangPost = false;
    let idSesiTersimpan = false;
    const fake = buatFake({
      buatSesi: async (arg, { rows }) => {
        sedangPost = true;
        const row = rows[0];
        assert.equal(row.providerReferenceId, 'pay_pay-1');
        assert.equal(row.providerSessionId, null);
        return sesiOk({
          payment_session_id: 'ps-tercatat',
          reference_id: arg.referenceId,
          customer_id: arg.customerId,
          amount: arg.jumlah,
        });
      },
    });
    const updateAsli = fake.deps.db.payment.updateMany;
    fake.deps.db.payment.updateMany = async (args) => {
      const hasil = await updateAsli(args);
      if (args.data.providerSessionId === 'ps-tercatat') idSesiTersimpan = true;
      return hasil;
    };
    const { siapkanSesiPembayaran } = muatService();

    const hasil = await siapkanSesiPembayaran(MASUK, fake.deps);

    assert.equal(sedangPost, true);
    assert.equal(idSesiTersimpan, true);
    assert.equal(hasil.componentsSdkKey, 'csk-palsu-untuk-tes');
    assert.equal(JSON.stringify(hasil).includes('ps-tercatat'), false);
  });

  it('menahan SDK key bila penyimpanan id sesi kalah', async () => {
    const fake = buatFake();
    const updateAsli = fake.deps.db.payment.updateMany;
    fake.deps.db.payment.updateMany = async (args) => {
      if (args.data.providerSessionId) return { count: 0 };
      return updateAsli(args);
    };
    const { GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();

    const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

    assert.ok(galat instanceof GalatSesiPembayaran);
    assert.equal(galat.kode, 'SEDANG_DISIAPKAN');
    assert.equal(galat.message.includes('csk-'), false);
  });

  for (const [nama, status, kode] of [
    ['jawaban bukan JSON', 502, 'JAWABAN_BUKAN_JSON'],
    ['batas waktu', 0, 'BATAS_WAKTU'],
    ['jaringan gagal', 0, 'JARINGAN_GAGAL'],
    ['jawaban terputus', 0, 'JAWABAN_TERPUTUS'],
    ['HTTP 408', 408, 'XENDIT_HTTP_408'],
    ['HTTP 429', 429, 'XENDIT_HTTP_429'],
    ['HTTP 503', 503, 'XENDIT_HTTP_503'],
  ]) {
    it(`menahan claim bila hasil POST tidak pasti: ${nama}`, async () => {
      const { GalatXendit, GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();
      const fake = buatFake({
        buatSesi: async () => {
          throw new GalatXendit(status, kode, 'detail provider palsu');
        },
      });

      const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

      assert.ok(galat instanceof GalatSesiPembayaran);
      assert.equal(galat.kode, 'GERBANG_MENOLAK');
      assert.equal(galat.status, 503);
      assert.equal(fake.rows()[0].sesiClaimToken, 'claim-1');
      assert.equal(fake.rows()[0].providerSessionId, null);
      assert.equal(galat.message.includes('detail provider palsu'), false);
    });
  }

  it('melepas claim setelah penolakan provider yang pasti', async () => {
    const { GalatXendit, GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();
    const fake = buatFake({
      buatSesi: async () => {
        throw new GalatXendit(422, 'XENDIT_HTTP_422', 'detail provider palsu');
      },
    });

    const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

    assert.ok(galat instanceof GalatSesiPembayaran);
    assert.equal(galat.status, 502);
    assert.equal(fake.rows()[0].sesiClaimToken, null);
    assert.equal(fake.rows()[0].providerReferenceId, 'pay_pay-1');
  });

  it('sesi baru tidak lengkap melepas claim dan tidak menyerahkan kunci', async () => {
    const fake = buatFake({
      buatSesi: async (arg) =>
        sesiOk({
          reference_id: arg.referenceId,
          customer_id: arg.customerId,
          amount: arg.jumlah,
          components_sdk_key: null,
        }),
    });
    const { GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();

    const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

    assert.ok(galat instanceof GalatSesiPembayaran);
    assert.equal(galat.kode, 'SESI_TIDAK_LENGKAP');
    assert.equal(fake.rows()[0].sesiClaimToken, null);
    assert.equal(fake.rows()[0].providerSessionId, null);
  });

  it('sesi lama tidak cocok dan gangguan baca ditangani tanpa membuat pengganti', async () => {
    const { GalatXendit, GalatSesiPembayaran, siapkanSesiPembayaran } = muatService();
    for (const [kodeProvider, kodeHarapan, statusHarapan] of [
      ['SESI_TIDAK_SESUAI', 'SESI_TIDAK_COCOK', 409],
      ['JARINGAN_GAGAL', 'SESI_BELUM_PASTI', 503],
    ]) {
      const fake = buatFake({
        payments: [buatPayment({ providerReferenceId: 'pay_pay-1', providerSessionId: 'ps-lama' })],
        ambilSesi: async () => {
          throw new GalatXendit(0, kodeProvider, 'detail internal');
        },
      });

      const galat = await dapatGalat(siapkanSesiPembayaran(MASUK, fake.deps));

      assert.ok(galat instanceof GalatSesiPembayaran);
      assert.equal(galat.kode, kodeHarapan);
      assert.equal(galat.status, statusHarapan);
      assert.equal(fake.calls.includes('transaction.begin'), false);
      assert.equal(fake.gerbangCalls.buat.length, 0);
    }
  });
});

// ===========================================================================
// BOOKING: TAGIHAN AWAL ATOMIK DAN NOMINAL MILIK SERVER
// ===========================================================================
describe('POST /api/booking/create', () => {
  const { Prisma, PaymentStatus, PaymentTujuan } = require('@prisma/client');

  function buatRouteBooking({ body, harga = '1000000' }) {
    let createData = null;
    let pembayaranTerpisah = 0;
    const prisma = {
      billboard: {
        async findUnique() {
          return { id: 'bb-1', status: 'Available', price: new Prisma.Decimal(harga), title: 'Billboard Tes', address: 'Jl. Tes' };
        },
      },
      async $transaction(kerja) {
        return kerja({
          booking: {
            async findFirst() {
              return null;
            },
            async create(args) {
              createData = args.data;
              const payment = {
                id: 'pay-awal',
                tujuan: args.data.payments.create.tujuan,
                jumlah: args.data.payments.create.jumlah,
              };
              return { id: 'booking-baru', ...args.data, payments: [payment] };
            },
          },
        });
      },
      payment: {
        async create() {
          pembayaranTerpisah += 1;
          throw new Error('Payment harus nested di booking.create');
        },
      },
    };
    const route = muatDenganModulPalsu(JALUR_ROUTE_BOOKING, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
      'next-auth/next': { getServerSession: async () => ({ user: { id: 'user-1', role: 'USER', email: null, name: 'Budi' } }) },
      '@/lib/auth': { authOptions: {} },
      '@/lib/prisma': { prisma },
      '@/lib/mail': { sendEmail: async () => {} },
      '@/lib/transisi-status': {
        STATUS_MENGUNCI_TANGGAL: ['PENDING_PAYMENT'],
        hitungTenggatPembayaran: () => new Date('2026-09-27T12:00:00.000Z'),
        sapuPesananKedaluwarsa: async () => 0,
      },
    });
    return { route, data: () => createData, pembayaranTerpisah: () => pembayaranTerpisah, body };
  }

  for (const [paymentType, tujuan, tagihan] of [
    ['dp', PaymentTujuan.DP, 696000],
    ['full', PaymentTujuan.FULL, 1160000],
  ]) {
    it(`membuat tepat satu Payment PENDING ${tujuan} dari nominal server`, async () => {
      const fake = buatRouteBooking({
        body: {
          billboardId: 'bb-1',
          duration: 1,
          paymentType,
          designOption: 'upload',
          startDateString: '2026-10-01T00:00:00.000Z',
          totalPrice: 1,
          dpAmount: 1,
        },
      });

      const response = await fake.route.POST(new Request('https://contoh.test/api/booking/create', {
        method: 'POST',
        body: JSON.stringify(fake.body),
      }));
      const isi = await response.json();
      const data = fake.data();

      assert.equal(response.status, 200);
      assert.equal(data.payments.create.tujuan, tujuan);
      assert.equal(data.payments.create.status, PaymentStatus.PENDING);
      assert.equal(data.payments.create.jumlah.toString(), String(tagihan));
      assert.equal(isi.paymentId, 'pay-awal');
      assert.equal(isi.tagihanSekarang, tagihan);
      assert.equal(fake.pembayaranTerpisah(), 0);
      assert.equal(Object.keys(data.payments).join(','), 'create');
    });
  }
});

// ===========================================================================
// PENDAFTARAN: NOMOR YANG TERSIMPAN HARUS NOMOR YANG DITULIS PEMBELI
// ===========================================================================
//
// Nomor WhatsApp yang tersimpan di sini adalah nomor yang nanti dikirim ke
// gerbang pembayaran sebagai identitas pembeli. `normalisasiNomorLokal` membuang
// karakter non-digit, jadi tanpa pembuktian bentuk lebih dulu, `+62812ABC4567`
// tersimpan sebagai nomor lain yang kelihatan sah — dan pembeli tidak pernah
// diberi tahu nomornya diubah.
describe('POST /api/register — nomor WhatsApp', () => {
  function buatRouteRegister() {
    const dibuat = [];
    let jumlahPencarian = 0;
    let jumlahHash = 0;
    const prisma = {
      user: {
        async findUnique() {
          jumlahPencarian += 1;
          return null;
        },
        async create(args) {
          dibuat.push(args.data);
          return { id: 'user-baru', name: args.data.name, email: args.data.email };
        },
      },
    };

    const route = muatDenganModulPalsu(JALUR_ROUTE_REGISTER, {
      'next/server': {
        NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) },
      },
      bcryptjs: {
        hash: async () => {
          jumlahHash += 1;
          return 'hash-palsu';
        },
      },
      '@/lib/prisma': { prisma },
      '@/lib/db-error': { adalahDuplikatUnik: () => false },
    });

    return {
      route,
      dibuat: () => dibuat,
      jumlahPencarian: () => jumlahPencarian,
      jumlahHash: () => jumlahHash,
    };
  }

  async function daftar(route, ganti = {}) {
    return route.POST(
      new Request('https://contoh.test/api/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Budi Santoso',
          email: 'budi@contoh.test',
          phone: '08123456789',
          password: 'sandirahasia',
          ...ganti,
        }),
      })
    );
  }

  const nomorDitolak = [
    ['tercemar huruf', '+62812ABC4567'],
    ['simbol tak didukung', '0812/3456/7890'],
    ['terlalu pendek', '+6281234'],
    ['berawalan nol setelah +', '+0123456789'],
    ['hanya tanda plus', '+'],
    ['kosong', ''],
  ];

  for (const [judul, phone] of nomorDitolak) {
    it(`menolak nomor ${judul} tanpa pernah menulis User`, async () => {
      const fake = buatRouteRegister();
      const response = await daftar(fake.route, { phone });

      assert.equal(response.status, 400);
      assert.equal(fake.dibuat().length, 0, 'nomor tidak sah tidak boleh tersimpan');
      // Penolakan terjadi sebelum database dan bcrypt disentuh: bentuk yang salah
      // bukan alasan membayar ratusan milidetik hashing, dan bukan alasan
      // memberi tahu pemanggil apakah email itu sudah terdaftar.
      assert.equal(fake.jumlahPencarian(), 0, 'nomor tidak sah tidak boleh memicu query User');
      assert.equal(fake.jumlahHash(), 0, 'nomor tidak sah tidak boleh memicu hashing');
    });
  }

  const nomorDiterima = [
    ['format lokal', '08123456789', '628123456789'],
    ['tanpa tanda plus', '628123456789', '628123456789'],
    ['dengan spasi dan tanda hubung', '+62 812-3456-7890', '6281234567890'],
  ];

  for (const [judul, phone, tersimpan] of nomorDiterima) {
    it(`menyimpan nomor ${judul} dalam bentuk yang dinormalisasi`, async () => {
      const fake = buatRouteRegister();
      const response = await daftar(fake.route, { phone });

      assert.equal(response.status, 201);
      assert.equal(fake.dibuat().length, 1);
      assert.equal(fake.dibuat()[0].whatsapp, tersimpan);
    });
  }

  it('tidak pernah menyimpan nomor yang berbeda dari yang ditulis pembeli', async () => {
    const fake = buatRouteRegister();
    await daftar(fake.route, { phone: '+62812ABC4567' });

    assert.equal(
      fake.dibuat().length,
      0,
      'nomor tebakan hasil membuang huruf tidak boleh menjadi identitas pembayaran'
    );
  });
});

// ===========================================================================
// HTTP SESI: PEMBATAS KEWENANGAN DAN CACHE KEY SDK
// ===========================================================================
describe('POST /api/booking/[id]/payment-session', () => {
  // Route memakai `instanceof GalatSesiPembayaran`. Kelasnya dibuat SEKALI di
  // luar factory supaya galat yang dilempar test dan kelas yang dilihat route
  // benar-benar konstruktor yang sama.
  class GalatSesiPembayaran extends Error {
    constructor(status, kode, pesan) {
      super(pesan);
      this.name = 'GalatSesiPembayaran';
      this.status = status;
      this.kode = kode;
    }
  }

  function buatRouteSesi({ session, galat = null, hasil = null }) {
    const calls = { siapkan: [], rate: [] };
    const route = muatDenganModulPalsu(JALUR_ROUTE_SESI, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
      'next-auth/next': { getServerSession: async () => session },
      '@/lib/auth': { authOptions: {} },
      '@/lib/rate-limit': {
        rateLimit: (input) => {
          calls.rate.push(input);
          return { success: true, retryAfterSeconds: 0, remaining: 9, resetAt: Date.now() + 60_000 };
        },
        rateLimitHeaders: () => ({ 'X-RateLimit-Limit': '10' }),
      },
      '@/lib/sesi-pembayaran': {
        GalatSesiPembayaran,
        siapkanSesiPembayaran: async (input) => {
          calls.siapkan.push(input);
          if (galat) throw galat;
          return hasil ?? { paymentId: 'pay-1', tujuan: 'FULL', jumlah: 1500000, componentsSdkKey: 'csk-rahasia-tes', expiresAt: '2026-09-26T12:00:00.000Z' };
        },
      },
    });
    return { route, calls };
  }

  async function panggil(route, params = Promise.resolve({ id: 'booking-1' })) {
    return route.POST(new Request('https://contoh.test/api/booking/booking-1/payment-session', { method: 'POST' }), { params });
  }

  it('menolak tanpa sesi sebelum limiter dan service', async () => {
    const fake = buatRouteSesi({ session: null });
    const response = await panggil(fake.route);

    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(fake.calls.rate.length, 0);
    assert.equal(fake.calls.siapkan.length, 0);
  });

  for (const role of ['ADMIN', 'SUPER_ADMIN']) {
    it(`menyamarkan admin ${role} sebagai pesanan tidak ditemukan`, async () => {
      const fake = buatRouteSesi({ session: { user: { id: 'admin-1', role } } });
      const response = await panggil(fake.route);
      const isi = await response.json();

      assert.equal(response.status, 404);
      assert.equal(isi.kode, 'PESANAN_TIDAK_DITEMUKAN');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(fake.calls.siapkan.length, 0);
    });
  }

  for (const [judul, status, kode] of [
    ['bukan pemilik', 404, 'PESANAN_TIDAK_DITEMUKAN'],
    ['status tidak layak', 409, 'STATUS_TIDAK_MENUNGGU_BAYAR'],
    ['tenggat lewat', 409, 'TENGGAT_LEWAT'],
    ['profil kurang', 422, 'PROFIL_BELUM_LENGKAP'],
  ]) {
    it(`meneruskan penolakan ${judul} tanpa membuka sesi provider`, async () => {
      const fake = buatRouteSesi({
        session: { user: { id: 'user-1', role: 'USER' } },
        galat: new GalatSesiPembayaran(status, kode, 'pesan aman untuk pembeli'),
      });

      const response = await panggil(fake.route);
      const isi = await response.json();

      assert.equal(response.status, status);
      assert.equal(isi.kode, kode);
      assert.equal(isi.message, 'pesan aman untuk pembeli');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      // Service memang dipanggil; yang dibuktikan di sini adalah route tidak
      // pernah membocorkan kunci sesi pada jalur penolakan.
      assert.equal(fake.calls.siapkan.length, 1);
      assert.equal(JSON.stringify(isi).includes('csk-'), false);
    });
  }

  it('selalu memberi no-store saat parameter route ditolak', async () => {
    const fake = buatRouteSesi({ session: { user: { id: 'user-1', role: 'USER' } } });
    const response = await panggil(fake.route, Promise.reject(new Error('params rusak')));

    assert.equal(response.status, 500);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
});

// ===========================================================================
// WEBHOOK PAYMENT SESSION: SATU-SATUNYA OTORITAS PELUNASAN
// ===========================================================================
describe('pelunasan webhook Payment Session', () => {
  const { Prisma, PaymentStatus, PaymentTujuan, BookingStatus } = require('@prisma/client');
  const SEKARANG = new Date('2026-09-26T10:00:00.000Z');

  // Prisma sungguhan dipalsukan pada kedua jalur impornya. Service selalu
  // menerima database lewat parameter, jadi singleton yang ikut termuat hanya
  // akan membuka koneksi Postgres tanpa pernah dipakai.
  const PRISMA_PALSU = { prisma: {} };

  function muatPelunasan() {
    delete require.cache[require.resolve(JALUR_PELUNASAN_WEBHOOK)];
    return muatDenganModulPalsu(JALUR_PELUNASAN_WEBHOOK, {
      './prisma': PRISMA_PALSU,
      '@/lib/prisma': PRISMA_PALSU,
    });
  }

  function dataWebhook(ganti = {}) {
    return {
      event: 'payment_session.completed',
      created: '2026-09-26T09:59:00.000Z',
      data: {
        payment_session_id: 'ps-1',
        reference_id: 'ref-1',
        payment_id: 'pi-1',
        status: 'COMPLETED',
        currency: 'IDR',
        session_type: 'PAY',
        mode: 'COMPONENTS',
        amount: '1500000',
        components_sdk_key: 'csk-rahasia-yang-tidak-boleh-disimpan',
        ...ganti,
      },
    };
  }

  function buatPaymentWebhook(ganti = {}) {
    return {
      id: 'pay-1',
      bookingId: 'booking-1',
      tujuan: PaymentTujuan.FULL,
      status: PaymentStatus.PENDING,
      jumlah: new Prisma.Decimal('1500000'),
      providerReferenceId: 'ref-1',
      providerSessionId: 'ps-1',
      providerPaymentId: null,
      paidAt: null,
      callbackPayload: null,
      ...ganti,
    };
  }

  function cocokWebhook(row, where) {
    if (!where) return true;
    for (const [nama, syarat] of Object.entries(where)) {
      if (nama === 'OR') {
        if (!syarat.some((bagian) => cocokWebhook(row, bagian))) return false;
      } else if (row[nama] !== syarat) {
        return false;
      }
    }
    return true;
  }

  /**
   * Database stateful yang menyalin seluruh transaksi. Serialisasi transaksi
   * memodelkan database yang memilih satu pemenang delivery paralel; delivery
   * berikutnya lalu membaca fakta PAID yang telah commit.
   */
  function buatDbPelunasan(options = {}) {
    let payments = (options.payments ?? [buatPaymentWebhook()]).map((payment) => ({ ...payment }));
    let bookings = new Map([
      [
        'booking-1',
        {
          id: 'booking-1',
          status: BookingStatus.PENDING_PAYMENT,
          paidAt: null,
          duration: 30,
          // `totalPrice` dan `startDate` dibutuhkan penerbit tagihan pelunasan:
          // yang pertama menghitung sisa pokok, yang kedua menjadi acuan tenggat
          // H-3 yang ikut di notifikasi. Default di sini sama dengan nominal
          // tagihan FULL, jadi pesanan bawaan lunas dan TIDAK menerbitkan
          // pelunasan — test yang menguji penerbitannya menyetel keduanya sendiri.
          totalPrice: new Prisma.Decimal('1500000'),
          startDate: new Date('2026-10-20T00:00:00.000Z'),
          user: { email: 'pembeli@contoh.test', name: 'Budi Santoso' },
          billboard: { title: 'Billboard Sudirman', address: 'Jl. Sudirman' },
          ...(options.booking ?? {}),
        },
      ],
    ]);
    const calls = [];
    let antrean = Promise.resolve();

    function salinBooking(peta) {
      return new Map(
        [...peta.entries()].map(([id, booking]) => [
          id,
          { ...booking, user: { ...booking.user }, billboard: { ...booking.billboard } },
        ])
      );
    }

    function tabelPayment(ambil, simpan, ambilBooking) {
      return {
        async findFirst(args) {
          calls.push('payment.findFirst');
          const payment = ambil().find((row) => cocokWebhook(row, args.where));
          if (!payment) return null;
          const booking = ambilBooking().get(payment.bookingId);
          return booking
            ? { ...payment, booking: { ...booking, user: { ...booking.user }, billboard: { ...booking.billboard } } }
            : null;
        },
        async updateMany(args) {
          calls.push('payment.updateMany');
          const rows = ambil();
          const cocok = rows.filter((row) => cocokWebhook(row, args.where));
          if (args.data.providerPaymentId) {
            const sudahDipakai = rows.some(
              (row) => row.id !== cocok[0]?.id && row.providerPaymentId === args.data.providerPaymentId
            );
            if (sudahDipakai) {
              throw new Prisma.PrismaClientKnownRequestError('provider payment id duplikat', {
                code: 'P2002',
                clientVersion: 'test',
                meta: { target: ['providerPaymentId'] },
              });
            }
          }
          simpan(rows.map((row) => (cocokWebhook(row, args.where) ? { ...row, ...args.data } : row)));
          return { count: cocok.length };
        },
        async findMany(args) {
          calls.push('payment.findMany');
          return ambil()
            .filter((row) => cocokWebhook(row, args.where))
            .map((row) => ({ ...row }));
        },
        async create(args) {
          calls.push('payment.create');
          const rows = ambil();
          // Indeks unik bersyarat `payment_satu_tagihan_menganggur`: maksimum satu
          // baris PENDING per (bookingId, tujuan). Dimodelkan di sini supaya test
          // membuktikan penerbit tagihan memeriksanya SEBELUM create, bukan
          // mengandalkan catch P2002 yang di Postgres sudah terlambat.
          const bentrok = rows.some(
            (row) =>
              row.bookingId === args.data.bookingId &&
              row.tujuan === args.data.tujuan &&
              row.status === PaymentStatus.PENDING &&
              args.data.status === PaymentStatus.PENDING
          );
          if (bentrok) {
            throw new Prisma.PrismaClientKnownRequestError('tagihan menganggur duplikat', {
              code: 'P2002',
              clientVersion: 'test',
              meta: { target: ['bookingId', 'tujuan'] },
            });
          }
          const baris = {
            id: `pay-baru-${rows.length + 1}`,
            providerReferenceId: null,
            providerSessionId: null,
            providerPaymentId: null,
            paidAt: null,
            callbackPayload: null,
            ...args.data,
          };
          simpan([...rows, baris]);
          return { id: baris.id };
        },
      };
    }

    function tabelBooking(ambil, simpan) {
      return {
        async updateMany(args) {
          calls.push('booking.updateMany');
          if (options.bookingCasGagal) return { count: 0 };
          const booking = ambil().get(args.where.id);
          if (!booking || !cocokWebhook(booking, args.where)) return { count: 0 };
          simpan(new Map([...ambil(), [booking.id, { ...booking, ...args.data }]]));
          return { count: 1 };
        },
      };
    }

    const db = {
      payment: tabelPayment(
        () => payments,
        (nilai) => {
          payments = nilai;
        },
        () => bookings
      ),
      async $transaction(kerja) {
        const tungguGiliran = antrean;
        let bukaGiliran;
        antrean = new Promise((resolve) => {
          bukaGiliran = resolve;
        });
        await tungguGiliran;

        const paymentSebelum = payments;
        const bookingSebelum = bookings;
        let paymentSalinan = payments.map((payment) => ({ ...payment }));
        let bookingSalinan = salinBooking(bookings);
        calls.push('transaction.begin');
        try {
          const hasil = await kerja({
            payment: tabelPayment(
              () => paymentSalinan,
              (nilai) => {
                paymentSalinan = nilai;
              },
              () => bookingSalinan
            ),
            booking: tabelBooking(
              () => bookingSalinan,
              (nilai) => {
                bookingSalinan = nilai;
              }
            ),
          });
          payments = paymentSalinan;
          bookings = bookingSalinan;
          calls.push('transaction.commit');
          return hasil;
        } catch (error) {
          payments = paymentSebelum;
          bookings = bookingSebelum;
          calls.push('transaction.rollback');
          throw error;
        } finally {
          bukaGiliran();
        }
      },
    };

    return {
      db,
      calls,
      payments: () => payments.map((payment) => ({ ...payment })),
      booking: () => ({ ...bookings.get('booking-1') }),
    };
  }

  function depsDb(fake) {
    return { db: fake.db, sekarang: () => new Date(SEKARANG) };
  }

  function dapatGalat(janji) {
    return janji.then(
      () => null,
      (error) => error
    );
  }

  it('mengurai nominal string atau number tepat dan menyaring SDK key dari audit', () => {
    const { uraikanWebhookSesiSelesai } = muatPelunasan();

    for (const amount of ['1500000.00', 1500000]) {
      const hasil = uraikanWebhookSesiSelesai(dataWebhook({ amount }));
      assert.equal(hasil.data.amount.toString(), '1500000');
      assert.equal(JSON.stringify(hasil.data.callbackPayload).includes('components_sdk_key'), false);
      assert.deepEqual(hasil.data.callbackPayload, {
        event: 'payment_session.completed',
        created: '2026-09-26T09:59:00.000Z',
        data: {
          payment_session_id: 'ps-1',
          reference_id: 'ref-1',
          payment_id: 'pi-1',
          status: 'COMPLETED',
          currency: 'IDR',
          session_type: 'PAY',
          mode: 'COMPONENTS',
          amount: '1500000',
        },
      });
    }
  });

  for (const [judul, ganti, kode] of [
    ['event lain', { event: 'payment_session.pending' }, 'EVENT_TIDAK_DIDUKUNG'],
    ['status lain', { data: { ...dataWebhook().data, status: 'PENDING' } }, 'SESI_TIDAK_SESUAI'],
    ['mata uang lain', { data: { ...dataWebhook().data, currency: 'USD' } }, 'SESI_TIDAK_SESUAI'],
    ['jenis sesi lain', { data: { ...dataWebhook().data, session_type: 'RECURRING' } }, 'SESI_TIDAK_SESUAI'],
    ['mode lain', { data: { ...dataWebhook().data, mode: 'HOSTED' } }, 'SESI_TIDAK_SESUAI'],
    ['nominal kosong', { data: { ...dataWebhook().data, amount: '' } }, 'NOMINAL_TIDAK_SAH'],
    ['nominal nol', { data: { ...dataWebhook().data, amount: '0' } }, 'NOMINAL_TIDAK_SAH'],
    ['nominal negatif', { data: { ...dataWebhook().data, amount: '-1' } }, 'NOMINAL_TIDAK_SAH'],
    ['nominal Infinity', { data: { ...dataWebhook().data, amount: 'Infinity' } }, 'NOMINAL_TIDAK_SAH'],
    ['nominal NaN', { data: { ...dataWebhook().data, amount: 'NaN' } }, 'NOMINAL_TIDAK_SAH'],
  ]) {
    it(`menolak ${judul}`, () => {
      const { GalatWebhookPembayaran, uraikanWebhookSesiSelesai } = muatPelunasan();
      assert.throws(
        () => uraikanWebhookSesiSelesai({ ...dataWebhook(), ...ganti }),
        (error) => error instanceof GalatWebhookPembayaran && error.kode === kode
      );
    });
  }

  it('menyelesaikan Payment dan Booking secara atomik lewat identifier server', async () => {
    const fake = buatDbPelunasan();
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const hasil = await selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake));
    const payment = fake.payments()[0];

    assert.equal(hasil.keadaan, 'DISELESAIKAN');
    assert.equal(payment.status, PaymentStatus.PAID);
    assert.equal(payment.providerPaymentId, 'pi-1');
    assert.equal(payment.paidAt.getTime(), SEKARANG.getTime());
    assert.equal(payment.callbackPayload.data.amount, '1500000');
    assert.equal(JSON.stringify(payment.callbackPayload).includes('components_sdk_key'), false);
    assert.equal(fake.booking().status, BookingStatus.PAID_CONFIRMED);
    assert.equal(fake.booking().paidAt.getTime(), SEKARANG.getTime());
  });

  it('mengabaikan identifier provider yang tidak dikenal atau pasangan campuran', async () => {
    const fake = buatDbPelunasan({
      payments: [
        buatPaymentWebhook(),
        buatPaymentWebhook({ id: 'pay-2', bookingId: 'booking-1', providerSessionId: 'ps-2', providerReferenceId: 'ref-2' }),
      ],
    });
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const tidakDikenal = await selesaikanDariWebhook(
      uraikanWebhookSesiSelesai(dataWebhook({ payment_session_id: 'ps-tidak-ada', reference_id: 'ref-tidak-ada' })),
      depsDb(fake)
    );
    const campuran = await selesaikanDariWebhook(
      uraikanWebhookSesiSelesai(dataWebhook({ payment_session_id: 'ps-1', reference_id: 'ref-2' })),
      depsDb(fake)
    );

    assert.deepEqual(tidakDikenal, { keadaan: 'DIABAIKAN' });
    assert.deepEqual(campuran, { keadaan: 'DIABAIKAN' });
    assert.equal(fake.payments().every((payment) => payment.status === PaymentStatus.PENDING), true);
    assert.equal(fake.calls.includes('payment.updateMany'), false);
  });

  it('menolak nominal yang tidak sama tanpa menulis fakta uang', async () => {
    const fake = buatDbPelunasan();
    const { GalatWebhookPembayaran, selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const galat = await dapatGalat(
      selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook({ amount: '1500001' })), depsDb(fake))
    );

    assert.ok(galat instanceof GalatWebhookPembayaran);
    assert.equal(galat.kode, 'NOMINAL_TIDAK_SESUAI');
    assert.equal(fake.payments()[0].status, PaymentStatus.PENDING);
    assert.equal(fake.calls.includes('payment.updateMany'), false);
  });

  it('mengembalikan duplicate hanya untuk payment ID provider yang sama', async () => {
    const fake = buatDbPelunasan({
      payments: [buatPaymentWebhook({ status: PaymentStatus.PAID, providerPaymentId: 'pi-1', paidAt: SEKARANG })],
    });
    const { GalatWebhookPembayaran, selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const duplikat = await selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake));
    const galat = await dapatGalat(
      selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook({ payment_id: 'pi-lain' })), depsDb(fake))
    );

    assert.deepEqual(duplikat, { keadaan: 'DUPLIKAT' });
    assert.ok(galat instanceof GalatWebhookPembayaran);
    assert.equal(galat.kode, 'KONFLIK_PAYMENT_ID');
    assert.equal(fake.calls.includes('payment.updateMany'), false);
  });

  it('menerjemahkan collision providerPaymentId dan rollback Payment pemenang palsu', async () => {
    const fake = buatDbPelunasan({
      payments: [
        buatPaymentWebhook(),
        buatPaymentWebhook({
          id: 'pay-2',
          providerReferenceId: 'ref-2',
          providerSessionId: 'ps-2',
          status: PaymentStatus.PAID,
          providerPaymentId: 'pi-1',
          paidAt: SEKARANG,
        }),
      ],
    });
    const { GalatWebhookPembayaran, selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const galat = await dapatGalat(selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake)));

    assert.ok(galat instanceof GalatWebhookPembayaran);
    assert.equal(galat.kode, 'KONFLIK_PAYMENT_ID');
    assert.equal(fake.payments().find((payment) => payment.id === 'pay-1').status, PaymentStatus.PENDING);
    assert.equal(fake.booking().status, BookingStatus.PENDING_PAYMENT);
    assert.equal(fake.calls.includes('transaction.rollback'), true);
  });

  it('rollback Payment bila CAS Booking kalah', async () => {
    const fake = buatDbPelunasan({ bookingCasGagal: true });
    const { GalatWebhookPembayaran, selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const galat = await dapatGalat(selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake)));
    const payment = fake.payments()[0];

    assert.ok(galat instanceof GalatWebhookPembayaran);
    assert.equal(galat.kode, 'PESANAN_SEDANG_DIPROSES');
    assert.equal(payment.status, PaymentStatus.PENDING);
    assert.equal(payment.providerPaymentId, null);
    assert.equal(payment.paidAt, null);
    assert.equal(payment.callbackPayload, null);
    assert.equal(fake.booking().status, BookingStatus.PENDING_PAYMENT);
  });

  it('dua delivery serentak hanya memberi satu pemenang dan retry menjadi duplicate', async () => {
    const fake = buatDbPelunasan();
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();
    const webhook = uraikanWebhookSesiSelesai(dataWebhook());

    const hasil = await Promise.all([
      selesaikanDariWebhook(webhook, depsDb(fake)),
      selesaikanDariWebhook(webhook, depsDb(fake)),
    ]);

    assert.equal(hasil.filter((nilai) => nilai.keadaan === 'DISELESAIKAN').length, 1);
    assert.equal(hasil.filter((nilai) => nilai.keadaan === 'DUPLIKAT').length, 1);
    assert.equal(fake.payments()[0].status, PaymentStatus.PAID);
    assert.equal(fake.calls.filter((nama) => nama === 'booking.updateMany').length, 1);
  });

  it('DP yang lunas menerbitkan satu tagihan PELUNASAN sebesar sisa pokok di transaksi yang sama', async () => {
    const fake = buatDbPelunasan({
      payments: [buatPaymentWebhook({ tujuan: PaymentTujuan.DP })],
      booking: { totalPrice: new Prisma.Decimal('5000000') },
    });
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const hasil = await selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake));

    assert.equal(hasil.keadaan, 'DISELESAIKAN');
    assert.equal(fake.booking().status, BookingStatus.PAID_CONFIRMED);

    // Tanpa baris ini pembeli DP tidak punya tagihan yang bisa dibayar sama
    // sekali: `tagihanBerikutnya` tidak menemukan apa pun dan halaman bayar
    // menjawab TIDAK_ADA_TAGIHAN.
    const pelunasan = fake.payments().filter((p) => p.tujuan === PaymentTujuan.PELUNASAN);
    assert.equal(pelunasan.length, 1);
    assert.equal(pelunasan[0].status, PaymentStatus.PENDING);
    assert.equal(pelunasan[0].jumlah.toString(), '3500000');
    // Tagihan baru belum pernah menyentuh gerbang pembayaran.
    assert.equal(pelunasan[0].providerSessionId, null);
    assert.equal(pelunasan[0].providerPaymentId, null);

    // Satu transaksi, satu commit: tidak ada jendela di mana DP sudah PAID tapi
    // tagihan pelunasannya belum ada.
    assert.equal(fake.calls.filter((nama) => nama === 'transaction.begin').length, 1);
    assert.equal(fake.calls.filter((nama) => nama === 'transaction.commit').length, 1);
    assert.equal(fake.calls.includes('transaction.rollback'), false);

    // Notifikasi membawa sisa SESUDAH setoran ini, bukan sisa sebelumnya —
    // surat tidak boleh menagih uang yang baru saja diterima.
    assert.equal(hasil.notifikasi.sisaPokok.toString(), '3500000');
    assert.ok(hasil.notifikasi.tenggatPelunasan instanceof Date);
  });

  it('FULL yang lunas tidak menerbitkan tagihan apa pun', async () => {
    const fake = buatDbPelunasan();
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const hasil = await selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake));

    // Syaratnya "masih ada sisa pokok", bukan "tujuannya DP". FULL yang lunas
    // karena itu tidak butuh cabang khusus untuk berhenti.
    assert.equal(fake.payments().length, 1);
    assert.equal(fake.calls.includes('payment.create'), false);
    assert.equal(hasil.notifikasi.sisaPokok.toString(), '0');
    assert.equal(hasil.notifikasi.tenggatPelunasan, null);
  });

  it('PELUNASAN pada pesanan IN_PRODUCTION tercatat PAID tanpa menyentuh tabel Booking', async () => {
    // REGRESI PALING PENTING DI FASE INI.
    //
    // Gerbang lama menuntut `transisiSah(status, PAID_CONFIRMED)` untuk SETIAP
    // tujuan, dan `PAID_CONFIRMED` hanya sah dari `PENDING_PAYMENT`. Akibatnya
    // setiap webhook pelunasan pada pesanan yang sudah berjalan dijawab 409,
    // Xendit mengulanginya selamanya, dan `Payment` tidak pernah menjadi `PAID`
    // walaupun uangnya sudah diterima di sisi Xendit — uang masuk yang tidak
    // pernah tercatat di pembukuan.
    const fake = buatDbPelunasan({
      payments: [buatPaymentWebhook({ tujuan: PaymentTujuan.PELUNASAN })],
      booking: { status: BookingStatus.IN_PRODUCTION, paidAt: new Date('2026-09-20T00:00:00.000Z') },
    });
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const hasil = await selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake));
    const payment = fake.payments()[0];

    assert.equal(hasil.keadaan, 'DISELESAIKAN');
    assert.equal(payment.status, PaymentStatus.PAID);
    assert.equal(payment.paidAt.getTime(), SEKARANG.getTime());

    // Nol penulisan ke tabel Booking. Menarik pesanan `IN_PRODUCTION` balik ke
    // `PAID_CONFIRMED` akan membatalkan kemajuan pengerjaan yang sudah nyata,
    // dan `Payment.paidAt` sudah menjadi jejak waktu uangnya.
    assert.equal(fake.calls.includes('booking.updateMany'), false);
    assert.equal(fake.booking().status, BookingStatus.IN_PRODUCTION);
    assert.equal(fake.booking().paidAt.getTime(), new Date('2026-09-20T00:00:00.000Z').getTime());
  });

  it('TAMBAHAN pada pesanan ACTIVE tidak memindahkan status dan tidak mengubah sisa pokok', async () => {
    const fake = buatDbPelunasan({
      payments: [
        buatPaymentWebhook({ id: 'pay-pokok', tujuan: PaymentTujuan.DP, status: PaymentStatus.PAID, jumlah: new Prisma.Decimal('1000000'), providerSessionId: 'ps-lama', providerReferenceId: 'ref-lama', providerPaymentId: 'pi-lama' }),
        buatPaymentWebhook({ id: 'pay-tambahan', tujuan: PaymentTujuan.TAMBAHAN }),
      ],
      booking: { status: BookingStatus.ACTIVE, totalPrice: new Prisma.Decimal('5000000') },
    });
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const hasil = await selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake));

    assert.equal(hasil.keadaan, 'DISELESAIKAN');
    assert.equal(fake.payments().find((p) => p.id === 'pay-tambahan').status, PaymentStatus.PAID);
    assert.equal(fake.calls.includes('booking.updateMany'), false);
    assert.equal(fake.booking().status, BookingStatus.ACTIVE);

    // Biaya tambahan berada DI LUAR pokok. Membayarnya tidak boleh membuat sisa
    // pokok terlihat mengecil, dan karena itu juga tidak menerbitkan pelunasan.
    assert.equal(fake.calls.includes('payment.create'), false);
    assert.equal(fake.payments().filter((p) => p.tujuan === PaymentTujuan.PELUNASAN).length, 0);
  });

  it('tidak membuat tagihan PELUNASAN kedua bila yang menganggur sudah ada', async () => {
    const fake = buatDbPelunasan({
      payments: [
        buatPaymentWebhook({ tujuan: PaymentTujuan.DP }),
        buatPaymentWebhook({
          id: 'pay-pelunasan',
          tujuan: PaymentTujuan.PELUNASAN,
          jumlah: new Prisma.Decimal('3500000'),
          providerSessionId: null,
          providerReferenceId: null,
        }),
      ],
      booking: { totalPrice: new Prisma.Decimal('5000000') },
    });
    const { selesaikanDariWebhook, uraikanWebhookSesiSelesai } = muatPelunasan();

    const hasil = await selesaikanDariWebhook(uraikanWebhookSesiSelesai(dataWebhook()), depsDb(fake));

    // Indeks `payment_satu_tagihan_menganggur` akan menolak baris kedua dengan
    // P2002 — dan di Postgres galat itu sudah mengaborsi transaksi, jadi
    // penerbitnya harus memeriksa lebih dulu, bukan menangkapnya.
    assert.equal(hasil.keadaan, 'DISELESAIKAN');
    assert.equal(fake.calls.includes('payment.create'), false);
    assert.equal(fake.calls.includes('transaction.rollback'), false);
    assert.equal(fake.payments().filter((p) => p.tujuan === PaymentTujuan.PELUNASAN).length, 1);
  });
});

// ===========================================================================
// HTTP WEBHOOK: TOKEN CALLBACK, STATUS, DAN ROUTE LAMA
// ===========================================================================
describe('POST /api/xendit/webhook', () => {
  class GalatWebhookPembayaran extends Error {
    constructor(status, kode, pesan) {
      super(pesan);
      this.name = 'GalatWebhookPembayaran';
      this.status = status;
      this.kode = kode;
    }
  }

  function buatRouteWebhook({ tokenCocok = (nilai) => nilai === TOKEN_PALSU, hasil = { keadaan: 'DIABAIKAN' }, galat = null, gagalEmail = false } = {}) {
    const calls = { token: [], uraikan: [], selesaikan: [], email: [] };
    const route = muatDenganModulPalsu(JALUR_ROUTE_WEBHOOK_XENDIT, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
      '@/lib/mail': {
        sendEmail: async (surat) => {
          calls.email.push(surat);
          if (gagalEmail) throw new Error('SMTP menolak');
        },
      },
      '@/lib/money': {
        keAngka: (nilai) => Number(nilai),
        rupiah: () => 'Rp1.500.000',
        // Dipakai route untuk memutuskan apakah surat menyebut sisa pokok. Tanpa
        // ini `kirimNotifikasi` melempar TypeError, dan karena pengiriman surat
        // sengaja dibungkus try/catch, kegagalannya lolos sebagai "tidak ada email
        // terkirim" — bukan sebagai galat yang terlihat.
        lebihBesar: (a, b) => Number(a) > Number(b),
      },
      '@/lib/xendit': {
        tokenWebhookCocok: (nilai) => {
          calls.token.push(nilai);
          return tokenCocok(nilai);
        },
      },
      '@/lib/pelunasan-webhook': {
        GalatWebhookPembayaran,
        uraikanWebhookSesiSelesai: (body) => {
          calls.uraikan.push(body);
          if (galat) throw galat;
          return { body };
        },
        selesaikanDariWebhook: async (webhook) => {
          calls.selesaikan.push(webhook);
          if (galat) throw galat;
          return hasil;
        },
      },
    });
    return { route, calls };
  }

  function requestWebhook({ token = TOKEN_PALSU, body = { aman: true } } = {}) {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (token !== null) headers.set('x-callback-token', token);
    return new Request('https://contoh.test/api/xendit/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  for (const [judul, token, tokenCocok, hapusEnv] of [
    ['token hilang', null, (nilai) => nilai === TOKEN_PALSU, false],
    ['token salah', 'token-salah', (nilai) => nilai === TOKEN_PALSU, false],
    // Token yang benar pun harus ditolak saat variabelnya belum dipasang:
    // webhook yang terbuka tanpa konfigurasi berarti siapa pun yang menebak URL
    // ini bisa menyatakan pesanan mana pun sudah dibayar.
    ['konfigurasi callback token kosong', TOKEN_PALSU, () => false, true],
  ]) {
    it(`menolak ${judul} sebelum parser dan database`, async () => {
      if (hapusEnv) delete process.env.XENDIT_CALLBACK_TOKEN;
      const fake = buatRouteWebhook({ tokenCocok });
      const response = await fake.route.POST(requestWebhook({ token }));

      assert.equal(response.status, 401);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(fake.calls.uraikan.length, 0);
      assert.equal(fake.calls.selesaikan.length, 0);
    });
  }

  it('menolak JSON rusak sebagai payload tidak sah tanpa parser atau settlement', async () => {
    const fake = buatRouteWebhook();
    const response = await fake.route.POST(
      new Request('https://contoh.test/api/xendit/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-callback-token': TOKEN_PALSU,
        },
        body: '{"data":',
      })
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      message: 'Body webhook bukan JSON yang sah.',
      kode: 'PAYLOAD_TIDAK_SAH',
    });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(fake.calls.uraikan.length, 0);
    assert.equal(fake.calls.selesaikan.length, 0);
  });

  it('memetakan event atau nominal salah ke galat aman tanpa settlement', async () => {
    const galat = new GalatWebhookPembayaran(400, 'NOMINAL_TIDAK_SESUAI', 'Nominal webhook tidak sesuai tagihan.');
    const fake = buatRouteWebhook({ galat });
    const response = await fake.route.POST(requestWebhook());
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.kode, 'NOMINAL_TIDAK_SESUAI');
    assert.equal(fake.calls.selesaikan.length, 0);
    assert.equal(JSON.stringify(body).includes('csk-'), false);
  });

  it('menjawab 500 generik tanpa membocorkan galat mentah atau payload', async () => {
    const fake = buatRouteWebhook({
      galat: new Error('gagal query payment WHERE providerSessionId = ps-1 csk-rahasia'),
    });
    const response = await fake.route.POST(requestWebhook({ body: { rahasia: 'csk-rahasia' } }));
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, { message: 'Error Server', kode: 'GALAT_SERVER' });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });

  it('mengakui sesi provider tidak dikenal sebagai ignored tanpa menulis lagi', async () => {
    const fake = buatRouteWebhook({ hasil: { keadaan: 'DIABAIKAN' } });
    const response = await fake.route.POST(requestWebhook());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'ok', ignored: true });
    assert.equal(fake.calls.selesaikan.length, 1);
  });

  it('mengakui duplicate tanpa menjalankan settlement kedua atau mengirim email', async () => {
    const fake = buatRouteWebhook({ hasil: { keadaan: 'DUPLIKAT' } });
    const response = await fake.route.POST(requestWebhook());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'ok', duplicate: true });
    assert.equal(fake.calls.selesaikan.length, 1);
    assert.equal(fake.calls.email.length, 0);
  });

  it('hanya pemenang settlement mengirim notifikasi admin dan pembeli', async () => {
    process.env.ADMIN_EMAIL = 'admin@contoh.test';
    const notifikasi = {
      bookingId: 'booking-1',
      emailPembeli: 'pembeli@contoh.test',
      namaPembeli: 'Budi Santoso',
      judulBillboard: 'Billboard Sudirman',
      alamatBillboard: 'Jl. Sudirman',
      durasi: 30,
      tujuan: 'FULL',
      jumlah: new (require('@prisma/client').Prisma.Decimal)('1500000'),
      // Pembayaran penuh: tidak ada sisa, jadi tidak ada tenggat pelunasan.
      sisaPokok: new (require('@prisma/client').Prisma.Decimal)('0'),
      tenggatPelunasan: null,
    };
    const fake = buatRouteWebhook({ hasil: { keadaan: 'DISELESAIKAN', notifikasi } });

    const response = await fake.route.POST(requestWebhook());

    assert.equal(response.status, 200);
    assert.equal(fake.calls.email.length, 2);
    assert.equal(fake.calls.email[0].to, 'admin@contoh.test');
    assert.equal(fake.calls.email[1].to, 'pembeli@contoh.test');
  });

  it('kegagalan email tidak membatalkan settlement yang sudah commit', async () => {
    process.env.ADMIN_EMAIL = 'admin@contoh.test';
    const fake = buatRouteWebhook({
      gagalEmail: true,
      hasil: {
        keadaan: 'DISELESAIKAN',
        notifikasi: {
          bookingId: 'booking-1',
          emailPembeli: 'pembeli@contoh.test',
          namaPembeli: null,
          judulBillboard: 'Billboard Sudirman',
          alamatBillboard: 'Jl. Sudirman',
          durasi: 30,
          tujuan: 'FULL',
          jumlah: new (require('@prisma/client').Prisma.Decimal)('1500000'),
          sisaPokok: new (require('@prisma/client').Prisma.Decimal)('0'),
          tenggatPelunasan: null,
        },
      },
    });

    const response = await fake.route.POST(requestWebhook());

    assert.equal(response.status, 200);
    assert.equal(fake.calls.email.length, 1);
    assert.equal(fake.calls.selesaikan.length, 1);
  });
});

describe('POST /api/payment/notify lama', () => {
  it('selalu 410 tanpa token lama atau penulis settlement', async () => {
    const route = muatDenganModulPalsu(JALUR_ROUTE_NOTIFY_LEGACY, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
    });
    const response = await route.POST();
    const body = await response.json();
    const sumber = fs.readFileSync(JALUR_ROUTE_NOTIFY_LEGACY, 'utf8');

    assert.equal(response.status, 410);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(body.kode, 'ENDPOINT_LAMA_DINONAKTIFKAN');
    assert.doesNotMatch(sumber, /PAYMENT_WEBHOOK_TOKEN|prisma\.|BookingStatus|PaymentStatus/);
  });
});

// ===========================================================================
// BATAS BROWSER: KUNCI SDK, EVENT, DAN OTORITAS PENYELESAIAN
// ===========================================================================
describe('PaymentClient batas keamanan browser', () => {
  const sumber = fs.readFileSync(JALUR_KLIEN_PEMBAYARAN, 'utf8');

  it('memasang seluruh listener sebelum membuat komponen SDK', () => {
    const terakhirListener = sumber.lastIndexOf("instance.addEventListener('fatal-error'");
    const pertamaKomponen = sumber.indexOf('instance.createChannelPickerComponent()');
    assert.ok(terakhirListener >= 0 && pertamaKomponen > terakhirListener);
  });

  it('berbagi promise Strict Mode dan membongkar listener serta komponen', () => {
    assert.match(sumber, /permintaanRef\.current = \{ nomor: permintaanKe, promise \}/);
    assert.match(sumber, /tercatat\?\.nomor === permintaanKe\s*\?\s*tercatat\.promise/);
    assert.equal((sumber.match(/instance\.addEventListener\(/g) ?? []).length, 13);
    assert.equal((sumber.match(/komponen\.removeEventListener\(/g) ?? []).length, 13);
    assert.match(sumber, /komponen\.destroyComponent\(elemen\)/);
  });

  it('tidak menulis kunci SDK ke DOM, URL, storage, atau log', () => {
    assert.equal(sumber.includes('componentsSdkKey'), true);
    assert.equal(sumber.includes('localStorage'), false);
    assert.equal(sumber.includes('sessionStorage'), false);
    assert.equal(sumber.includes('console.'), false);
    assert.equal(sumber.includes('URLSearchParams'), false);
    assert.equal(sumber.includes('paymentSessionId'), false);
    assert.match(sumber, /new Components\(\{ componentsSdkKey: sesi\.componentsSdkKey \}\)/);
  });

  it('event selesai hanya menyegarkan UI, tidak pernah menyelesaikan tagihan di browser', () => {
    const awal = sumber.indexOf('const onLengkap');
    const akhir = sumber.indexOf('const onKedaluwarsa', awal);
    const handler = sumber.slice(awal, akhir);
    assert.match(handler, /router\.refresh\(\)/);
    assert.match(handler, /menunggu konfirmasi/);
    assert.doesNotMatch(handler, /fetch\(|PAID|PENDING_PAYMENT|payment\/notify|simulatePayment|lunas/i);
    assert.doesNotMatch(sumber, /redirectToReturnUrl\(/);
  });

  it('copy penyelesaian tidak mengklaim pembayaran lunas', () => {
    assert.match(sumber, /Pembayaran diterima, menunggu konfirmasi/);
    assert.doesNotMatch(sumber, /Pembayaran lunas/i);
  });
});

// ===========================================================================
// LEDGER: PAYMENT PAID SEBAGAI SATU-SATUNYA BUKTI UANG MASUK
// ===========================================================================
//
// Semua pembaca uang — refund, invoice, email, laporan — berangkat dari
// fungsi-fungsi di `src/lib/pembayaran.ts`. Kalau salah satu di antaranya
// menghitung `PENDING` sebagai uang, atau mencampur biaya tambahan ke pokok,
// kesalahannya tidak berhenti di layar: nominal yang ditransfer ke rekening
// pembeli dihitung dari angka yang sama.
describe('ledger pembayaran', () => {
  const { Prisma, PaymentStatus, PaymentTujuan } = require('@prisma/client');
  const { uangMasuk, uangMasukSemua, sisaTagihan, sudahLunas, masihAdaSisa } = require(JALUR_LEDGER);

  function baris(tujuan, status, jumlah) {
    return { tujuan, status, jumlah: new Prisma.Decimal(jumlah) };
  }

  it('hanya menghitung PAID; PENDING, EXPIRED, dan VOIDED bukan uang', () => {
    const payments = [
      baris(PaymentTujuan.DP, PaymentStatus.PAID, '400000'),
      baris(PaymentTujuan.PELUNASAN, PaymentStatus.PENDING, '600000'),
      baris(PaymentTujuan.PELUNASAN, PaymentStatus.EXPIRED, '600000'),
      baris(PaymentTujuan.FULL, PaymentStatus.VOIDED, '1000000'),
    ];

    assert.equal(uangMasuk(payments).toString(), '400000');
    assert.equal(uangMasukSemua(payments).toString(), '400000');
    assert.equal(sisaTagihan('1000000', payments).toString(), '600000');
    assert.equal(sudahLunas('1000000', payments), false);
    assert.equal(masihAdaSisa('1000000', payments), true);
  });

  it('TAMBAHAN di luar pokok: tidak mengurangi sisa tagihan, tapi masuk uang masuk semua', () => {
    const payments = [
      baris(PaymentTujuan.DP, PaymentStatus.PAID, '400000'),
      baris(PaymentTujuan.TAMBAHAN, PaymentStatus.PAID, '250000'),
    ];

    // Inti pemisahan pokok/tambahan. Kalau TAMBAHAN ikut ke `uangMasuk()`,
    // pesanan ini terlihat sudah menyetor 650.000 dari pokok 1.000.000 —
    // sisanya menyusut 250.000 tanpa ada pelunasan pokok sepeser pun.
    assert.equal(uangMasuk(payments).toString(), '400000');
    assert.equal(sisaTagihan('1000000', payments).toString(), '600000');
    assert.equal(uangMasukSemua(payments).toString(), '650000');
  });

  it('pesanan DP yang dilunasi tidak lagi dianggap punya sisa', () => {
    const payments = [
      baris(PaymentTujuan.DP, PaymentStatus.PAID, '400000'),
      baris(PaymentTujuan.PELUNASAN, PaymentStatus.PAID, '600000'),
    ];

    assert.equal(uangMasuk(payments).toString(), '1000000');
    assert.equal(sisaTagihan('1000000', payments).toString(), '0');
    assert.equal(sudahLunas('1000000', payments), true);
    assert.equal(masihAdaSisa('1000000', payments), false);
  });

  it('lebih bayar tidak menghasilkan sisa negatif, dan pesanan tanpa PAID belum punya sisa "terpakai"', () => {
    const lebih = [baris(PaymentTujuan.FULL, PaymentStatus.PAID, '1050000')];
    const kosong = [baris(PaymentTujuan.FULL, PaymentStatus.PENDING, '1000000')];

    assert.equal(sisaTagihan('1000000', lebih).toString(), '0');
    assert.equal(sudahLunas('1000000', lebih), true);

    // `masihAdaSisa` sengaja false di sini: belum ada uang masuk sama sekali,
    // jadi ini bukan "pesanan DP yang menunggu pelunasan".
    assert.equal(uangMasuk(kosong).toString(), '0');
    assert.equal(masihAdaSisa('1000000', kosong), false);
  });

  it('sisaTambahan: hanya TAMBAHAN yang PAID mengurangi, dan hasilnya ditahan di nol', () => {
    const { sisaTambahan } = require(JALUR_LEDGER);
    const charges = [{ amount: new Prisma.Decimal('300000') }, { amount: new Prisma.Decimal('200000') }];

    // PENDING bukan uang: tagihan biaya tambahan yang sudah dibuka tapi belum
    // dibayar tidak boleh mengecilkan sisa yang ditagihkan ke pembeli.
    assert.equal(
      sisaTambahan(charges, [baris(PaymentTujuan.TAMBAHAN, PaymentStatus.PENDING, '500000')]).toString(),
      '500000'
    );

    // Pembayaran pokok tidak pernah menyentuh sisa biaya tambahan, dan sebaliknya.
    assert.equal(
      sisaTambahan(charges, [baris(PaymentTujuan.DP, PaymentStatus.PAID, '400000')]).toString(),
      '500000'
    );

    assert.equal(
      sisaTambahan(charges, [baris(PaymentTujuan.TAMBAHAN, PaymentStatus.PAID, '300000')]).toString(),
      '200000'
    );

    // Kelebihan bayar ditahan di nol, bukan menjadi sisa negatif yang akan
    // dibaca layar sebagai "pembeli masih berutang minus dua ratus ribu".
    assert.equal(
      sisaTambahan(charges, [baris(PaymentTujuan.TAMBAHAN, PaymentStatus.PAID, '700000')]).toString(),
      '0'
    );

    assert.equal(sisaTambahan([], []).toString(), '0');
  });

  it('tenggat pelunasan H-3 dihitung dari startDate, bukan installedAt', () => {
    const { HARI_TENGGAT_PELUNASAN, tenggatPelunasan, tenggatPelunasanLewat } = require(JALUR_LEDGER);

    // Tanggal tayang 20 Oktober → tenggat 17 Oktober akhir hari. Acuannya
    // `startDate`: uang pelunasan justru dibutuhkan untuk MENCETAK dan MEMASANG,
    // jadi memakai `installedAt` berarti menunggu tenggat yang baru ada setelah
    // pekerjaan yang uangnya belum masuk sudah selesai dikerjakan.
    // Dibangun sebagai tanggal LOKAL, bukan dari string UTC: `tenggatPelunasan`
    // memundurkan hari dan mematok jam pada zona waktu server, jadi fixture UTC
    // membuat test ini lulus atau gagal tergantung zona mesin yang menjalankannya.
    const tayang = new Date(2026, 9, 20, 0, 0, 0, 0);
    const tenggat = tenggatPelunasan(tayang);

    assert.equal(HARI_TENGGAT_PELUNASAN, 3);
    assert.equal(tenggat.getDate(), 17);
    assert.equal(tenggat.getMonth(), 9);
    assert.equal(tenggat.getHours(), 23);
    assert.equal(tenggat.getMinutes(), 59);

    // Batasnya inklusif: sesaat sebelum tengah malam belum terlambat.
    assert.equal(tenggatPelunasanLewat(tayang, tenggat), false);
    assert.equal(tenggatPelunasanLewat(tayang, new Date(tenggat.getTime() + 1)), true);
    assert.equal(tenggatPelunasanLewat(tayang, new Date(2026, 9, 1)), false);
  });
});

// ===========================================================================
// KELAYAKAN BAYAR: SATU ATURAN UNTUK MODUL SESI, HALAMAN BAYAR, DAN KARTU
// ===========================================================================
describe('periksaKelayakanSesi', () => {
  const { BookingStatus, PaymentTujuan } = require('@prisma/client');
  const { SISA_WAKTU_MIN_MS, STATUS_BOLEH_BAYAR_LANJUTAN, periksaKelayakanSesi, bayarLanjutan } = require(JALUR_LEDGER);

  const SEKARANG = new Date('2026-09-27T10:00:00.000Z');

  function periksa(ganti = {}) {
    return periksaKelayakanSesi({
      statusPesanan: BookingStatus.PENDING_PAYMENT,
      tujuanTagihan: PaymentTujuan.DP,
      tenggatPesanan: new Date(SEKARANG.getTime() + 60 * 60 * 1000),
      sekarang: SEKARANG,
      ...ganti,
    });
  }

  it('DP/FULL: hanya PENDING_PAYMENT, dan tenggat 24 jam pesanan tetap ditegakkan', () => {
    for (const tujuan of [PaymentTujuan.DP, PaymentTujuan.FULL]) {
      assert.deepEqual(periksa({ tujuanTagihan: tujuan }), { boleh: true });

      // Pesanan yang sudah dibayar DP bukan lagi PENDING_PAYMENT; tagihan DP
      // kedua di sana tidak boleh dibuka.
      const statusSalah = periksa({ tujuanTagihan: tujuan, statusPesanan: BookingStatus.PAID_CONFIRMED });
      assert.equal(statusSalah.boleh, false);
      assert.equal(statusSalah.kode, 'STATUS_TIDAK_MENUNGGU_BAYAR');
      assert.equal(statusSalah.status, 409);

      const tanpaTenggat = periksa({ tujuanTagihan: tujuan, tenggatPesanan: null });
      assert.equal(tanpaTenggat.kode, 'TENGGAT_TIDAK_TERSEDIA');

      const lewat = periksa({
        tujuanTagihan: tujuan,
        tenggatPesanan: new Date(SEKARANG.getTime() - 1),
      });
      assert.equal(lewat.kode, 'TENGGAT_LEWAT');

      // Sesi yang dibuka beberapa detik sebelum tenggat hangus di tengah pembeli
      // mengisi datanya, dan uangnya masuk setelah pesanan sudah dihanguskan.
      const terlaluDekat = periksa({
        tujuanTagihan: tujuan,
        tenggatPesanan: new Date(SEKARANG.getTime() + SISA_WAKTU_MIN_MS - 1),
      });
      assert.equal(terlaluDekat.kode, 'TENGGAT_TERLALU_DEKAT');
    }
  });

  it('PELUNASAN/TAMBAHAN: pesanan berjalan boleh bayar, dan tenggat 24 jam TIDAK diperiksa', () => {
    for (const tujuan of [PaymentTujuan.PELUNASAN, PaymentTujuan.TAMBAHAN]) {
      assert.equal(bayarLanjutan(tujuan), true);

      for (const status of STATUS_BOLEH_BAYAR_LANJUTAN) {
        // `tenggatPesanan: null` DAN tenggat yang sudah lewat keduanya harus
        // lolos. Pada pesanan yang sudah dibayar DP, `Booking.expiresAt` adalah
        // tenggat 24 jam waktu pesanan masih baru — nilainya hampir pasti sudah
        // lewat, dan memeriksanya menutup setiap pelunasan yang sah.
        assert.deepEqual(
          periksaKelayakanSesi({
            statusPesanan: status,
            tujuanTagihan: tujuan,
            tenggatPesanan: null,
            sekarang: SEKARANG,
          }),
          { boleh: true },
          `${tujuan} pada ${status} tanpa tenggat`
        );

        assert.deepEqual(
          periksaKelayakanSesi({
            statusPesanan: status,
            tujuanTagihan: tujuan,
            tenggatPesanan: new Date(SEKARANG.getTime() - 30 * 24 * 60 * 60 * 1000),
            sekarang: SEKARANG,
          }),
          { boleh: true },
          `${tujuan} pada ${status} dengan tenggat lewat`
        );
      }
    }

    assert.equal(STATUS_BOLEH_BAYAR_LANJUTAN.includes(BookingStatus.IN_PRODUCTION), true);
  });

  it('PELUNASAN/TAMBAHAN: pesanan yang direfund atau sudah tutup tidak menerima uang baru', () => {
    // Menerima setoran baru pada pesanan yang sedang direfund berarti uang masuk
    // dan uang keluar berjalan bersamaan di satu pesanan — dan nominal refundnya
    // dihitung dari uang masuk, jadi angkanya berubah di tengah proses.
    for (const status of [
      BookingStatus.REVIEW_REFUND,
      BookingStatus.WAITING_BANK,
      BookingStatus.PROCESS_REFUND,
      BookingStatus.REFUNDED,
      BookingStatus.CANCELLED,
    ]) {
      for (const tujuan of [PaymentTujuan.PELUNASAN, PaymentTujuan.TAMBAHAN]) {
        const hasil = periksaKelayakanSesi({
          statusPesanan: status,
          tujuanTagihan: tujuan,
          tenggatPesanan: null,
          sekarang: SEKARANG,
        });

        assert.equal(hasil.boleh, false, `${tujuan} pada ${status} harus ditolak`);
        assert.equal(hasil.kode, 'STATUS_TIDAK_MENERIMA_BAYAR');
        assert.equal(hasil.status, 409);
      }
    }
  });
});

// ===========================================================================
// REFUND PEMBELI: NOMINAL DARI UANG MASUK, BUKAN DARI RENCANA DP
// ===========================================================================
describe('POST /api/booking/request-refund step bank', () => {
  const { Prisma, PaymentStatus, PaymentTujuan, BookingStatus } = require('@prisma/client');

  function barisPembayaran(tujuan, status, jumlah) {
    return { tujuan, status, jumlah: new Prisma.Decimal(jumlah) };
  }

  function cocokBaris(row, where) {
    if (!where) return true;
    return Object.entries(where).every(([nama, syarat]) => row[nama] === syarat);
  }

  /**
   * Database stateful dengan transaksi yang diserialisasi.
   *
   * Serialisasi memodelkan database yang memilih satu pemenang di antara dua
   * permintaan paralel: permintaan kedua membaca status yang sudah commit, lalu
   * CAS-nya tidak cocok lagi. Tanpa ini, dua klik pada tombol yang sama bisa
   * menghasilkan dua pengajuan refund atas satu pesanan.
   */
  function buatDbRefund(options = {}) {
    const calls = [];
    const payments = (options.payments ?? []).map((p) => ({ ...p }));
    let booking = {
      id: 'booking-1',
      userId: 'user-1',
      status: BookingStatus.WAITING_BANK,
      totalPrice: new Prisma.Decimal(options.totalPrice ?? '1000000'),
      // Sengaja diisi: rencana DP yang TIDAK boleh dipakai sebagai dasar
      // nominal refund. Kalau route membacanya, angkanya akan 360.000.
      dpAmount: new Prisma.Decimal(options.dpAmount ?? '400000'),
      duration: 30,
      refundAmount: null,
      refundedAt: null,
      userBankName: null,
      userBankAccount: null,
      ...(options.booking ?? {}),
    };

    function tabelBooking(ambil, simpan) {
      return {
        async findFirst(args) {
          calls.push('booking.findFirst');
          const row = ambil();
          if (!cocokBaris(row, args.where)) return null;
          return {
            ...row,
            billboard: { title: 'Billboard Sudirman', address: 'Jl. Sudirman' },
            user: { name: 'Budi Santoso', email: 'pembeli@contoh.test' },
            payments: payments.map((p) => ({ tujuan: p.tujuan, status: p.status, jumlah: p.jumlah })),
          };
        },
        async updateMany(args) {
          calls.push('booking.updateMany');
          const row = ambil();
          if (!cocokBaris(row, args.where)) return { count: 0 };
          simpan({ ...row, ...args.data });
          return { count: 1 };
        },
      };
    }

    let antrean = Promise.resolve();
    const prismaPalsu = {
      booking: tabelBooking(
        () => booking,
        (nilai) => {
          booking = nilai;
        }
      ),
      async $transaction(kerja) {
        const tungguGiliran = antrean;
        let bukaGiliran;
        antrean = new Promise((resolve) => {
          bukaGiliran = resolve;
        });
        await tungguGiliran;

        const sebelum = booking;
        let salinan = { ...booking };
        calls.push('transaction.begin');
        try {
          const hasil = await kerja({
            booking: tabelBooking(
              () => salinan,
              (nilai) => {
                salinan = nilai;
              }
            ),
          });
          booking = salinan;
          return hasil;
        } catch (error) {
          booking = sebelum;
          throw error;
        } finally {
          bukaGiliran();
        }
      },
    };

    return { prisma: prismaPalsu, calls, booking: () => ({ ...booking }) };
  }

  function buatRouteRefund(fake) {
    const emails = [];
    const route = muatDenganModulPalsu(JALUR_ROUTE_REFUND, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'user-1', role: 'USER' } }) },
      '@/lib/auth': { authOptions: {} },
      '@/lib/prisma': { prisma: fake.prisma },
      '@/lib/mail': { sendEmail: async (args) => { emails.push(args); } },
    });
    return { route, emails };
  }

  function permintaanBank() {
    return new Request('https://contoh.test/api/booking/request-refund', {
      method: 'POST',
      body: JSON.stringify({
        step: 'bank',
        orderId: 'booking-1',
        bankName: 'BCA',
        bankAccount: '1234567890',
      }),
    });
  }

  it('menghitung 90% dari seluruh pokok PAID pada pesanan DP yang sudah dilunasi', async () => {
    process.env.ADMIN_EMAIL = 'bos@contoh.test';
    const fake = buatDbRefund({
      payments: [
        barisPembayaran(PaymentTujuan.DP, PaymentStatus.PAID, '400000'),
        barisPembayaran(PaymentTujuan.PELUNASAN, PaymentStatus.PAID, '600000'),
      ],
    });
    const { route, emails } = buatRouteRefund(fake);

    const response = await route.POST(permintaanBank());

    assert.equal(response.status, 200);
    // 900.000 = 90% dari 1.000.000 yang benar-benar masuk. Rumus lama membaca
    // `dpAmount` dan akan menghasilkan 360.000 — pembeli kehilangan 540.000
    // atas uang yang sudah ia setorkan.
    assert.equal(fake.booking().refundAmount.toString(), '900000');
    assert.equal(fake.booking().status, BookingStatus.PROCESS_REFUND);
    assert.equal(fake.booking().userBankName, 'BCA');
    assert.equal(fake.booking().userBankAccount, '1234567890');
    assert.equal(emails.length, 1);
    assert.match(emails[0].message, /Rp\s?1\.000\.000/);
    assert.match(emails[0].message, /\(lunas\)/);
  });

  it('pesanan yang baru menyetor DP direfund dari DP yang masuk dan disebut sebagian', async () => {
    process.env.ADMIN_EMAIL = 'bos@contoh.test';
    const fake = buatDbRefund({
      payments: [
        barisPembayaran(PaymentTujuan.DP, PaymentStatus.PAID, '400000'),
        barisPembayaran(PaymentTujuan.PELUNASAN, PaymentStatus.PENDING, '600000'),
      ],
    });
    const { route, emails } = buatRouteRefund(fake);

    const response = await route.POST(permintaanBank());

    assert.equal(response.status, 200);
    assert.equal(fake.booking().refundAmount.toString(), '360000');
    assert.match(emails[0].message, /\(sebagian\)/);
  });

  it('menolak refund pada pesanan tanpa satu pun Payment PAID', async () => {
    process.env.ADMIN_EMAIL = 'bos@contoh.test';
    const fake = buatDbRefund({
      payments: [barisPembayaran(PaymentTujuan.FULL, PaymentStatus.PENDING, '1000000')],
    });
    const { route, emails } = buatRouteRefund(fake);

    const response = await route.POST(permintaanBank());
    const isi = await response.json();

    assert.equal(response.status, 409);
    assert.match(isi.message, /Belum ada pembayaran yang tercatat/);
    // Yang paling penting: TIDAK menulis 900.000 dari `totalPrice`. Rumus lama
    // memperlakukan `dpAmount` nol sebagai "berarti bayar penuh", sehingga
    // pesanan yang belum membayar sepeser pun tetap dijadwalkan refund.
    assert.equal(fake.booking().refundAmount, null);
    assert.equal(fake.booking().status, BookingStatus.WAITING_BANK);
    assert.equal(fake.calls.includes('booking.updateMany'), false);
    assert.equal(emails.length, 0);
  });

  it('menolak step bank sebelum admin menyetujui pengajuan', async () => {
    const fake = buatDbRefund({
      booking: { status: BookingStatus.REVIEW_REFUND },
      payments: [barisPembayaran(PaymentTujuan.FULL, PaymentStatus.PAID, '1000000')],
    });
    const { route, emails } = buatRouteRefund(fake);

    const response = await route.POST(permintaanBank());
    const isi = await response.json();

    assert.equal(response.status, 409);
    assert.match(isi.message, /belum siap menerima data rekening/);
    assert.equal(fake.booking().refundAmount, null);
    assert.equal(emails.length, 0);
  });

  it('dua permintaan paralel hanya menghasilkan satu penulisan dan satu email', async () => {
    process.env.ADMIN_EMAIL = 'bos@contoh.test';
    const fake = buatDbRefund({
      payments: [barisPembayaran(PaymentTujuan.FULL, PaymentStatus.PAID, '1000000')],
    });
    const { route, emails } = buatRouteRefund(fake);

    const hasil = await Promise.all([route.POST(permintaanBank()), route.POST(permintaanBank())]);
    const status = hasil.map((r) => r.status).sort();

    assert.deepEqual(status, [200, 409]);
    assert.equal(emails.length, 1);
    assert.equal(fake.booking().refundAmount.toString(), '900000');
    // Hanya satu penulisan. Karena pembacaan pesanan ikut masuk ke dalam
    // transaksi, permintaan kedua membaca status yang sudah berpindah ke
    // `PROCESS_REFUND` dan berhenti di gerbang status — tidak sampai mencoba
    // CAS. Kalau pembacaan itu berada di luar transaksi seperti sebelumnya,
    // keduanya membaca `WAITING_BANK` dan sama-sama menulis.
    assert.equal(fake.calls.filter((nama) => nama === 'booking.updateMany').length, 1);
    assert.equal(fake.calls.filter((nama) => nama === 'transaction.begin').length, 2);
  });
});

// ===========================================================================
// PENYELESAIAN REFUND ADMIN: BUKTI WAJIB DAN PLAFON UANG MASUK
// ===========================================================================
describe('POST /api/admin/update-order gerbang REFUNDED', () => {
  const { Prisma, PaymentStatus, PaymentTujuan, BookingStatus } = require('@prisma/client');

  function barisPembayaran(tujuan, status, jumlah) {
    return { tujuan, status, jumlah: new Prisma.Decimal(jumlah) };
  }

  function buatDbAdmin(options = {}) {
    const calls = [];
    const payments = (options.payments ?? []).map((p) => ({ ...p }));
    let booking = {
      id: 'booking-1',
      status: options.status ?? BookingStatus.PROCESS_REFUND,
      totalPrice: new Prisma.Decimal(options.totalPrice ?? '1000000'),
      refundAmount: options.refundAmount === undefined ? new Prisma.Decimal('900000') : options.refundAmount,
      refundProof: options.refundProof ?? null,
      refundedAt: null,
      productionStartedAt: null,
      installedAt: null,
      installationProof: null,
      cancelReason: null,
      isLocked: false,
      duration: 30,
    };

    function lengkap(row) {
      return {
        ...row,
        payments: payments.map((p) => ({ tujuan: p.tujuan, status: p.status, jumlah: p.jumlah })),
        user: { name: 'Budi Santoso', email: 'pembeli@contoh.test' },
        billboard: { title: 'Billboard Sudirman', address: 'Jl. Sudirman' },
      };
    }

    const prismaPalsu = {
      async $transaction(kerja) {
        let salinan = { ...booking };
        const hasil = await kerja({
          booking: {
            async findUnique() {
              calls.push('booking.findUnique');
              return lengkap(salinan);
            },
            async updateMany(args) {
              calls.push('booking.updateMany');
              if (args.where.status !== salinan.status) return { count: 0 };
              salinan = { ...salinan, ...args.data };
              return { count: 1 };
            },
            async findUniqueOrThrow() {
              return lengkap(salinan);
            },
          },
        });
        booking = salinan;
        return hasil;
      },
    };

    return { prisma: prismaPalsu, calls, booking: () => ({ ...booking }) };
  }

  function buatRouteAdmin(fake) {
    const emails = [];
    const route = muatDenganModulPalsu(JALUR_ROUTE_UPDATE_ORDER, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'admin-1', role: 'ADMIN' } }) },
      '@/lib/auth': { authOptions: {} },
      '@/lib/prisma': { prisma: fake.prisma },
      '@/lib/mail': { sendEmail: async (args) => { emails.push(args); } },
    });
    return { route, emails };
  }

  function permintaan(isi) {
    return new Request('https://contoh.test/api/admin/update-order', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'booking-1', ...isi }),
    });
  }

  const PAID_PENUH = [barisPembayaran(PaymentTujuan.FULL, PaymentStatus.PAID, '1000000')];

  it('menolak REFUNDED tanpa bukti transfer', async () => {
    const fake = buatDbAdmin({ payments: PAID_PENUH });
    const { route, emails } = buatRouteAdmin(fake);

    const response = await route.POST(permintaan({ newStatus: 'REFUNDED' }));
    const isi = await response.json();

    assert.equal(response.status, 422);
    assert.match(isi.message, /Bukti transfer wajib dilampirkan/);
    assert.equal(fake.booking().status, BookingStatus.PROCESS_REFUND);
    assert.equal(fake.booking().refundedAt, null);
    assert.equal(fake.calls.includes('booking.updateMany'), false);
    assert.equal(emails.length, 0);
  });

  it('menolak bukti transfer yang bukan URL http/https', async () => {
    const fake = buatDbAdmin({ payments: PAID_PENUH });
    const { route } = buatRouteAdmin(fake);

    for (const bukti of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'sudah ditransfer kok']) {
      const response = await route.POST(permintaan({ newStatus: 'REFUNDED', refundProof: bukti }));
      assert.equal(response.status, 422);
      assert.equal(fake.booking().status, BookingStatus.PROCESS_REFUND);
    }
  });

  for (const [judul, refundAmount] of [
    ['belum tercatat', null],
    ['nol', new Prisma.Decimal('0')],
    ['negatif', new Prisma.Decimal('-1')],
  ]) {
    it(`menolak REFUNDED bila nominal refund ${judul}`, async () => {
      const fake = buatDbAdmin({ payments: PAID_PENUH, refundAmount });
      const { route, emails } = buatRouteAdmin(fake);

      const response = await route.POST(
        permintaan({ newStatus: 'REFUNDED', refundProof: 'https://bukti.contoh.test/1.png' })
      );
      const isi = await response.json();

      assert.equal(response.status, 422);
      assert.match(isi.message, /Nominal refund belum tercatat/);
      assert.equal(fake.booking().status, BookingStatus.PROCESS_REFUND);
      assert.equal(emails.length, 0);
    });
  }

  it('menolak nominal refund yang melebihi uang pokok yang pernah masuk', async () => {
    // Pesanan DP: 400.000 masuk dari kontrak 1.000.000, tapi `refundAmount`
    // tertulis 900.000 — nilai yang hanya masuk akal kalau seseorang
    // menghitungnya dari `totalPrice`.
    const fake = buatDbAdmin({
      payments: [barisPembayaran(PaymentTujuan.DP, PaymentStatus.PAID, '400000')],
      refundAmount: new Prisma.Decimal('900000'),
    });
    const { route, emails } = buatRouteAdmin(fake);

    const response = await route.POST(
      permintaan({ newStatus: 'REFUNDED', refundProof: 'https://bukti.contoh.test/1.png' })
    );
    const isi = await response.json();

    assert.equal(response.status, 422);
    assert.match(isi.message, /melebihi uang yang pernah/);
    assert.equal(fake.booking().status, BookingStatus.PROCESS_REFUND);
    assert.equal(emails.length, 0);
  });

  it('biaya tambahan yang dibayar tidak menaikkan plafon refund pokok', async () => {
    // `uangMasuk()` mengecualikan TAMBAHAN. Kalau plafonnya dihitung dari
    // `uangMasukSemua()`, refund 620.000 lolos — perusahaan mengembalikan uang
    // biaya tambahan sebagai bagian dari pokok.
    const fake = buatDbAdmin({
      payments: [
        barisPembayaran(PaymentTujuan.DP, PaymentStatus.PAID, '400000'),
        barisPembayaran(PaymentTujuan.TAMBAHAN, PaymentStatus.PAID, '250000'),
      ],
      refundAmount: new Prisma.Decimal('620000'),
    });
    const { route } = buatRouteAdmin(fake);

    const response = await route.POST(
      permintaan({ newStatus: 'REFUNDED', refundProof: 'https://bukti.contoh.test/1.png' })
    );

    assert.equal(response.status, 422);
    assert.equal(fake.booking().status, BookingStatus.PROCESS_REFUND);
  });

  it('menerima REFUNDED lengkap dan mencatat waktu refund', async () => {
    const fake = buatDbAdmin({ payments: PAID_PENUH });
    const { route, emails } = buatRouteAdmin(fake);

    const response = await route.POST(
      permintaan({ newStatus: 'REFUNDED', refundProof: 'https://bukti.contoh.test/1.png' })
    );

    assert.equal(response.status, 200);
    assert.equal(fake.booking().status, BookingStatus.REFUNDED);
    assert.equal(fake.booking().refundProof, 'https://bukti.contoh.test/1.png');
    assert.ok(fake.booking().refundedAt instanceof Date);
    assert.equal(emails.length, 1);
    assert.match(emails[0].subject, /Refund/);
  });

  it('email ACTIVE tidak menagih sisa pada pesanan yang sudah lunas', async () => {
    const fake = buatDbAdmin({ status: BookingStatus.INSTALLATION, payments: PAID_PENUH });
    const { route, emails } = buatRouteAdmin(fake);

    const response = await route.POST(permintaan({ newStatus: 'ACTIVE' }));

    assert.equal(response.status, 200);
    assert.equal(emails.length, 1);
    assert.doesNotMatch(emails[0].message, /Sisa|sisa|dilunasi/);
    assert.match(emails[0].message, /sudah terpasang/);
  });

  it('email ACTIVE menagih sisa yang sama dengan sisaTagihan pada pesanan DP', async () => {
    const { sisaTagihan } = require(JALUR_LEDGER);
    const payments = [barisPembayaran(PaymentTujuan.DP, PaymentStatus.PAID, '400000')];
    const fake = buatDbAdmin({ status: BookingStatus.INSTALLATION, payments });
    const { route, emails } = buatRouteAdmin(fake);

    const response = await route.POST(permintaan({ newStatus: 'ACTIVE' }));

    assert.equal(response.status, 200);
    assert.equal(sisaTagihan('1000000', payments).toString(), '600000');
    assert.match(emails[0].message, /Sisa <b>Rp\s?600\.000<\/b>/);
    assert.match(emails[0].message, /sudah kami terima Rp\s?400\.000/);
  });

  it('pesanan DP yang biaya tambahannya dibayar tetap ditagih sisa pokok penuh', async () => {
    const fake = buatDbAdmin({
      status: BookingStatus.INSTALLATION,
      payments: [
        barisPembayaran(PaymentTujuan.DP, PaymentStatus.PAID, '400000'),
        barisPembayaran(PaymentTujuan.TAMBAHAN, PaymentStatus.PAID, '250000'),
      ],
    });
    const { route, emails } = buatRouteAdmin(fake);

    await route.POST(permintaan({ newStatus: 'ACTIVE' }));

    // Bukan 350.000. Biaya tambahan bukan pembayaran pokok.
    assert.match(emails[0].message, /Sisa <b>Rp\s?600\.000<\/b>/);
  });
});

// ===========================================================================
// BIAYA TAMBAHAN: SATU TAGIHAN SISA, BUKAN SATU TAGIHAN PER BIAYA
// ===========================================================================
describe('POST /api/admin/orders/add-charge penerbit tagihan TAMBAHAN', () => {
  const { Prisma, PaymentStatus, PaymentTujuan } = require('@prisma/client');

  /**
   * Database stateful dengan transaksi yang benar-benar rollback.
   *
   * Rollback harus dimodelkan, bukan dilewati: salah satu hal yang diuji di sini
   * adalah bahwa penolakan 409 tidak meninggalkan `AdditionalCharge` yatim —
   * kewajiban yang tercatat tanpa tagihan yang bisa dibayar.
   */
  function buatDbCharge(options = {}) {
    let charges = (options.charges ?? []).map((c) => ({ ...c }));
    let payments = (options.payments ?? []).map((p) => ({ ...p }));
    const calls = [];

    function tabel(ambilCharge, simpanCharge, ambilPayment, simpanPayment) {
      return {
        additionalCharge: {
          async create(args) {
            calls.push('additionalCharge.create');
            simpanCharge([...ambilCharge(), { id: `ac-${ambilCharge().length + 1}`, ...args.data }]);
          },
        },
        booking: {
          async update(args) {
            calls.push('booking.update');
            if (args.where.id !== 'booking-1') {
              throw new Prisma.PrismaClientKnownRequestError('pesanan tidak ada', {
                code: 'P2025',
                clientVersion: 'test',
              });
            }
            return {
              id: 'booking-1',
              duration: 30,
              user: { email: 'pembeli@contoh.test', name: 'Budi Santoso' },
              billboard: { title: 'Billboard Sudirman', address: 'Jl. Sudirman' },
              additionalCharges: ambilCharge().map((c) => ({ amount: c.amount })),
              payments: ambilPayment().map((p) => ({
                id: p.id,
                tujuan: p.tujuan,
                status: p.status,
                jumlah: p.jumlah,
                providerSessionId: p.providerSessionId,
              })),
            };
          },
        },
        payment: {
          async updateMany(args) {
            calls.push('payment.updateMany');
            const rows = ambilPayment();
            const cocok = rows.filter(
              (row) =>
                row.id === args.where.id &&
                row.status === args.where.status &&
                row.providerSessionId === args.where.providerSessionId
            );
            if (cocok.length === 0) return { count: 0 };
            simpanPayment(
              rows.map((row) => (row.id === args.where.id ? { ...row, ...args.data } : row))
            );
            return { count: cocok.length };
          },
          async create(args) {
            calls.push('payment.create');
            const rows = ambilPayment();
            // Indeks unik bersyarat `payment_satu_tagihan_menganggur`.
            if (
              rows.some(
                (row) =>
                  row.tujuan === args.data.tujuan && row.status === PaymentStatus.PENDING
              )
            ) {
              throw new Prisma.PrismaClientKnownRequestError('tagihan menganggur duplikat', {
                code: 'P2002',
                clientVersion: 'test',
                meta: { target: ['bookingId', 'tujuan'] },
              });
            }
            const baris = {
              id: `pay-baru-${rows.length + 1}`,
              providerSessionId: null,
              ...args.data,
            };
            simpanPayment([...rows, baris]);
            return { id: baris.id };
          },
        },
      };
    }

    const prismaPalsu = {
      async $transaction(kerja) {
        let chargeSalinan = charges.map((c) => ({ ...c }));
        let paymentSalinan = payments.map((p) => ({ ...p }));
        try {
          const hasil = await kerja(
            tabel(
              () => chargeSalinan,
              (nilai) => {
                chargeSalinan = nilai;
              },
              () => paymentSalinan,
              (nilai) => {
                paymentSalinan = nilai;
              }
            )
          );
          charges = chargeSalinan;
          payments = paymentSalinan;
          calls.push('transaction.commit');
          return hasil;
        } catch (error) {
          calls.push('transaction.rollback');
          throw error;
        }
      },
    };

    return {
      prisma: prismaPalsu,
      calls,
      charges: () => charges.map((c) => ({ ...c })),
      payments: () => payments.map((p) => ({ ...p })),
    };
  }

  function buatRouteCharge(fake, peran = 'ADMIN') {
    const emails = [];
    const route = muatDenganModulPalsu(JALUR_ROUTE_ADD_CHARGE, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
      'next-auth': { getServerSession: async () => (peran ? { user: { id: 'admin-1', role: peran } } : null) },
      '@/lib/auth': { authOptions: {} },
      '@/lib/prisma': { prisma: fake.prisma },
      '@/lib/mail': { sendEmail: async (args) => { emails.push(args); } },
    });
    return { route, emails };
  }

  function permintaan(isi) {
    return new Request('https://contoh.test/api/admin/orders/add-charge', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'booking-1', description: 'Revisi cetak', amount: '250000', ...isi }),
    });
  }

  function tagihan(ganti = {}) {
    return {
      id: 'pay-tambahan',
      tujuan: PaymentTujuan.TAMBAHAN,
      status: PaymentStatus.PENDING,
      jumlah: new Prisma.Decimal('0'),
      providerSessionId: null,
      ...ganti,
    };
  }

  it('menolak pemanggil yang bukan admin tanpa menulis apa pun', async () => {
    const fake = buatDbCharge();
    const { route, emails } = buatRouteCharge(fake, 'USER');

    const response = await route.POST(permintaan({}));

    assert.equal(response.status, 401);
    assert.equal(fake.charges().length, 0);
    assert.equal(fake.calls.length, 0);
    assert.equal(emails.length, 0);
  });

  it('pesanan tanpa tagihan TAMBAHAN: membuat satu baris sebesar seluruh sisa tambahan', async () => {
    const fake = buatDbCharge();
    const { route, emails } = buatRouteCharge(fake);

    const response = await route.POST(permintaan({ amount: '250000' }));

    assert.equal(response.status, 200);
    assert.equal(fake.charges().length, 1);

    const baru = fake.payments();
    assert.equal(baru.length, 1);
    assert.equal(baru[0].tujuan, PaymentTujuan.TAMBAHAN);
    assert.equal(baru[0].status, PaymentStatus.PENDING);
    assert.equal(baru[0].jumlah.toString(), '250000');
    assert.equal(fake.calls.includes('transaction.commit'), true);

    // Surat dikirim setelah commit, menyebut sisa — bukan hanya biaya barunya.
    assert.equal(emails.length, 1);
    assert.equal(emails[0].to, 'pembeli@contoh.test');
  });

  it('biaya kedua tidak membuat baris kedua, hanya menaikkan jumlah yang ada', async () => {
    const fake = buatDbCharge({
      charges: [{ id: 'ac-1', amount: new Prisma.Decimal('250000') }],
      payments: [tagihan({ jumlah: new Prisma.Decimal('250000') })],
    });
    const { route } = buatRouteCharge(fake);

    const response = await route.POST(permintaan({ amount: '300000' }));

    assert.equal(response.status, 200);
    assert.equal(fake.charges().length, 2);

    // Satu baris, bukan dua. Indeks `payment_satu_tagihan_menganggur` hanya
    // mengizinkan satu tagihan TAMBAHAN menganggur per pesanan, jadi tidak ada
    // tempat untuk satu tagihan per biaya — dan memang tidak perlu ada: yang
    // ditagihkan kepada pembeli adalah satu angka.
    assert.equal(fake.payments().length, 1);
    assert.equal(fake.payments()[0].jumlah.toString(), '550000');
    assert.equal(fake.calls.includes('payment.create'), false);
    assert.equal(fake.calls.includes('payment.updateMany'), true);
  });

  it('nominal tagihan adalah SISA: yang sudah dibayar tidak ditagih ulang', async () => {
    const fake = buatDbCharge({
      charges: [{ id: 'ac-1', amount: new Prisma.Decimal('400000') }],
      payments: [
        // Tagihan lama sudah dibayar, jadi tidak lagi menganggur.
        tagihan({ id: 'pay-lunas', status: PaymentStatus.PAID, jumlah: new Prisma.Decimal('400000'), providerSessionId: 'ps-lama' }),
      ],
    });
    const { route } = buatRouteCharge(fake);

    await route.POST(permintaan({ amount: '150000' }));

    const baru = fake.payments().filter((p) => p.status === PaymentStatus.PENDING);
    assert.equal(baru.length, 1);
    // 550.000 total ditagihkan, 400.000 sudah masuk → 150.000, bukan 550.000.
    assert.equal(baru[0].jumlah.toString(), '150000');
  });

  it('tagihan TAMBAHAN yang sesinya sudah dibuka menolak 409 dan biayanya rollback', async () => {
    const fake = buatDbCharge({
      charges: [{ id: 'ac-1', amount: new Prisma.Decimal('250000') }],
      payments: [tagihan({ jumlah: new Prisma.Decimal('250000'), providerSessionId: 'ps-hidup' })],
    });
    const { route, emails } = buatRouteCharge(fake);

    const response = await route.POST(permintaan({ amount: '300000' }));

    assert.equal(response.status, 409);

    // Sesi Xendit dibuat atas nominal tertentu, dan webhook menolak pembayaran
    // yang nominalnya tidak sama (`NOMINAL_TIDAK_SESUAI`). Menaikkan `jumlah`
    // baris yang sesinya hidup berarti uang pembeli diterima gerbang lalu
    // ditolak sistem kita: masuk ke Xendit, tidak pernah tercatat di sini.
    assert.equal(fake.payments()[0].jumlah.toString(), '250000');

    // Biayanya TIDAK tertulis. Tanpa rollback, admin melihat "gagal" lalu
    // mencoba lagi, dan `AdditionalCharge` kedua ikut tertinggal — kewajiban
    // yang tidak punya tagihan.
    assert.equal(fake.charges().length, 1);
    assert.equal(fake.calls.includes('transaction.rollback'), true);
    assert.equal(fake.calls.includes('transaction.commit'), false);
    assert.equal(emails.length, 0);
  });

  it('pembuatan sesi yang menang balapan membatalkan seluruh penulisan', async () => {
    const fake = buatDbCharge({
      charges: [{ id: 'ac-1', amount: new Prisma.Decimal('250000') }],
      // Baris yang dibaca masih `PENDING` + `providerSessionId: null`, tetapi CAS
      // di bawah tidak menemukan pasangannya: status berubah di antara keduanya.
      payments: [tagihan({ status: PaymentStatus.EXPIRED, jumlah: new Prisma.Decimal('250000') })],
    });
    // Pembacaan melaporkan PENDING, penulisan menemui EXPIRED.
    const aslinya = fake.prisma.$transaction;
    fake.prisma.$transaction = (kerja) =>
      aslinya((tx) => {
        const bookingAsli = tx.booking.update;
        tx.booking.update = async (args) => {
          const pesanan = await bookingAsli(args);
          return {
            ...pesanan,
            payments: pesanan.payments.map((p) => ({ ...p, status: PaymentStatus.PENDING })),
          };
        };
        return kerja(tx);
      });

    const { route, emails } = buatRouteCharge(fake);

    const response = await route.POST(permintaan({ amount: '300000' }));

    assert.equal(response.status, 409);
    assert.equal(fake.charges().length, 1);
    assert.equal(fake.payments()[0].jumlah.toString(), '250000');
    assert.equal(fake.calls.includes('transaction.rollback'), true);
    assert.equal(emails.length, 0);
  });

  it('kegagalan email tidak membatalkan biaya yang sudah commit', async () => {
    const fake = buatDbCharge();
    const route = muatDenganModulPalsu(JALUR_ROUTE_ADD_CHARGE, {
      'next/server': { NextResponse: { json: (isi, init = {}) => new Response(JSON.stringify(isi), init) } },
      'next-auth': { getServerSession: async () => ({ user: { id: 'admin-1', role: 'SUPER_ADMIN' } }) },
      '@/lib/auth': { authOptions: {} },
      '@/lib/prisma': { prisma: fake.prisma },
      '@/lib/mail': { sendEmail: async () => { throw new Error('smtp mati'); } },
    });

    const response = await route.POST(permintaan({}));

    // SMTP bukan fakta uang. Biaya dan tagihannya sudah sah tercatat.
    assert.equal(response.status, 200);
    assert.equal(fake.charges().length, 1);
    assert.equal(fake.payments().length, 1);
    assert.equal(fake.calls.includes('transaction.commit'), true);
  });

  it('menolak nominal yang bukan angka positif sebelum menyentuh database', async () => {
    const fake = buatDbCharge();
    const { route } = buatRouteCharge(fake);

    for (const amount of ['0', '-5000', 'seratus ribu']) {
      const response = await route.POST(permintaan({ amount }));
      assert.equal(response.status, 400, `amount ${amount}`);
    }

    assert.equal(fake.calls.length, 0);
    assert.equal(fake.charges().length, 0);
  });
});

// ===========================================================================
// LAPORAN: DIBUKUKAN PADA WAKTU UANG, BUKAN PADA STATUS PESANAN
// ===========================================================================
describe('getRevenueData', () => {
  const { Prisma, PaymentStatus, BookingStatus } = require('@prisma/client');

  function buatLaporan({ penerimaan = [], refund = [], role = 'ADMIN' }) {
    const argumen = { payment: null, booking: null };
    const prismaPalsu = {
      payment: {
        async findMany(args) {
          argumen.payment = args;
          return penerimaan;
        },
      },
      booking: {
        async findMany(args) {
          argumen.booking = args;
          return refund;
        },
      },
    };
    const modul = muatDenganModulPalsu(JALUR_LAPORAN, {
      'next-auth': { getServerSession: async () => (role === null ? null : { user: { id: 'u', role } }) },
      '@/lib/auth': { authOptions: {} },
      '@/lib/prisma': { prisma: prismaPalsu },
    });
    return { getRevenueData: modul.getRevenueData, argumen };
  }

  it('menolak pemanggil yang bukan admin', async () => {
    for (const role of [null, 'USER', 'CS']) {
      const { getRevenueData } = buatLaporan({ role });
      await assert.rejects(getRevenueData('all'), /Unauthorized/);
    }
  });

  it('menyaring Payment PAID pada paidAt dan refund selesai pada refundedAt', async () => {
    const { getRevenueData, argumen } = buatLaporan({});
    await getRevenueData('all');

    assert.equal(argumen.payment.where.status, PaymentStatus.PAID);
    assert.ok(argumen.payment.where.paidAt.gte instanceof Date);
    assert.deepEqual(Object.keys(argumen.payment.select).sort(), ['jumlah', 'paidAt']);

    assert.equal(argumen.booking.where.status, BookingStatus.REFUNDED);
    assert.ok(argumen.booking.where.refundedAt.gte instanceof Date);
    assert.deepEqual(Object.keys(argumen.booking.select).sort(), ['refundAmount', 'refundedAt']);
  });

  it('membukukan tiap penerimaan pada bulan paidAt-nya sendiri', async () => {
    // Dua pembayaran atas SATU pesanan, berbulan-bulan terpisah. Rumus lama
    // membukukan keduanya pada `Booking.paidAt` — satu kolom yang tidak berubah
    // saat sisanya dibayar — sehingga pelunasan September hilang dari grafik.
    const { getRevenueData } = buatLaporan({
      penerimaan: [
        { jumlah: new Prisma.Decimal('400000'), paidAt: new Date(2026, 6, 10) },
        { jumlah: new Prisma.Decimal('600000'), paidAt: new Date(2026, 8, 5) },
      ],
    });

    const hasil = await getRevenueData('all');

    assert.deepEqual(hasil, [
      { name: "Jul '26", total: 400000 },
      { name: "Sep '26", total: 600000 },
    ]);
  });

  it('refund selesai menjadi pengurang pada bulan refundedAt, bukan penambah', async () => {
    const { getRevenueData } = buatLaporan({
      penerimaan: [
        { jumlah: new Prisma.Decimal('1000000'), paidAt: new Date(2026, 7, 10) },
        { jumlah: new Prisma.Decimal('500000'), paidAt: new Date(2026, 8, 5) },
      ],
      refund: [{ refundAmount: new Prisma.Decimal('900000'), refundedAt: new Date(2026, 8, 20) }],
    });

    const hasil = await getRevenueData('all');

    // Neto September = 500.000 − 900.000. Rumus lama justru MENAIKKAN bulan
    // refund, karena `REFUNDED` masuk daftar status pendapatan.
    assert.deepEqual(hasil, [
      { name: "Ags '26", total: 1000000 },
      { name: "Sep '26", total: -400000 },
    ]);
  });

  it('bulan yang hanya berisi refund tetap berada pada tempatnya di garis waktu', async () => {
    // Kunci Map yang bisa diurutkan (`YYYY-MM`) dipisah dari label manusia
    // justru untuk kasus ini. Kalau labelnya sendiri yang jadi kunci, urutannya
    // mengikuti urutan baris dari database dan Juni muncul di ujung grafik.
    const { getRevenueData } = buatLaporan({
      penerimaan: [{ jumlah: new Prisma.Decimal('1000000'), paidAt: new Date(2026, 8, 5) }],
      refund: [{ refundAmount: new Prisma.Decimal('200000'), refundedAt: new Date(2026, 5, 15) }],
    });

    const hasil = await getRevenueData('all');

    assert.deepEqual(hasil.map((t) => t.name), ["Jun '26", "Sep '26"]);
    assert.equal(hasil[0].total, -200000);
  });

  it('menjumlahkan Decimal sebagai Decimal, bukan menyambungnya sebagai teks', async () => {
    const { getRevenueData } = buatLaporan({
      penerimaan: [
        { jumlah: new Prisma.Decimal('100000'), paidAt: new Date(2026, 8, 1) },
        { jumlah: new Prisma.Decimal('50000'), paidAt: new Date(2026, 8, 2) },
      ],
    });

    const hasil = await getRevenueData('all');

    // `0 + Decimal(100000) + Decimal(50000)` akan menghasilkan "010000050000".
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].total, 150000);
    assert.equal(typeof hasil[0].total, 'number');
  });

  it('melewati baris yang waktunya kosong alih-alih membukukannya di epoch', async () => {
    const { getRevenueData } = buatLaporan({
      penerimaan: [
        { jumlah: new Prisma.Decimal('100000'), paidAt: null },
        { jumlah: new Prisma.Decimal('250000'), paidAt: new Date(2026, 8, 1) },
      ],
      refund: [{ refundAmount: new Prisma.Decimal('50000'), refundedAt: null }],
    });

    const hasil = await getRevenueData('all');

    assert.deepEqual(hasil, [{ name: "Sep '26", total: 250000 }]);
  });
});

// ===========================================================================
// BATAS SERIALISASI: YANG MENYEBERANG KE BROWSER HANYA ANGKA JADI
// ===========================================================================
//
// Dua hal yang dijaga di sini sekaligus. Pertama, `Prisma.Decimal` adalah objek
// dan tidak bisa diserialisasi — mengirimnya ke Client Component menggagalkan
// render, bukan sekadar menampilkan angka salah. Kedua, baris `Payment` memuat
// kaitan ke gerbang pembayaran; props Client Component tertanam di HTML halaman,
// jadi kolom apa pun yang ikut terkirim bisa dibaca siapa saja yang membuka
// devtools.
describe('batas serialisasi props client', () => {
  const KOLOM_PROVIDER = [
    'providerSessionId',
    'providerReferenceId',
    'providerPaymentId',
    'callbackPayload',
    'components_sdk_key',
    'componentsSdkKey',
  ];

  const BERKAS_CLIENT = [
    ['BookingCard', JALUR_BOOKING_CARD],
    ['TransactionClient', JALUR_TRANSACTION_CLIENT],
    ['UserClientPage', JALUR_USERS_CLIENT],
  ];

  /**
   * Buang komentar sebelum mencocokkan.
   *
   * File-file ini memuat komentar panjang yang justru MENJELASKAN kenapa
   * `Prisma.Decimal` dan `dpAmount` tidak boleh dipakai di sini. Mencocokkan
   * teks mentah akan menghukum dokumentasi itu, jadi yang diperiksa hanya
   * kodenya.
   */
  function kodeSaja(sumber) {
    return sumber
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((baris) => !/^\s*(\/\/|\*)/.test(baris))
      .join('\n');
  }

  for (const [nama, jalur] of BERKAS_CLIENT) {
    it(`${nama} tidak menyebut kolom provider maupun nilai Prisma`, () => {
      const kode = kodeSaja(fs.readFileSync(jalur, 'utf8'));
      for (const kolom of KOLOM_PROVIDER) {
        assert.equal(kode.includes(kolom), false, `${nama} menyebut ${kolom}`);
      }
      // `Prisma.Decimal` adalah objek: mengirimkannya sebagai prop MENGGAGALKAN
      // render, bukan menampilkan angka salah. Yang dilarang adalah membawa
      // nilai runtime Prisma ke bundle browser. `import type { PaymentTujuan }`
      // tetap boleh — ia hilang saat kompilasi dan hanya menamai enum.
      assert.doesNotMatch(kode, /Prisma\.Decimal/, `${nama} memakai Prisma.Decimal`);
      const imporPrisma = kode.match(/^import(?! type).*from '@prisma\/client';$/m);
      assert.equal(imporPrisma, null, `${nama} mengimpor nilai dari @prisma/client`);
    });
  }

  for (const [nama, jalur] of [
    ['DashboardWrapper', JALUR_DASHBOARD_WRAPPER],
    [
      'orders/page',
      path.join(__dirname, '..', 'src', 'app', 'admin', '(dashboard)', 'orders', 'page.tsx'),
    ],
    ['users/page', path.join(__dirname, '..', 'src', 'app', 'admin', '(dashboard)', 'users', 'page.tsx')],
  ]) {
    it(`${nama} memakai uangUntukClient/keAngka sebelum nominal menyeberang`, () => {
      const sumber = fs.readFileSync(jalur, 'utf8');
      assert.match(sumber, /uangUntukClient|keAngka/);
    });
  }

  it('pembaca uang tidak lagi memakai dpAmount sebagai bukti pembayaran', () => {
    for (const jalur of [JALUR_ROUTE_REFUND, JALUR_ROUTE_UPDATE_ORDER, JALUR_INVOICE, JALUR_LAPORAN]) {
      // Kata `dpAmount` masih boleh muncul di komentar yang menjelaskan kenapa
      // ia tidak dipakai; yang dilarang adalah membacanya dari objek pesanan.
      assert.doesNotMatch(
        kodeSaja(fs.readFileSync(jalur, 'utf8')),
        /\.dpAmount/,
        `${jalur} masih membaca .dpAmount`
      );
    }
  });

  it('invoice menghitung pokok dan tambahan dari ledger secara terpisah', () => {
    const sumber = fs.readFileSync(JALUR_INVOICE, 'utf8');
    assert.match(sumber, /uangMasuk\(order\.payments\)/);
    assert.match(sumber, /sisaPokokLedger\(order\.totalPrice, order\.payments\)/);
    assert.match(sumber, /p\.tujuan === PaymentTujuan\.TAMBAHAN/);
  });

  it('rumus sisa biaya tambahan dibaca dari ledger, tidak ditulis ulang per halaman', () => {
    // Rumusnya dulu ada tiga salinan: invoice pelanggan, halaman transaksi admin,
    // dan (setelah fase ini) route biaya tambahan. Tiga salinan dari satu aturan
    // berarti invoice pelanggan dan layar admin bisa menyebut sisa yang berbeda
    // untuk pesanan yang sama — dan yang salah tetap ditagihkan.
    const pembaca = [
      ['invoice', JALUR_INVOICE],
      ['orders/page', path.join(__dirname, '..', 'src', 'app', 'admin', '(dashboard)', 'orders', 'page.tsx')],
      ['add-charge', JALUR_ROUTE_ADD_CHARGE],
    ];

    for (const [nama, jalur] of pembaca) {
      const sumber = fs.readFileSync(jalur, 'utf8');
      assert.match(sumber, /from ['"]@\/lib\/pembayaran['"]/, `${nama} tidak membaca ledger`);
      assert.match(sumber, /sisaTambahan/, `${nama} tidak memakai sisaTambahan`);
    }
  });

  it('tenggat pelunasan H-3 dihitung server atas startDate, bukan installedAt dan bukan di browser', () => {
    const penulisTenggat = [
      ['DashboardWrapper', JALUR_DASHBOARD_WRAPPER],
      ['orders/page', path.join(__dirname, '..', 'src', 'app', 'admin', '(dashboard)', 'orders', 'page.tsx')],
    ];

    for (const [nama, jalur] of penulisTenggat) {
      const kode = kodeSaja(fs.readFileSync(jalur, 'utf8'));

      // `installedAt` baru terisi setelah pemasangan benar-benar dilakukan, jadi
      // memakainya berarti tenggat pelunasan tidak pernah ada sampai billboard
      // terpasang — padahal uangnya dibutuhkan justru untuk mencetak dan memasang.
      assert.match(kode, /tenggatPelunasanLewat\(\s*[\w.]*startDate/, `${nama} tidak memakai startDate`);
      assert.doesNotMatch(kode, /tenggatPelunasan\w*\(\s*[\w.]*installedAt/, `${nama} memakai installedAt`);

      // Hasilnya menyeberang sebagai ISO string dan boolean yang sudah diputuskan
      // server. Kalau browser menghitungnya sendiri, "terlambat" bergantung pada
      // jam mesin pembeli — dan jam itu bisa disetel.
      assert.match(kode, /tenggatPelunasanISO/, `${nama} tidak menyerialisasi tenggat sebagai ISO`);
    }

    // Komponen browser tidak boleh memegang rumusnya sama sekali.
    for (const [nama, jalur] of [['BookingCard', JALUR_BOOKING_CARD], ['TransactionClient', JALUR_TRANSACTION_CLIENT]]) {
      const kode = kodeSaja(fs.readFileSync(jalur, 'utf8'));
      assert.doesNotMatch(kode, /tenggatPelunasan\s*\(/, `${nama} menghitung tenggat sendiri`);
      assert.doesNotMatch(kode, /HARI_TENGGAT_PELUNASAN/, `${nama} memegang konstanta tenggat`);
    }
  });

  it('kelayakan bayar diputuskan server; kartu pesanan hanya membaca hasilnya', () => {
    const wrapper = kodeSaja(fs.readFileSync(JALUR_DASHBOARD_WRAPPER, 'utf8'));
    assert.match(wrapper, /periksaKelayakanSesi/);

    // Gerbang tombol dulu empat syarat hardcode di komponen browser. Boolean dari
    // client tidak pernah menjadi dasar penulisan — sesi tetap diperiksa ulang di
    // server — tetapi tombol yang syaratnya menyimpang dari server berarti pembeli
    // menekan tombol yang selalu dijawab 409.
    const kartu = kodeSaja(fs.readFileSync(JALUR_BOOKING_CARD, 'utf8'));
    assert.match(kartu, /bolehBayar/);
    assert.doesNotMatch(kartu, /periksaKelayakanSesi/, 'BookingCard mengulang aturan kelayakan');
    assert.doesNotMatch(kartu, /STATUS_BOLEH_BAYAR_LANJUTAN/, 'BookingCard memegang daftar status');
  });
});
