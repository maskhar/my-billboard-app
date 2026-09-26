// src/lib/xendit.ts
//
// Satu pintu ke API Xendit. Tidak ada `fetch` ke api.xendit.co di tempat lain.
//
// KENAPA TERPUSAT
// ---------------
// Kunci rahasia dipasang di header Authorization. Setiap tempat yang menyusun
// header itu sendiri adalah satu tempat lagi yang bisa keliru mencatatnya ke
// log. Di sini kunci hanya dibaca dari environment dan hanya dipakai di dalam
// satu fungsi; tidak ada baris yang mencetak nilainya, dan galat dari Xendit
// disaring dulu sebelum dicatat.
//
// VARIABEL ENVIRONMENT (isi sendiri di `.env.local`, JANGAN dicommit):
//
//   XENDIT_SECRET_KEY     Kunci rahasia dari Dashboard Xendit. Dipakai sebagai
//                         username HTTP Basic, password dikosongkan. Tidak ada
//                         = seluruh pembuatan pembayaran menolak jalan.
//   XENDIT_CALLBACK_TOKEN Token webhook dari Dashboard > Settings > Webhooks.
//                         Dikirim Xendit pada header `x-callback-token`.
//   XENDIT_API_BASE_URL   Opsional; hanya https://api.xendit.co yang diterima.
//                         Test memakai mock fetch, bukan host penerima kunci.
//
// GAGAL TERTUTUP, BUKAN GAGAL TERBUKA: bila kunci belum diisi, fungsi di sini
// melempar. Lebih baik tombol Bayar menampilkan galat daripada sistem
// diam-diam menganggap pembayaran beres tanpa pernah menghubungi Xendit.

// Modul ini memegang kunci rahasia, jadi ia tidak boleh pernah ikut terbundel
// ke browser. `server-only` membuat kesalahan seperti itu gagal SAAT BUILD,
// bukan menjadi kunci yang terkirim ke setiap pengunjung.
import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { keDecimal, lebihBesar, type NilaiUang } from './money';
import { keE164 } from './telepon';

const BASE_URL_DEFAULT = 'https://api.xendit.co';

/** Batas waktu menunggu Xendit. Lihat alasannya di `panggilXendit`. */
const BATAS_WAKTU_MS = 15_000;

/**
 * Host yang boleh menerima kunci rahasia kita.
 *
 * `XENDIT_API_BASE_URL` ada karena environment kadang perlu menyebut host
 * tujuan secara eksplisit, tapi variabel itu juga berarti satu salah ketik —
 * atau satu environment yang disusupi — cukup untuk MENGIRIM KUNCI RAHASIA ke
 * host milik orang lain. Kunci itu bisa memerintahkan pembayaran, jadi tujuan
 * permintaan diperlakukan sebagai keputusan keamanan, bukan konfigurasi bebas.
 *
 * Daftarnya sengaja berisi nama host PERSIS, bukan pola `*.xendit.co`. Pola
 * subdomain akan meloloskan host mana pun yang bisa dibuat orang lain di bawah
 * domain itu — dan host seperti itu tidak perlu jahat, cukup bukan penerima yang
 * kita maksud. Pengujian tidak butuh pelonggaran ini: `fetch` yang dimock tidak
 * pernah benar-benar mengirim kunci ke mana pun.
 */
const HOST_DIIZINKAN = ['api.xendit.co'];

/** Galat dari Xendit atau dari pemeriksaan sebelum memanggilnya. */
export class GalatXendit extends Error {
  constructor(
    readonly status: number,
    readonly kodeGalat: string,
    pesan: string
  ) {
    super(pesan);
    this.name = 'GalatXendit';
  }
}

function baseUrl(): string {
  const dariEnv = process.env.XENDIT_API_BASE_URL;
  if (!dariEnv) return BASE_URL_DEFAULT;

  let url: URL;
  try {
    url = new URL(dariEnv);
  } catch {
    throw new GalatXendit(
      0,
      'BASE_URL_TIDAK_VALID',
      'XENDIT_API_BASE_URL bukan URL yang sah. Permintaan dihentikan sebelum kunci dikirim.'
    );
  }

  // http:// akan mengirim kunci rahasia dalam bentuk yang bisa dibaca siapa pun
  // di jaringan yang sama.
  if (url.protocol !== 'https:') {
    throw new GalatXendit(
      0,
      'BASE_URL_BUKAN_HTTPS',
      'XENDIT_API_BASE_URL harus https. Permintaan dihentikan sebelum kunci dikirim.'
    );
  }

  const host = url.hostname.toLowerCase();
  if (!HOST_DIIZINKAN.includes(host)) {
    throw new GalatXendit(
      0,
      'BASE_URL_BUKAN_HOST_XENDIT',
      'XENDIT_API_BASE_URL harus menunjuk api.xendit.co. Permintaan dihentikan sebelum kunci dikirim.'
    );
  }

  // Kredensial di dalam URL ikut terkirim pada setiap permintaan dan mudah
  // bocor ke log.
  if (url.username || url.password) {
    throw new GalatXendit(
      0,
      'BASE_URL_BERISI_KREDENSIAL',
      'XENDIT_API_BASE_URL tidak boleh memuat username/password.'
    );
  }

  if (url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new GalatXendit(
      0,
      'BASE_URL_TIDAK_VALID',
      'XENDIT_API_BASE_URL tidak boleh memuat port khusus, path, query, atau fragmen.'
    );
  }
  return url.origin;
}

function kunciRahasia(): string {
  const kunci = process.env.XENDIT_SECRET_KEY;
  if (!kunci) {
    // Pesan ini masuk log server dan mungkin terbaca banyak orang, jadi ia
    // hanya menyebut NAMA variabelnya — nilainya tidak pernah ikut.
    throw new GalatXendit(
      0,
      'KUNCI_BELUM_DIISI',
      'XENDIT_SECRET_KEY belum diisi. Pembuatan sesi pembayaran dihentikan.'
    );
  }
  return kunci;
}

/**
 * Header Authorization untuk HTTP Basic.
 *
 * Xendit memakai kunci rahasia sebagai USERNAME dengan password kosong — karena
 * itu ada tanda `:` di akhir. Tanpa tanda itu, Xendit membaca kunci sebagai
 * "username tanpa password yang dipisahkan" dan menolak dengan 401, yang mudah
 * disalahartikan sebagai kunci yang salah.
 */
function headerAuth(): string {
  return 'Basic ' + Buffer.from(`${kunciRahasia()}:`).toString('base64');
}

/**
 * Catat galat Xendit ke log server tanpa ikut membocorkan rahasia.
 *
 * Isi jawaban Xendit TIDAK diteruskan ke pemanggil (lihat `panggilXendit`), tapi
 * tanpa jejak sama sekali kegagalan pembayaran tidak bisa ditelusuri. Jalan
 * tengahnya: catat di sisi server saja, dipangkas, dan dengan nilai yang mirip
 * kunci rahasia disamarkan lebih dulu — jawaban galat validasi bisa memuat
 * kembali apa pun yang kita kirim.
 */
function catatGalat(path: string, status: number, kode: string, pesan: unknown): void {
  const kunci = process.env.XENDIT_SECRET_KEY;
  let teks = typeof pesan === 'string' ? pesan : '';
  if (kunci && teks.includes(kunci)) {
    teks = teks.split(kunci).join('[KUNCI_DISAMARKAN]');
  }
  // Karakter kendali dibuang supaya isi jawaban tidak bisa menyuntikkan baris
  // palsu ke dalam log.
  teks = teks.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
  console.error(`[xendit] ${path} gagal — status ${status}, kode ${kode}: ${teks}`);
}

/**
 * Panggil satu endpoint Xendit.
 *
 * TIDAK ADA PERCOBAAN ULANG OTOMATIS di sini, dan itu disengaja. Permintaan ke
 * `/sessions` punya efek samping uang; mengulangnya sendiri ketika jawabannya
 * tidak sampai berarti bisa membuat dua sesi untuk satu tagihan. Pemanggil yang
 * melihat kegagalan harus memeriksa keadaan sebenarnya (lihat `ambilSesi`),
 * bukan menembak ulang.
 *
 * `idempotencyKey` hanya diteruskan bila diisi, dan hanya dipakai pada endpoint
 * yang MENDOKUMENTASIKAN header tersebut (saat ini: Customers). Untuk endpoint
 * yang tidak mendokumentasikannya, header itu tidak dikirim — mengandalkan
 * jaminan yang tidak pernah dijanjikan lebih berbahaya daripada tidak punya
 * jaminan sama sekali, karena pengaman sebenarnya jadi tidak dibangun.
 */
async function panggilXendit<T>(
  method: 'POST' | 'GET' | 'PATCH',
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: headerAuth(),
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  // Batas waktu dipasang eksplisit. `fetch` tanpa batas waktu bisa menggantung
  // selama gateway lambat, dan permintaan yang menggantung itu menahan
  // pemanggilnya — pada route pembayaran, artinya pembeli menatap tombol yang
  // berputar tanpa akhir dan menekannya lagi.
  const pembatal = AbortSignal.timeout(BATAS_WAKTU_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: pembatal,
      // Pengalihan TIDAK diikuti. Mengikutinya berarti header Authorization
      // bisa terkirim ke host tujuan pengalihan — yang belum tentu Xendit.
      redirect: 'error',
      // Jangan pernah di-cache: setiap panggilan ini punya efek samping uang.
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof GalatXendit) throw error;
    const habisWaktu = error instanceof Error && error.name === 'TimeoutError';
    throw new GalatXendit(
      0,
      habisWaktu ? 'BATAS_WAKTU' : 'JARINGAN_GAGAL',
      habisWaktu
        ? 'Xendit tidak menjawab dalam batas waktu. Status pembayaran belum tentu gagal — periksa sesinya.'
        : 'Gagal menghubungi Xendit. Status pembayaran belum tentu gagal — periksa sesinya.'
    );
  }

  let teks = '';
  try {
    teks = await res.text();
  } catch {
    // Badan jawaban putus di tengah jalan. Ini TIDAK boleh diulang: bila
    // permintaannya `POST /sessions`, sesinya mungkin sudah jadi.
    throw new GalatXendit(
      res.status,
      'JAWABAN_TERPUTUS',
      'Jawaban Xendit terputus sebelum lengkap. Periksa keadaan sesi sebelum mencoba lagi.'
    );
  }

  let data: any = null;
  try {
    data = teks ? JSON.parse(teks) : null;
  } catch {
    // Jawaban bukan JSON (mis. halaman galat proxy).
    catatGalat(path, res.status, 'JAWABAN_BUKAN_JSON', teks);
    throw new GalatXendit(
      res.status,
      'JAWABAN_BUKAN_JSON',
      `Xendit menjawab ${res.status} dengan isi yang bukan JSON.`
    );
  }

  if (!res.ok) {
    const kode =
      typeof data?.error_code === 'string' ? data.error_code : 'GALAT_TIDAK_DIKENAL';

    // Pesan dari Xendit sengaja TIDAK dibawa ke dalam galat yang dilempar.
    // Jawaban galat validasi memuat kembali isi permintaan kita, dan galat yang
    // dilempar bisa berakhir di layar pembeli, di pelacak galat, atau di
    // tangkapan layar. Isinya tetap tercatat — hanya di log server, sudah
    // disamarkan.
    catatGalat(path, res.status, kode, data?.message);
    throw new GalatXendit(res.status, kode, `Xendit menolak permintaan (${kode}).`);
  }

  return data as T;
}

// ============================================================================
// PEMERIKSAAN MASUKAN
// ============================================================================

/** Panjang `reference_id` yang diterima Xendit. */
const REFERENCE_MAKS = 64;

function periksaReference(referenceId: string): string {
  if (!referenceId || referenceId.length > REFERENCE_MAKS) {
    throw new GalatXendit(
      0,
      'REFERENCE_TIDAK_VALID',
      `reference_id wajib diisi dan maksimal ${REFERENCE_MAKS} karakter.`
    );
  }
  return referenceId;
}

/**
 * Ubah nominal rupiah menjadi `number` yang boleh dikirim ke Xendit.
 *
 * KENAPA number, bukan string: skema resmi `POST /sessions` menyatakan
 * `amount` bertipe `number` (`Payment_Session_Amount`, minimum 0). Mengirim
 * string adalah tebakan, dan tebakan pada kolom nominal berakhir sebagai
 * penolakan 400 atau — lebih buruk — nominal yang ditafsirkan lain.
 *
 * Masukan tetap bertipe `NilaiUang`, sama seperti helper di `money.ts`; jadi
 * pemanggil boleh meneruskan `Prisma.Decimal` langsung tanpa mengubahnya menjadi
 * string/number lebih awal.
 *
 * KENAPA TETAP AMAN: perhitungan uang di sistem ini seluruhnya `Prisma.Decimal`
 * (lihat `src/lib/money.ts`); konversi hanya terjadi di batas paling akhir ini,
 * dan hanya diizinkan untuk RUPIAH BULAT. Rupiah tidak dipakai sampai sen, jadi
 * pecahan di sini bukan kasus yang sah melainkan tanda ada pembulatan yang
 * terlewat di hulu — lebih baik ditolak keras daripada diam-diam dibulatkan
 * oleh gerbang pembayaran. Batas `MAX_SAFE_INTEGER` menjaga agar nominal
 * tidak pernah melewati titik di mana `number` mulai kehilangan presisi.
 */
export function nominalUntukXendit(jumlah: NilaiUang): number {
  // `keDecimal` memakai aturan yang sama dengan seluruh perhitungan uang di
  // sistem ini, termasuk memetakan nilai tak masuk akal (`NaN`, kosong, teks
  // bukan angka) menjadi 0 — yang lalu ditolak pemeriksaan di bawah. Jadi
  // masukan rusak berakhir sebagai penolakan, bukan sebagai tagihan aneh.
  const nominal = keDecimal(jumlah);

  if (!nominal.isInteger()) {
    throw new GalatXendit(
      0,
      'NOMINAL_TIDAK_VALID',
      'Nominal harus rupiah bulat tanpa pecahan.'
    );
  }

  const bulat = nominal.toNumber();
  if (!lebihBesar(nominal, 0) || !Number.isSafeInteger(bulat)) {
    throw new GalatXendit(
      0,
      'NOMINAL_DI_LUAR_BATAS',
      'Nominal harus lebih dari nol dan masih dalam batas bilangan bulat yang aman.'
    );
  }
  return bulat;
}

/** Host yang boleh memakai `http://` sebagai origin komponen pembayaran. */
const HOST_LOKAL = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Satu kebijakan `http://` untuk origin dan untuk URL kembali.
 *
 * Kedua nilai itu menunjuk halaman yang SAMA, jadi kebijakannya tidak boleh
 * berbeda: origin yang lolos tapi URL kembalinya ditolak membuat pembuatan sesi
 * gagal dengan galat yang seolah-olah salah konfigurasi, padahal aturannya
 * memang saling bertentangan.
 *
 * `http://` hanya boleh untuk host lokal (`localhost`, `127.0.0.1`, `[::1]`) dan
 * hanya di luar production. Di mesin pengembang tidak ada TLS dan lalu lintasnya
 * tidak keluar dari mesin itu. Di luar itu `http://` berarti halaman pembayaran
 * yang bisa disadap dan diganti isinya.
 */
function bolehHttpDiSini(url: URL): boolean {
  if (url.protocol !== 'http:') return false;
  if (process.env.NODE_ENV === 'production') return false;
  return HOST_LOKAL.includes(url.hostname.toLowerCase());
}

/**
 * Pastikan URL kembali aman dipakai.
 *
 * URL ini dikirim ke Xendit dan pembeli DIALIHKAN ke sana. `http://` membuat
 * halaman kembalinya bisa disadap, dan kredensial di dalam URL akan tampil di
 * bilah alamat pembeli sekaligus tercatat di log Xendit.
 */
function periksaUrlKembali(url: string, nama: string): string {
  let hasil: URL;
  try {
    hasil = new URL(url);
  } catch {
    throw new GalatXendit(0, 'URL_KEMBALI_TIDAK_VALID', `${nama} bukan URL yang sah.`);
  }
  if (hasil.protocol !== 'https:' && !bolehHttpDiSini(hasil)) {
    throw new GalatXendit(
      0,
      'URL_KEMBALI_BUKAN_HTTPS',
      `${nama} harus memakai https, kecuali host lokal di luar production.`
    );
  }
  if (hasil.username || hasil.password) {
    throw new GalatXendit(
      0,
      'URL_KEMBALI_BERISI_KREDENSIAL',
      `${nama} tidak boleh memuat username/password.`
    );
  }
  return hasil.toString();
}

/**
 * Origin aplikasi ini, dibaca dari `APP_ORIGIN`.
 *
 * ===================== KENAPA DARI ENV, BUKAN DARI PERMINTAAN =====================
 * Nilai ini dikirim sebagai `components_configuration.origins`, dan daftar itu
 * menentukan halaman MANA yang boleh memasang komponen pembayaran dengan kunci
 * SDK sesi ini. Kalau nilainya diambil dari permintaan masuk — `Host`,
 * `X-Forwarded-Host`, `Origin`, atau `new URL(req.url).origin` — maka pengirim
 * permintaanlah yang menentukan halaman siapa yang berhak memasang komponen
 * pembayaran kita. Header itu dikendalikan klien dan proxy, jadi ia bukan
 * identitas; ia masukan.
 *
 * Karena itu origin TIDAK menjadi parameter `buatSesiPembayaran`: parameter
 * berarti ada route yang boleh mengisinya, dan route-lah yang memegang objek
 * request. Satu-satunya sumbernya adalah konfigurasi server.
 * ==================================================================================
 *
 * Yang dikirim hanya ORIGIN (skema + host + port). Path, query, kredensial, dan
 * fragmen ditolak: origin bukan alamat halaman, dan sisa URL di situ hanya
 * membuat pencocokan di sisi Xendit gagal secara membingungkan.
 *
 * `http://` hanya diizinkan untuk host lokal (`localhost`, `127.0.0.1`, `[::1]`)
 * dan hanya di luar production. Di mesin pengembang tidak ada TLS dan lalu
 * lintasnya tidak keluar dari mesin itu. Untuk host lain `http://` ditolak:
 * halaman pembayaran yang bisa disadap sama artinya dengan komponen pembayaran
 * yang bisa diganti isinya.
 *
 * `APP_ORIGIN` sengaja variabel sendiri, tidak menumpang `NEXTAUTH_URL`.
 * `NEXTAUTH_URL` di `.env.example` masih `http://localhost:3000` sementara
 * `npm run dev` menyalakan port 4000; menumpang nilai yang sudah tidak cocok
 * akan membuat komponen pembayaran ditolak dengan galat CORS yang menyesatkan.
 */
export function originAplikasi(): string {
  const dariEnv = (process.env.APP_ORIGIN || '').trim();
  if (!dariEnv) {
    throw new GalatXendit(
      0,
      'ORIGIN_BELUM_DIISI',
      'APP_ORIGIN belum diisi. Pembuatan sesi pembayaran dihentikan.'
    );
  }

  let url: URL;
  try {
    url = new URL(dariEnv);
  } catch {
    throw new GalatXendit(0, 'ORIGIN_TIDAK_VALID', 'APP_ORIGIN bukan URL yang sah.');
  }

  if (url.protocol !== 'https:' && !bolehHttpDiSini(url)) {
    throw new GalatXendit(
      0,
      'ORIGIN_BUKAN_HTTPS',
      'APP_ORIGIN harus https, kecuali host lokal di luar production.'
    );
  }
  if (url.username || url.password) {
    throw new GalatXendit(
      0,
      'ORIGIN_BERISI_KREDENSIAL',
      'APP_ORIGIN tidak boleh memuat username/password.'
    );
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new GalatXendit(
      0,
      'ORIGIN_BUKAN_ORIGIN',
      'APP_ORIGIN hanya boleh berisi skema, host, dan port — tanpa path, query, atau fragmen.'
    );
  }
  return url.origin;
}

/**
 * Halaman tempat pembeli mendarat setelah kanal yang MENGALIHKAN keras selesai.
 *
 * Mode Components menanam pembayaran di halaman sendiri, tapi sebagian kanal
 * (3DS kartu, pindah ke aplikasi e-wallet) tetap membawa pembeli keluar dari
 * halaman. Tanpa `return_url`, Xendit memulangkan mereka ke halaman miliknya —
 * tepat hal yang mode ini dipilih untuk dihindari.
 */
const JALUR_KEMBALI = '/pembayaran/selesai';

// ============================================================================
// CUSTOMER
// ============================================================================

export type CustomerXendit = { id: string; reference_id: string };

function periksaCustomer(data: unknown, referenceId: string): CustomerXendit {
  if (!data || typeof data !== 'object') {
    throw new GalatXendit(0, 'CUSTOMER_TIDAK_SESUAI', 'Jawaban customer Xendit bukan objek.');
  }
  const customer = data as Record<string, unknown>;
  if (typeof customer.id !== 'string' || customer.id.length === 0) {
    throw new GalatXendit(0, 'CUSTOMER_TIDAK_SESUAI', 'Jawaban customer Xendit tidak memuat id.');
  }
  if (customer.reference_id !== referenceId) {
    throw new GalatXendit(
      0,
      'CUSTOMER_TIDAK_SESUAI',
      'Jawaban customer Xendit bukan milik pengguna ini.'
    );
  }
  return { id: customer.id, reference_id: referenceId };
}

/**
 * Cari customer Xendit berdasarkan `reference_id` milik kita.
 *
 * Dipakai sebagai jalan pulih ketika `POST /customers` menjawab 409
 * DUPLICATE_ERROR: artinya customer-nya sudah ada di Xendit tapi id-nya belum
 * tersimpan di sisi kita (mis. proses mati setelah pembuatan berhasil). Tanpa
 * ini, pengguna tersebut tidak akan pernah bisa membayar lagi — setiap upaya
 * membuat customer baru ditolak dengan galat yang sama, selamanya.
 *
 * Hasilnya DICOCOKKAN ULANG dengan reference yang diminta. Endpoint daftar bisa
 * menjawab dengan pencocokan yang lebih longgar daripada yang kita maksud, dan
 * memakai baris pertama begitu saja berarti menautkan pembayaran seseorang ke
 * customer milik orang lain.
 */
export async function cariCustomer(referenceId: string): Promise<CustomerXendit | null> {
  periksaReference(referenceId);
  const hasil = await panggilXendit<unknown>(
    'GET',
    `/customers?reference_id=${encodeURIComponent(referenceId)}`
  );
  const data = hasil && typeof hasil === 'object' ? (hasil as Record<string, unknown>).data : null;
  const daftar = Array.isArray(data) ? data : [];
  const cocok = daftar.find(
    (customer) =>
      customer &&
      typeof customer === 'object' &&
      (customer as Record<string, unknown>).reference_id === referenceId
  );
  return cocok ? periksaCustomer(cocok, referenceId) : null;
}

/**
 * Bersihkan nama untuk `individual_detail.given_names`.
 *
 * Xendit mensyaratkan nama tanpa karakter khusus. Nama akun di sistem ini bebas
 * diisi pengguna — tanda kutip, emoji, titik gelar — dan satu karakter yang
 * ditolak akan menggagalkan SELURUH pembayaran. Karena nama di sini hanya
 * kelengkapan tampilan pada halaman pembayaran, membersihkannya jauh lebih baik
 * daripada membiarkan pembeli tidak bisa membayar.
 */
function bersihkanNama(nama: string | null): string {
  const bersih = (nama || '')
    .normalize('NFKD')
    // Apa pun di luar huruf/angka ASCII dan spasi dibuang.
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255)
    .trim();
  return bersih || 'Pelanggan';
}

/**
 * Buat customer Xendit, atau pakai yang sudah ada bila ternyata duplikat.
 *
 * `referenceId` harus stabil per pengguna (dipakai id User), karena Xendit
 * mensyaratkan nilainya unik.
 */
export async function pastikanCustomer(input: {
  referenceId: string;
  email: string;
  nama: string | null;
  nomorHp?: string | null;
}): Promise<CustomerXendit> {
  periksaReference(input.referenceId);

  // Nomor HP hanya dikirim bila benar-benar bisa dibentuk menjadi E.164. Format
  // lokal ("08123...") ditolak Xendit, dan penolakan itu akan menggagalkan
  // seluruh pembayaran — padahal nomor HP tidak wajib di sini.
  //
  // Penafsirannya diserahkan ke `keE164` supaya hanya ada SATU tempat yang
  // memutuskan bentuk nomor mana yang sah. Ketika pola itu hidup di dua tempat,
  // nomor yang sama bisa diterima saat pendaftaran lalu diam-diam dibuang di sini.
  const nomorE164 = keE164(input.nomorHp);

  try {
    const data = await panggilXendit<unknown>(
      'POST',
      '/customers',
      {
        reference_id: input.referenceId,
        type: 'INDIVIDUAL',
        email: input.email,
        ...(nomorE164 ? { mobile_number: nomorE164 } : {}),
        individual_detail: { given_names: bersihkanNama(input.nama) },
      },
      // Endpoint Customers mendokumentasikan header `idempotency-key`, jadi
      // dipakai di sini: dua permintaan bersamaan dari satu pengguna tidak
      // menghasilkan dua customer.
      `customer-${input.referenceId}`
    );
    return periksaCustomer(data, input.referenceId);
  } catch (error) {
    if (error instanceof GalatXendit && error.status === 409) {
      const adaSebelumnya = await cariCustomer(input.referenceId);
      if (adaSebelumnya) return adaSebelumnya;
    }
    throw error;
  }
}

// ============================================================================
// SESSION
// ============================================================================

export type SesiXendit = {
  payment_session_id: string;
  status: string;
  mode: string;
  reference_id: string;
  customer_id: string | null;
  amount: number;
  expires_at: string | null;
  /**
   * Kunci berumur pendek dan khusus untuk sesi ini. Hanya boleh diteruskan ke
   * browser pembeli yang memiliki pesanan; jangan simpan di DB, URL, atau log.
   * `null` pada sesi yang sudah tidak aktif.
   */
  components_sdk_key: string | null;
  /** Ada pada sesi yang telah menyelesaikan pembayaran. */
  payment_id?: string | null;
};

/** Apa yang KITA minta, untuk dicocokkan dengan apa yang dijawab. */
type HarapanSesi = { referenceId: string; customerId: string; nominal: number };

function tolakSesi(sebab: string): never {
  // Sebab ditulis sebagai kategori, BUKAN nilai yang dijawab Xendit. Jawaban
  // sesi memuat `components_sdk_key`; mencetak isinya untuk menjelaskan galat
  // berarti menuliskan kunci itu ke log.
  throw new GalatXendit(0, 'SESI_TIDAK_SESUAI', `Jawaban sesi Xendit tidak sesuai: ${sebab}.`);
}

function teksIsi(nilai: unknown): string | null {
  return typeof nilai === 'string' && nilai.length > 0 ? nilai : null;
}

/**
 * Periksa jawaban sesi sebelum ia dipercaya.
 *
 * `panggilXendit` ditutup dengan `data as T` — cast, bukan pemeriksaan. Tanpa
 * fungsi ini, jawaban yang bentuknya lain (proxy yang menyisip, endpoint yang
 * salah, kontrak API yang berubah) lolos sebagai "sukses" dan baris `Payment`
 * diperbarui dengan `undefined`.
 *
 * Yang dicocokkan bukan cuma bentuk, tapi ISInya terhadap apa yang kita minta.
 * Sesi yang `reference_id`-nya bukan milik kita adalah sesi orang lain: menautkan
 * baris ledger ke sana berarti pembayaran satu orang menutup tagihan orang lain.
 */
function periksaSesi(data: unknown, harapan: HarapanSesi | null, buatBaru: boolean): SesiXendit {
  if (!data || typeof data !== 'object') tolakSesi('bukan objek');
  const o = data as Record<string, unknown>;

  const id = teksIsi(o.payment_session_id);
  if (!id) tolakSesi('payment_session_id kosong');

  const status = teksIsi(o.status);
  if (!status) tolakSesi('status kosong');

  const referenceId = teksIsi(o.reference_id);
  if (!referenceId) tolakSesi('reference_id kosong');

  if (typeof o.amount !== 'number' || !Number.isFinite(o.amount)) {
    tolakSesi('amount bukan angka');
  }

  if (harapan) {
    if (referenceId !== harapan.referenceId) tolakSesi('reference_id bukan milik tagihan ini');
    if (o.customer_id !== harapan.customerId) tolakSesi('customer_id bukan pemilik tagihan ini');
    if (o.amount !== harapan.nominal) tolakSesi('amount berbeda dari nominal yang dikirim');
  }

  const mode = teksIsi(o.mode);
  const expiresAt = teksIsi(o.expires_at);
  const sdkKey = teksIsi(o.components_sdk_key);

  if (buatBaru) {
    // Sesi yang baru dibuat harus siap dipakai. Sesi yang lahir dalam keadaan
    // lain berarti pembeli akan menatap komponen pembayaran yang tidak bisa
    // dipakai, sementara ledger mencatatnya sebagai tagihan yang menunggu.
    if (mode !== 'COMPONENTS') tolakSesi('mode bukan COMPONENTS');
    if (status !== 'ACTIVE') tolakSesi('sesi baru tidak berstatus ACTIVE');
    if (!sdkKey) tolakSesi('components_sdk_key kosong');
    const tenggat = expiresAt ? Date.parse(expiresAt) : NaN;
    if (Number.isNaN(tenggat)) tolakSesi('expires_at bukan tanggal yang sah');
    if (tenggat <= Date.now()) tolakSesi('sesi baru sudah kedaluwarsa');
  }

  return {
    payment_session_id: id,
    status,
    mode: mode ?? '',
    reference_id: referenceId,
    customer_id: teksIsi(o.customer_id),
    amount: o.amount,
    expires_at: expiresAt,
    components_sdk_key: sdkKey,
    payment_id: teksIsi(o.payment_id),
  };
}

/**
 * Buat sesi pembayaran mode COMPONENTS untuk ditanam di halaman aplikasi.
 *
 * Satu sesi menampung beberapa percobaan bayar: pembeli yang gagal di tengah
 * jalan bisa mengulang pada komponen yang sama. Sesi yang KEDALUWARSA tidak bisa
 * dihidupkan lagi oleh Xendit — karena itu pemanggil harus membuat sesi baru,
 * bukan menyegarkan yang lama (lihat catatan pada model `Payment`).
 *
 * `components_sdk_key` pada jawaban sengaja tidak mendapat tempat penyimpanan di
 * model `Payment`. Route server hanya boleh meneruskannya sekali kepada pembeli
 * yang terautentikasi dan memiliki pesanan itu.
 *
 * TIDAK ADA `idempotency-key` di sini. Dokumentasi resmi `POST /sessions` tidak
 * menyebutkan header itu, jadi ia tidak boleh dijadikan pengaman terhadap klik
 * ganda. Yang menjaga hal itu adalah indeks unik bersyarat
 * `payment_satu_tagihan_menganggur` di database: satu tagihan menganggur per
 * (pesanan, tujuan), ditegakkan sebelum Xendit dipanggil.
 */
export async function buatSesiPembayaran(input: {
  referenceId: string;
  customerId: string;
  jumlah: NilaiUang;
  deskripsi: string;
  expiresAt: Date;
}): Promise<SesiXendit> {
  periksaReference(input.referenceId);
  const nominal = nominalUntukXendit(input.jumlah);
  const origin = originAplikasi();
  const returnUrl = periksaUrlKembali(
    new URL(JALUR_KEMBALI, origin).toString(),
    'components_configuration.return_url'
  );

  // Tenggat yang sudah lewat akan membuat sesi mati sejak lahir: komponen
  // pembayaran langsung kedaluwarsa dan barisnya menganggur sampai penyapu
  // membereskannya.
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
    throw new GalatXendit(0, 'TENGGAT_TIDAK_VALID', 'expiresAt bukan tanggal yang sah.');
  }
  if (input.expiresAt.getTime() <= Date.now()) {
    throw new GalatXendit(
      0,
      'TENGGAT_SUDAH_LEWAT',
      'expiresAt harus di masa depan, kalau tidak sesi kedaluwarsa sejak dibuat.'
    );
  }

  const data = await panggilXendit<unknown>('POST', '/sessions', {
    reference_id: input.referenceId,
    customer_id: input.customerId,
    session_type: 'PAY',
    mode: 'COMPONENTS',
    currency: 'IDR',
    country: 'ID',
    amount: nominal,
    // Pembayaran ditangkap langsung. `MANUAL` menahan dana dan menuntut
    // panggilan capture tersendiri — kalau panggilan itu tidak ada, otorisasi
    // yang tidak pernah ditangkap akan hangus dan uangnya tidak pernah masuk.
    capture_method: 'AUTOMATIC',
    // Metode pembayaran tidak disimpan. Sistem ini tidak punya tagihan
    // berulang, jadi menyimpan instrumen pembayaran hanya menambah data
    // sensitif tanpa ada yang memakainya.
    allow_save_payment_method: 'DISABLED',
    description: input.deskripsi,
    expires_at: input.expiresAt.toISOString(),
    locale: 'id',
    components_configuration: {
      origins: [origin],
      return_url: returnUrl,
    },
  });

  return periksaSesi(data, { referenceId: input.referenceId, customerId: input.customerId, nominal }, true);
}

/**
 * Ambil keadaan sesi langsung dari Xendit.
 *
 * Ini jaring pengaman untuk webhook yang hilang: webhook Xendit bisa tertunda
 * dan urutannya tidak dijamin, jadi keadaan yang tercatat di sini tidak boleh
 * menjadi satu-satunya sumber. Dipakai penyapu dan halaman "kembali dari
 * pembayaran" untuk bertanya langsung, bukan menunggu.
 */
export async function ambilSesi(sessionId: string): Promise<SesiXendit> {
  if (!sessionId) {
    throw new GalatXendit(0, 'SESSION_ID_KOSONG', 'sessionId wajib diisi.');
  }
  const data = await panggilXendit<unknown>(
    'GET',
    `/sessions/${encodeURIComponent(sessionId)}`
  );
  // GET dipakai untuk membaca sesi COMPLETED/EXPIRED juga, jadi status, key
  // kosong, dan tenggat lewat bukan galat di fungsi umum ini.
  return periksaSesi(data, null, false);
}

/**
 * Selang waktu sesudah tenggat sebelum sesi berani disebut mati.
 *
 * Sesi yang tenggatnya baru saja lewat belum tentu kosong: pembayaran yang
 * dimulai pada detik-detik terakhir bisa belum punya `payment_id` ketika kita
 * bertanya. Mengganti tagihannya saat itu berarti menagih ulang uang yang
 * sedang berjalan. Sesudah selang ini tidak ada pembayaran baru yang bisa
 * dimulai pada sesi tersebut, jadi keadaannya sudah tenang.
 */
const GRACE_SESI_MATI_MS = 10 * 60 * 1000;

/**
 * Keadaan satu sesi Components, dilihat dari sisi tagihan pemiliknya.
 *
 * ================== KENAPA BUKAN `SesiXendit | null` LAGI ==================
 * Bentuk lama memetakan COMPLETED, EXPIRED, CANCELED, kunci hilang, dan status
 * yang tidak dikenal menjadi satu nilai `null` — dan pemanggil mengartikan
 * `null` sebagai "tutup tagihannya, buka tagihan pengganti".
 *
 * Untuk sesi yang SUDAH DIBAYAR, arti itu salah dan mahal: webhook bisa tiba
 * beberapa detik setelah pembeli selesai, dan pada jeda itu tagihan lamanya
 * ditandai kedaluwarsa lalu tagihan baru dibuka. Pembeli melihat tagihan yang
 * masih terbuka untuk kewajiban yang baru saja ia bayar, dan membayarnya dua
 * kali.
 *
 * Karena itu keadaannya dipisah, dan HANYA `MATI` yang mengizinkan penggantian.
 * Status yang tidak dikenal jatuh ke `TIDAK_PASTI`, bukan ke `MATI`: kontrak API
 * yang berubah tidak boleh diam-diam berubah menjadi izin menagih ulang.
 * ==========================================================================
 */
export type KeadaanSesiKomponen =
  /** Masih bisa dipakai. Kunci SDK dan tenggat dijamin ada. */
  | { keadaan: 'AKTIF'; sesi: SesiXendit & { components_sdk_key: string; expires_at: string } }
  /** Sudah ada pembayaran pada sesi ini. Tunggu webhook; jangan tagih ulang. */
  | { keadaan: 'DIBAYAR'; sesi: SesiXendit }
  /** Terbukti kedaluwarsa/dibatalkan tanpa pembayaran. Boleh diganti. */
  | { keadaan: 'MATI'; sesi: SesiXendit }
  /** Belum bisa disimpulkan. Jangan dipakai, jangan diganti. */
  | { keadaan: 'TIDAK_PASTI'; sesi: SesiXendit };

/**
 * Periksa keadaan sesi Components milik satu tagihan.
 *
 * Hanya sesi milik tagihan yang sama yang diperiksa: `reference_id`, customer,
 * dan nominal yang tidak cocok tetap MELEMPAR (lihat `periksaSesi`), karena
 * jawaban milik tagihan lain bukan "keadaan sesi ini", melainkan kekeliruan.
 */
export async function ambilSesiAktifUntukKomponen(
  sessionId: string,
  harapan: HarapanSesi
): Promise<KeadaanSesiKomponen> {
  periksaReference(harapan.referenceId);
  const nominal = nominalUntukXendit(harapan.nominal);
  const data = await panggilXendit<unknown>(
    'GET',
    `/sessions/${encodeURIComponent(sessionId)}`
  );
  const sesi = periksaSesi(data, { ...harapan, nominal }, false);

  const status = sesi.status.toUpperCase();
  const tenggat = sesi.expires_at ? Date.parse(sesi.expires_at) : NaN;
  const sudahLewat = !Number.isNaN(tenggat) && tenggat <= Date.now();

  // Uang lebih dulu diperiksa daripada apa pun: satu sesi yang punya pembayaran
  // tidak boleh diganti, berapa pun status dan tenggatnya.
  if (sesi.payment_id || status === 'COMPLETED') {
    return { keadaan: 'DIBAYAR', sesi };
  }

  if (
    sesi.mode === 'COMPONENTS' &&
    status === 'ACTIVE' &&
    sesi.components_sdk_key &&
    !Number.isNaN(tenggat) &&
    !sudahLewat
  ) {
    return {
      keadaan: 'AKTIF',
      sesi: sesi as SesiXendit & { components_sdk_key: string; expires_at: string },
    };
  }

  // Penyedia menyatakannya berakhir, atau tenggatnya sudah lewat cukup lama
  // sehingga tidak ada pembayaran baru yang bisa dimulai di sana.
  if (
    status === 'EXPIRED' ||
    status === 'CANCELED' ||
    status === 'CANCELLED' ||
    (!Number.isNaN(tenggat) && tenggat + GRACE_SESI_MATI_MS <= Date.now())
  ) {
    return { keadaan: 'MATI', sesi };
  }

  return { keadaan: 'TIDAK_PASTI', sesi };
}

// ============================================================================
// WEBHOOK
// ============================================================================

/**
 * Apakah token pada webhook ini cocok dengan milik kita?
 *
 * ==================== BATAS YANG TIDAK BISA DITUTUP ====================
 * Xendit TIDAK menandatangani webhook-nya dengan HMAC. Yang ada hanya token
 * STATIS pada header `x-callback-token`, satu nilai untuk seluruh akun. Token
 * statis membuktikan pengirim tahu sebuah rahasia; ia TIDAK membuktikan isi
 * pesannya utuh, dan tidak ada nonce maupun timestamp bertanda tangan yang bisa
 * dipakai menolak pesan yang diputar ulang.
 *
 * Jadi instruksi lama "bandingkan HMAC atas body mentah" tidak bisa dipenuhi
 * pada Xendit — bukan karena belum dikerjakan, tapi karena bahannya tidak ada.
 *
 * Yang menutup celahnya adalah pemeriksaan ISI, dan karena itu pemeriksaan
 * tersebut naik menjadi pertahanan UTAMA, bukan pelengkap:
 *
 *   1. Nominal pada webhook harus sama dengan nominal yang KITA kirim saat
 *      membuat sesi — bukan sama dengan tagihan yang dihitung ulang.
 *   2. Status harus status yang sah untuk transisi yang diminta.
 *   3. ID sesi/pembayaran harus menunjuk baris Payment yang memang kita buat.
 *   4. Penulisan bersifat idempoten dan bersyarat, sehingga pesan yang diputar
 *      ulang tidak menambah uang masuk untuk kedua kalinya.
 * ======================================================================
 */
export function tokenWebhookCocok(tokenDikirim: string | null): boolean {
  const tokenServer = process.env.XENDIT_CALLBACK_TOKEN;

  if (!tokenServer) {
    console.error(
      '[xendit] XENDIT_CALLBACK_TOKEN belum diisi — semua webhook ditolak. ' +
      'Isi variabel itu sebelum menghubungkan Xendit.'
    );
    return false;
  }

  if (!tokenDikirim) return false;

  const a = Buffer.from(tokenDikirim, 'utf8');
  const b = Buffer.from(tokenServer, 'utf8');
  // Panjang token bukan rahasia, jadi keluar lebih awal di sini tidak
  // membocorkan apa pun. Isi token dibandingkan tanpa membocorkan berapa
  // karakter awal yang sudah cocok lewat lama pembandingan.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
