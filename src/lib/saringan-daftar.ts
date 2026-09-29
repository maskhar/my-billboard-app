// src/lib/saringan-daftar.ts
//
// Klausa `where` keempat daftar admin, dalam satu tempat.
//
// KENAPA DIPINDAHKAN KE SINI
// --------------------------
// Klausa `where` sebelumnya ditulis di dalam masing-masing `page.tsx`, dan itu
// tidak menjadi masalah selama hanya halaman itu yang memakainya. Tombol ekspor
// mengubahnya: route ekspor harus mengambil BARIS YANG SAMA dengan yang sedang
// dilihat admin di layar, dan "yang sama" tidak bisa dijamin oleh dua salinan
// klausa pencarian yang kebetulan sedang mirip.
//
// Bila keduanya menyimpang, hasilnya bukan galat. Hasilnya berkas CSV yang
// TERBUKA dengan sempurna dan memuat himpunan baris yang berbeda dari layar —
// dipakai untuk rekonsiliasi, dan tidak ada satu pun tanda bahwa isinya bukan
// yang diminta. Ekspor yang meleset satu baris lebih berbahaya daripada ekspor
// yang gagal, karena yang gagal terlihat.
//
// Jadi modul ini bukan kerapian: ia yang membuat "ekspor = layar" menjadi sifat
// STRUKTURAL, bukan janji yang harus dijaga dua berkas sekaligus.
//
// KATALOG PUBLIK IKUT KE SINI, DENGAN ALASAN YANG LEBIH KERAS
// -----------------------------------------------------------
// `wherePublikBillboard` di bawah menanggung beban yang berbeda dari keempat
// `where` admin: yang dijaganya bukan kesepakatan antara layar dan berkas CSV,
// melainkan antara dua HALAMAN PUBLIK (beranda dan `/billboards`) dan dua
// gerbang keamanan. Gerbang `publishStatus: 'PUBLISHED'` yang disalin ke halaman
// kedua lalu menyimpang berarti baris `DRAFT` — harga yang masih ditawar, alamat
// yang belum dikonfirmasi pemilik lahan — tampil sebagai barang dagangan. Dan
// klausa pencariannya sengaja BUKAN `whereBillboard`, karena `sku` tidak boleh
// bisa dicari publik; alasannya di docstring-nya.
//
// NOL IMPOR SELAIN TIPE PRISMA DAN MODUL RELATIF
// ----------------------------------------------
// Alasannya sama seperti `paginasi.ts`, `tarif.ts`, dan `kueri-daftar.ts`:
// dipakai dari Server Component DAN dari route handler, dan bisa di-`require`
// langsung di test tanpa satu pun mock. `Prisma` di sini hanya dipakai sebagai
// tipe dan sebagai `QueryMode` — bukan sebagai klien; `BookingStatus` murni
// `import type`, dan keempat impor lainnya RELATIF ke modul yang sendirinya nol
// impor. Yang TIDAK boleh masuk adalah `./transisi-status`: ia mengimpor
// `@/lib/prisma`, jadi daftar status pengunci tanggal masuk sebagai parameter.

// `BookingStatus` ditarik sebagai TIPE SAJA (`import type`), bukan sebagai objek
// enum. Objeknya adalah nilai runtime dari `@prisma/client`, dan mengimpornya di
// sini akan membuat berkas ini menarik klien Prisma saat di-`require` di test —
// sifat yang justru dijaga komentar kepala berkas. Daftar status yang sebenarnya
// masuk sebagai parameter `wherePublikBillboard`.
import type { BookingStatus } from '@prisma/client';
import { Prisma, StatusPengajuanTitik } from '@prisma/client';
import { awalHariTersimpan, kunciHariSewa } from './hari-sewa';
import { PANJANG_NOMOR_PESANAN } from './nomor-pesanan';
import { geserBulan } from './rentang-tanggal';
import { TIPE_SEMUA } from './tipe-billboard';

/** `contains` + `insensitive`, bentuk yang dipakai setiap kolom teks di sini. */
function memuat(kataKunci: string): Prisma.StringFilter {
  return { contains: kataKunci, mode: Prisma.QueryMode.insensitive };
}

/**
 * Urutan billboard yang boleh diminta URL, beserta `orderBy` Prisma-nya.
 *
 * Daftarnya TERTUTUP, dan itu bukan sekadar kehati-hatian: `orderBy` yang
 * dirangkai dari teks URL berarti nama kolom apa pun bisa diminta pengunjung,
 * termasuk kolom yang tidak dirender halaman ini. Kunci urutnya juga sengaja
 * berbeda dari nama kolom database — `harga-naik` lebih jelas di URL daripada
 * `price:asc`, dan tidak membocorkan skema tabel ke bilah alamat.
 *
 * Ikut dipindahkan ke sini bersama `where`-nya karena route ekspor harus
 * mengurutkan dengan cara yang SAMA. Ekspor yang barisnya benar tapi urutannya
 * lain dari layar tetap salah: yang dibandingkan admin antara berkas dan layar
 * adalah baris ke-n, bukan himpunannya.
 */
export const URUT_BILLBOARD: Record<string, Prisma.BillboardOrderByWithRelationInput> = {
  // `terbaru` bakunya: yang paling sering dicari admin adalah titik yang baru
  // saja ia sunting.
  terbaru: { updatedAt: 'desc' },
  terlama: { updatedAt: 'asc' },
  'judul-naik': { title: 'asc' },
  'judul-turun': { title: 'desc' },
  'harga-naik': { price: 'asc' },
  'harga-turun': { price: 'desc' },
  'status-naik': { status: 'asc' },
  'status-turun': { status: 'desc' },
};

export const KUNCI_URUT_BILLBOARD = Object.keys(URUT_BILLBOARD) as [string, ...string[]];

/**
 * Urutan pengguna yang boleh diminta URL.
 *
 * Gerbangnya lebih penting di tabel ini daripada di billboard: `User` punya
 * kolom `password`, `ktp`, dan `npwp`. Tidak satu pun dirender, tapi
 * `?urut=password` yang lolos ke Prisma MENGURUTKAN barisnya menurut hash
 * password — dan urutan baris adalah informasi. Ia membocorkan perbandingan
 * antar nilai kolom yang tidak pernah boleh terbaca siapa pun, lewat URL yang
 * bisa di-bookmark, tanpa satu pun kolom itu tampil di layar.
 */
export const URUT_USER: Record<string, Prisma.UserOrderByWithRelationInput> = {
  // `terbaru` bakunya: pendaftar baru adalah yang paling sering dicari admin.
  terbaru: { createdAt: 'desc' },
  terlama: { createdAt: 'asc' },
  'nama-naik': { name: 'asc' },
  'nama-turun': { name: 'desc' },
  'peran-naik': { role: 'asc' },
  'peran-turun': { role: 'desc' },
  // Mengurutkan menurut jumlah relasi, bukan kolom. Ini satu-satunya kunci yang
  // tidak bisa ditiru di sisi client: `jumlahOrder` dihitung lewat `groupBy`
  // TERPISAH atas baris halaman ini saja, jadi mengurutkannya di browser hanya
  // mengurutkan baris itu — dan halaman 1 "menurut order terbanyak" tidak akan
  // memuat pelanggan tersibuk yang kebetulan mendaftar tahun lalu.
  'order-banyak': { bookings: { _count: 'desc' } },
  'order-sedikit': { bookings: { _count: 'asc' } },
};

export const KUNCI_URUT_USER = Object.keys(URUT_USER) as [string, ...string[]];

/**
 * `where` daftar billboard.
 *
 * `sku` ikut dicari karena itulah yang tertulis di kontrak dan surat jalan, dan
 * itulah yang dibacakan tim lapangan lewat telepon. `address` ikut karena titik
 * lebih sering disebut lewat lokasinya daripada judulnya.
 */
export function whereBillboard(kataKunci: string): Prisma.BillboardWhereInput {
  if (kataKunci === '') return {};
  return {
    OR: [
      { title: memuat(kataKunci) },
      { sku: memuat(kataKunci) },
      { address: memuat(kataKunci) },
    ],
  };
}

/**
 * Urutan katalog PUBLIK yang boleh diminta URL.
 *
 * Bukan `URUT_BILLBOARD` di atas, dan bedanya penting: `status-naik`/
 * `status-turun` **tidak ada di sini**. Katalog publik menyaring
 * `status: 'Available'` mati-matian, jadi seluruh barisnya berstatus sama —
 * kunci urut yang tidak mengubah satu baris pun, sementara panah di kepala
 * kolomnya menyatakan sesuatu terjadi.
 *
 * `terbaru` bakunya, sama seperti sisi admin, tapi alasannya lain: yang paling
 * relevan bagi pengunjung adalah titik yang datanya baru disegarkan — foto baru,
 * harga baru — bukan titik yang paling lama tidak disentuh.
 */
export const URUT_PUBLIK: Record<string, Prisma.BillboardOrderByWithRelationInput> = {
  terbaru: { updatedAt: 'desc' },
  'harga-naik': { price: 'asc' },
  'harga-turun': { price: 'desc' },
  'judul-naik': { title: 'asc' },
  'judul-turun': { title: 'desc' },
};

export const KUNCI_URUT_PUBLIK = Object.keys(URUT_PUBLIK) as [string, ...string[]];

/**
 * Apa yang diminta pengunjung dari katalog publik.
 *
 * Semua medannya sudah BERSIH saat masuk: `kataKunci` lewat `bacaKataKunci`,
 * `tipe` lewat `bacaPilihan(…, PILIHAN_TIPE_MEDIA, TIPE_SEMUA)`, dan `tanggal`
 * mentah dari URL — yang terakhir sengaja dibiarkan mentah, lihat di bawah.
 */
export type SaringanPublik = {
  kataKunci: string;
  tipe: string;
  /**
   * `?date=` MENTAH dari URL. Divalidasi di dalam fungsi lewat `kunciHariSewa`,
   * bukan oleh pemanggil.
   *
   * Sengaja di dalam: dua halaman membacanya (beranda dan `/billboards`), dan
   * validasi yang ditulis di dua tempat adalah validasi yang akan menyimpang.
   * Yang divalidasinya bukan kerapian — `?date=2026-02-30` lolos setiap regex
   * `\d{4}-\d{2}-\d{2}` lalu digulung `new Date` menjadi 2 Maret, sehingga
   * pengunjung melihat ketersediaan tanggal yang tidak pernah ia minta.
   */
  tanggal?: string | string[] | null;
  /**
   * Durasi bulan yang ditanyakan ketersediaannya. Bakunya 1.
   *
   * Pengunjung belum memilih durasi saat menyaring peta, dan menanyakan
   * "kosong selama 12 bulan" pada tahap itu akan membuang hampir seluruh
   * inventori. Satu bulan adalah durasi minimum di `booking/create`, jadi titik
   * yang lolos saringan ini pasti bisa dipesan setidaknya sependek itu.
   */
  durasi?: number;
};

/** Hasil `wherePublikBillboard`: klausanya, plus apa yang dipakainya. */
export type HasilSaringanPublik = {
  where: Prisma.BillboardWhereInput;
  /**
   * Kunci hari `YYYY-MM-DD` yang benar-benar dipakai, atau `null`.
   *
   * Dilaporkan keluar supaya UI bisa MENGATAKANNYA, alasan yang sama seperti
   * `PilihanBulan.ditolak` di `kalender-ketersediaan.ts`: halaman yang diam-diam
   * mengabaikan `?date=` menampilkan seluruh inventori sementara kolom tanggal
   * di bilah pencarian masih terisi, dan pengunjung membaca daftar itu sebagai
   * "yang kosong pada tanggal itu".
   */
  kunciTanggal: string | null;
  /** Ada `?date=` yang dikirim tapi bentuknya tidak bisa dipercaya. */
  tanggalDitolak: boolean;
};

/**
 * `where` katalog PUBLIK billboard: yang layak tampil, dan yang cocok saringan.
 *
 * KENAPA TIDAK MEMAKAI `whereBillboard` DI ATAS
 * ---------------------------------------------
 * Karena `whereBillboard` mencari `sku`, dan **`sku` tidak boleh bisa dicari
 * publik**. Alasannya sama dengan `ktp`/`npwp` di `whereUser`: kolom yang bisa
 * dicari berarti bisa dites lewat URL satu per satu, jadi seseorang bisa
 * memastikan sebuah kode aset ada dari ada-tidaknya hasil, tanpa pernah melihat
 * barisnya. `sku` adalah kode internal yang tertulis di kontrak dan surat jalan;
 * ia boleh dilihat tim lapangan, bukan dijadikan kunci penelusuran inventori
 * oleh siapa pun yang membuka bilah alamat. Halaman publik juga tidak
 * merendernya sama sekali, sehingga hasil yang cocok lewat `sku` tampil sebagai
 * baris yang — menurut layar — tidak memuat kata yang dicari.
 *
 * DUA GERBANG YANG TIDAK BOLEH HILANG
 * -----------------------------------
 * `status: 'Available'` dan `publishStatus: 'PUBLISHED'` dipasang MATI di sini,
 * bukan diserahkan pemanggil. Sebelumnya keduanya ditulis di dalam
 * `src/app/page.tsx`, dan halaman kedua yang menampilkan inventori berarti
 * salinan kedua gerbang itu. Yang hilang bila salinannya menyimpang bukan
 * tampilan: `DRAFT` adalah baris yang BELUM siap publik — harga yang masih
 * ditawar, alamat yang belum dikonfirmasi pemilik lahan — dan menampilkannya
 * berarti menjual sesuatu yang belum ada.
 *
 * KETERSEDIAAN TANGGAL: `none`, BUKAN `some`
 * ------------------------------------------
 * Saringan tanggal berbunyi "titik ini TIDAK punya satu pun pesanan yang
 * mengunci rentang yang diminta". Ditulis `some`, jawabannya terbalik persis —
 * pengunjung mendapat daftar titik yang justru sudah terjual, dan setiap
 * checkout dari daftar itu ditolak constraint di ujung.
 *
 * Perbandingannya `lt`/`gt` atas rentang setengah terbuka `[mulai, selesai)`,
 * sama seperti gerbang tumpang-tindih di `booking/create` dan sama seperti
 * `'[)'` pada constraint `booking_tanpa_tumpang_tindih`. `lte`/`gte` di sini
 * membuang titik yang pesanan lamanya SELESAI persis di hari yang diminta —
 * hari yang menurut database masih bisa dijual.
 *
 * KENAPA `statusMengunci` DISERAHKAN PEMANGGIL
 * -------------------------------------------
 * `STATUS_MENGUNCI_TANGGAL` hidup di `transisi-status.ts`, yang mengimpor
 * `@/lib/prisma` — menariknya ke sini menghancurkan sifat "nol impor selain tipe
 * Prisma" yang membuat modul ini bisa di-`require` di test tanpa satu pun mock.
 * Daftarnya karena itu masuk sebagai parameter, dan TIDAK punya nilai baku:
 * baku `[]` berarti saringan tanggal yang diam-diam tidak menyaring apa pun,
 * yaitu bentuk kegagalan yang paling sulit dilihat.
 */
export function wherePublikBillboard(
  saringan: SaringanPublik,
  statusMengunci: readonly BookingStatus[]
): HasilSaringanPublik {
  const { kataKunci, tipe, tanggal, durasi = 1 } = saringan;

  const where: Prisma.BillboardWhereInput = {
    status: 'Available',
    publishStatus: 'PUBLISHED',
  };

  if (tipe !== TIPE_SEMUA) where.type = tipe;

  if (kataKunci !== '') {
    where.OR = [{ title: memuat(kataKunci) }, { address: memuat(kataKunci) }];
  }

  const mentah = Array.isArray(tanggal) ? tanggal[0] : tanggal;
  const adaPermintaan = mentah !== undefined && mentah !== null && String(mentah).trim() !== '';
  const kunci = adaPermintaan ? kunciHariSewa(mentah) : null;

  if (kunci !== null) {
    const mulai = awalHariTersimpan(kunci);
    // Tanda NEGATIF untuk MAJU — itu kontrak `geserBulan`, bukan salah tulis.
    // Bentuk yang sama dipakai `akhirSewa` di `hari-sewa.ts`; lihat docstring-nya.
    const selesai = awalHariTersimpan(geserBulan(kunci, -Math.max(1, Math.floor(durasi))));

    where.bookings = {
      none: {
        status: { in: [...statusMengunci] },
        startDate: { lt: selesai },
        endDate: { gt: mulai },
      },
    };
  }

  return {
    where,
    kunciTanggal: kunci,
    tanggalDitolak: adaPermintaan && kunci === null,
  };
}

/**
 * `where` daftar pengguna.
 *
 * `ktp` dan `npwp` **sengaja tidak ikut dicari** walau kolomnya ada. Kolom yang
 * bisa dicari berarti bisa dites lewat URL satu per satu: seseorang yang menebak
 * nomor KTP bisa memastikan tebakannya benar dari ada-tidaknya hasil, tanpa
 * pernah melihat barisnya. Keduanya data yang boleh dilihat pada satu profil
 * yang sudah dibuka — bukan dijadikan kunci untuk menemukan orangnya.
 */
export function whereUser(kataKunci: string): Prisma.UserWhereInput {
  if (kataKunci === '') return {};
  return {
    OR: [
      { name: memuat(kataKunci) },
      { email: memuat(kataKunci) },
      { whatsapp: memuat(kataKunci) },
      { companyName: memuat(kataKunci) },
    ],
  };
}

/**
 * Tab saringan pesanan yang sah. `ALL` bukan saringan — ia berarti tidak
 * menyaring.
 *
 * Ada di sini, bukan di halamannya, supaya peta status di bawah bisa ditipekan
 * ATAS daftar ini: `Record<TabPesanan, …>` menolak kompilasi bila sebuah tab
 * ditambahkan tanpa status, dan menolak nama tab yang salah tulis. Dengan
 * `Record<string, …>` keduanya lolos, dan tab tanpa status menampilkan SELURUH
 * tabel sementara tombolnya tampak tersorot.
 */
export const TAB_PESANAN = ['ALL', 'PENDING', 'PROGRESS', 'ACTIVE', 'REFUND', 'DONE'] as const;

export type TabPesanan = (typeof TAB_PESANAN)[number];

/**
 * Status pesanan yang diwakili setiap tab, dalam satu peta.
 *
 * `ALL` bernilai `undefined`, bukan `{}`: yang dipasang ke `where.status` adalah
 * nilainya langsung, dan `status: {}` bukan hal yang sama dengan tidak menyaring.
 */
export const STATUS_TAB_PESANAN: Record<
  TabPesanan,
  Prisma.BookingWhereInput['status'] | undefined
> = {
  ALL: undefined,
  PENDING: { in: ['PENDING_PAYMENT', 'PAID_CONFIRMED'] },
  // DESIGN_RECEIVED, IN_PRODUCTION, dan INSTALLATION adalah pesanan yang sedang
  // DIKERJAKAN, bukan yang selesai — dulu ketiganya masuk tab "Selesai" dan
  // pekerjaan yang sedang berjalan terkubur di antara pesanan yang sudah tutup.
  PROGRESS: { in: ['DESIGN_RECEIVED', 'IN_PRODUCTION', 'INSTALLATION'] },
  ACTIVE: 'ACTIVE',
  // `REVIEW_REFUND` wajib ada di sini. Dulu tabnya menyaring `REFUND_REQUESTED`
  // — status yang tidak pernah ditulis satu baris kode pun — sehingga pengajuan
  // refund yang baru masuk tidak muncul sama sekali, dan baru terlihat setelah
  // pembeli mengisi nomor rekening. Permintaan yang berhenti sebelum itu tidak
  // pernah dilihat admin.
  REFUND: { in: ['REVIEW_REFUND', 'PROCESS_REFUND', 'WAITING_BANK'] },
  DONE: { in: ['REFUNDED', 'CANCELLED'] },
};

/**
 * `where` daftar pesanan: tab status DAN kata kunci.
 *
 * `AND`-nya implisit — `status` dan `OR` berdampingan di objek yang sama, dan
 * Prisma menggabungkan properti sekerabat dengan AND. Jadi pencarian tidak
 * membocorkan baris dari tab lain: admin yang mencari di tab "Refund" tetap
 * hanya melihat pesanan refund.
 *
 * Nomor pesanan dicari dengan `endsWith`, bukan `contains`, dan itu bukan
 * optimasi: yang tertera di layar, di invoice, dan yang dibacakan pembeli lewat
 * telepon adalah 8 KARAKTER TERAKHIR id (lihat `nomor-pesanan.ts`). `contains`
 * atas potongan itu mencocokkan juga bagian TENGAH cuid pesanan lain, sehingga
 * satu nomor yang dicari memunculkan beberapa pesanan yang tidak berhubungan —
 * dan admin tidak punya cara membedakan mana yang ia maksud.
 *
 * `mode: insensitive` pada kolom `id` juga bukan kelalaian: nomor tampilannya
 * huruf besar sedangkan cuid di database huruf kecil, jadi tanpa itu menyalin
 * nomor dari layar tidak menemukan satu baris pun.
 */
export function whereBooking(
  tabStatus: TabPesanan,
  kataKunci: string
): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};

  const status = STATUS_TAB_PESANAN[tabStatus];
  if (status !== undefined) where.status = status;

  if (kataKunci !== '') {
    // Awalan `#` dibuang lebih dulu: nomor yang dibaca admin di layar memuatnya,
    // jadi ia ikut tersalin saat disalin-tempel.
    const nomor = kataKunci.replace(/^#/, '').trim();

    where.OR = [
      // Potongan yang lebih panjang daripada nomor tampilannya tidak mungkin
      // menjadi nomor pesanan, dan `endsWith` atasnya hanya membebani database.
      ...(nomor !== '' && nomor.length <= PANJANG_NOMOR_PESANAN
        ? [{ id: { endsWith: nomor, mode: Prisma.QueryMode.insensitive } }]
        : []),
      { billboard: { title: memuat(kataKunci) } },
      { user: { name: memuat(kataKunci) } },
      { user: { email: memuat(kataKunci) } },
      // Nomor WA dicari apa adanya, TANPA normalisasi. Kolomnya menyimpan bentuk
      // `628…` (lihat `telepon.ts`), jadi `contains` atas `812…` yang diketik
      // admin tetap menemukannya — sementara menormalkan kata kuncinya lebih
      // dulu mengubah `0812` menjadi `62812` dan membuat pencarian atas potongan
      // tengah nomor gagal.
      { user: { whatsapp: memuat(kataKunci) } },
    ];
  }

  return where;
}

/**
 * `where` daftar pengajuan titik: tab status DAN kata kunci.
 *
 * `AND` disusun EKSPLISIT, tidak sebagai properti bersaudara. `{ status, OR }`
 * sebetulnya juga benar, tapi bentuk yang tertulis di sini tidak bisa
 * disalahbaca pembaca berikutnya sebagai "status ATAU salah satu kata kunci" —
 * dan pembacaan itulah yang menghasilkan penggantian satu kata `AND` menjadi
 * `OR`, yang membocorkan pengajuan dari tab lain ke dalam tab yang dibuka.
 *
 * `catatanAdmin` TIDAK ikut dicari walau kolomnya dirender. Isinya catatan
 * internal admin, dan pencarian yang menjangkaunya membuat baris muncul karena
 * alasan yang tidak terlihat di kartunya — admin melihat hasil yang, menurut
 * layar, tidak memuat kata yang ia cari.
 */
export function wherePengajuan(
  statusAktif: StatusPengajuanTitik | 'SEMUA',
  kataKunci: string
): Prisma.PengajuanTitikWhereInput {
  const saringanStatus: Prisma.PengajuanTitikWhereInput =
    statusAktif === 'SEMUA' ? {} : { status: statusAktif };

  if (kataKunci === '') return saringanStatus;

  return {
    AND: [
      saringanStatus,
      {
        OR: [
          { namaPemilik: memuat(kataKunci) },
          { nomorWa: memuat(kataKunci) },
          { email: memuat(kataKunci) },
          { kota: memuat(kataKunci) },
          { alamat: memuat(kataKunci) },
        ],
      },
    ],
  };
}
