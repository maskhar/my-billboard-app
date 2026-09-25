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
const path = require('node:path');

const JALUR_MODUL = path.join(__dirname, '..', 'src', 'lib', 'xendit.ts');

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

  const hpDitolak = [
    ['format lokal', '08123456789'],
    ['tanpa + dan bukan angka', 'nomor saya'],
    ['dimulai nol setelah +', '+0123456789'],
    ['terlalu pendek (7 digit)', '+6281234'],
    ['terlalu panjang (16 digit)', '+6212345678901234'],
    ['hanya tanda +', '+'],
    ['ada spasi dan tanda hubung', '+62 812-3456-7890'],
    ['ada huruf', '+62812ABC4567'],
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

  it('memberi sesi beserta kunci SDK bila masih aktif', async () => {
    pasangFetch(jawaban({ body: sesiOk() }));
    const { ambilSesiAktifUntukKomponen } = muat();

    const sesi = await ambilSesiAktifUntukKomponen('ps-1', harapan);

    assert.ok(sesi);
    assert.equal(sesi.components_sdk_key, 'csk-palsu-untuk-tes');
  });

  // Tiap keadaan ini berarti sesi lama TIDAK bisa dipakai lagi. `null` menyuruh
  // pemanggil menutup baris lama dan membuat sesi baru; melempar akan membuat
  // pembeli terjebak pada tagihan yang tidak pernah bisa diselesaikan.
  const memberiNull = [
    ['status COMPLETED', sesiOk({ status: 'COMPLETED' })],
    ['status EXPIRED', sesiOk({ status: 'EXPIRED' })],
    ['status CANCELED', sesiOk({ status: 'CANCELED' })],
    ['kunci SDK sudah tidak ada', sesiOk({ components_sdk_key: null })],
    ['mode bukan COMPONENTS', sesiOk({ mode: 'PAYMENT_LINK' })],
    ['tenggat sudah lewat', sesiOk({ expires_at: new Date(Date.now() - 1000).toISOString() })],
    ['tenggat bukan tanggal', sesiOk({ expires_at: 'kapan-kapan' })],
    ['tenggat hilang', sesiOk({ expires_at: undefined })],
  ];

  for (const [judul, body] of memberiNull) {
    it(`memberi null bila ${judul}`, async () => {
      pasangFetch(jawaban({ body }));
      const { ambilSesiAktifUntukKomponen } = muat();

      assert.equal(await ambilSesiAktifUntukKomponen('ps-1', harapan), null);
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
