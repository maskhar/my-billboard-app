// src/lib/kebijakan.ts
//
// Isi Kebijakan Privasi dan Syarat & Ketentuan — SEBAGAI DATA, bukan teks.
//
// KENAPA MODUL, BUKAN DUA HALAMAN BERISI PARAGRAF
// ----------------------------------------------
// Halaman kebijakan privasi punya satu cara khas menjadi salah: ia ditulis
// sekali saat peluncuran, lalu skema database terus bertambah tanpanya. Enam
// bulan kemudian aplikasi mengumpulkan kolom yang tidak disebut satu pun
// paragraf di sana — dan itu bukan sekadar dokumen usang, itu pengumpulan data
// pribadi tanpa pemberitahuan, yang justru pelanggaran yang hendak dicegah
// halaman itu.
//
// Karena isinya data, ia bisa diuji. `tests/xendit.test.cjs` membandingkan
// `KOLOM_PRIBADI` di bawah dengan kolom `User` yang sungguh ada di
// `prisma/schema.prisma`, dan menolak kolom baru yang belum diklasifikasikan.
// Menambah kolom ke `User` karena itu memaksa penulisnya memutuskan: ini data
// pribadi yang harus diberitahukan, atau bukan — dan mencatat keputusannya di
// sini. Halaman kebijakannya lalu ikut berubah sendiri.
//
// TIDAK ADA KLAIM YANG TIDAK BISA DIBUKTIKAN KODE
// ----------------------------------------------
// Tidak ada "kami menerapkan enkripsi tingkat bank", tidak ada sertifikasi,
// tidak ada janji "data Anda tidak pernah dibagikan" (tidak benar — lihat
// `PENERIMA_DATA`), dan tidak ada masa retensi dalam angka. Yang terakhir
// paling menggoda dan paling berbahaya: menulis "data dihapus setelah 2 tahun"
// pada sistem yang tidak punya satu pun penghapus terjadwal adalah janji yang
// dilanggar setiap hari sejak halamannya terbit. Yang ditulis di bawah hanya apa
// yang benar-benar dilakukan kode hari ini, termasuk bagian yang tidak
// menyenangkan.
//
// Modul ini TIDAK mengimpor `server-only` dan tidak menyentuh database: seluruh
// isinya konstanta, jadi halaman Server Component memakainya tanpa query dan
// test bisa me-`require`-nya langsung.

import { BADAN_USAHA_PENJUAL, EMAIL_PENJUAL, ALAMAT_PENJUAL } from '@/lib/penjual';

/**
 * Tanggal berlaku dokumen ini.
 *
 * Wajib ada pada kebijakan privasi: pembaca harus bisa tahu versi mana yang
 * sedang ia baca, dan perubahan di kemudian hari diukur terhadap tanggal ini.
 * Ditulis sebagai teks ISO, bukan `new Date()` — tanggal yang dihitung saat
 * render akan selalu menampilkan "hari ini", sehingga dokumen yang tidak pernah
 * diperbarui terlihat selalu baru.
 */
export const TANGGAL_BERLAKU_KEBIJAKAN = '2026-09-29';

/**
 * Satu kategori data yang dikumpulkan.
 *
 * `kolom` menyebut nama kolom database yang sesungguhnya. Itu bukan detail
 * teknis yang bocor ke pembaca — pembaca tidak melihatnya; ia dipakai test
 * untuk membuktikan daftar ini benar-benar mencerminkan skema, dan dipakai
 * penulis berikutnya untuk menemukan tempat menambah kolom barunya.
 */
export type KategoriData = {
  /** Judul kategori, dalam bahasa pembaca. */
  readonly judul: string;
  /** Kolom database yang termasuk kategori ini. */
  readonly kolom: readonly string[];
  /** Untuk apa data ini dipakai — alasan pemrosesan, bukan basa-basi. */
  readonly tujuan: string;
  /** Kapan data ini diminta. */
  readonly kapan: string;
};

/**
 * Data pribadi yang dikumpulkan aplikasi ini, per kategori.
 *
 * Diurutkan dari yang paling umum ke yang paling sensitif. Kategori KTP/NPWP
 * ditaruh terakhir dan diberi keterangan terpisah karena keduanya adalah nomor
 * identitas — kelompok data yang penyalahgunaannya paling merugikan pemiliknya.
 */
export const KATEGORI_DATA: readonly KategoriData[] = [
  {
    judul: 'Identitas dan kontak akun',
    kolom: ['name', 'email', 'whatsapp', 'username', 'image'],
    tujuan:
      'Mengenali Anda saat masuk, mengirim pemberitahuan status pesanan, dan menghubungi Anda bila ada yang perlu dipastikan tentang pesanan Anda.',
    kapan: 'Saat mendaftar, dan saat Anda melengkapi pesanan.',
  },
  {
    judul: 'Kata sandi',
    kolom: ['password'],
    tujuan:
      'Memverifikasi bahwa yang masuk adalah Anda. Yang tersimpan adalah hasil hash bcrypt, bukan kata sandinya — nilai itu tidak bisa dikembalikan menjadi kata sandi asli, dan tidak ada halaman mana pun di aplikasi ini yang menampilkannya.',
    kapan: 'Saat mendaftar dan saat Anda menggantinya.',
  },
  {
    judul: 'Data usaha dan penagihan',
    kolom: ['companyName', 'officeAddress'],
    tujuan:
      'Mencantumkan pihak penyewa pada invoice dan dokumen penagihan.',
    kapan: 'Saat memesan, bila Anda menyewa atas nama badan usaha.',
  },
  {
    judul: 'Data pesanan dan pembayaran',
    kolom: [],
    tujuan:
      'Mencatat apa yang Anda sewa, kapan, berapa nilainya, dan pembayaran mana yang sudah masuk. Ini pembukuan transaksi — bagian yang tidak bisa dihapus atas permintaan tanpa membatalkan pesanannya, karena ia juga bukti hak Anda atas ruang iklan yang sudah dibayar.',
    kapan: 'Setiap kali Anda memesan dan membayar.',
  },
  {
    judul: 'Materi iklan yang Anda unggah',
    kolom: [],
    tujuan:
      'Diproduksi dan dipasang pada media yang Anda sewa. Berkasnya disimpan di server aplikasi ini.',
    kapan: 'Bila Anda memilih menyiapkan materi sendiri.',
  },
  {
    judul: 'Nomor identitas: KTP dan NPWP',
    kolom: ['ktp', 'npwp', 'ktpAddress'],
    tujuan:
      'NPWP dipakai untuk menerbitkan faktur pajak bila Anda memintanya. Nomor dan alamat KTP dipakai untuk verifikasi identitas penyewa pada pesanan bernilai besar.',
    kapan:
      'NPWP saat Anda mencentang permintaan faktur pajak di halaman pemesanan. KTP hanya bila diminta secara terpisah — formulir pemesanan tidak memintanya.',
  },
];

/**
 * Kolom `User` yang BUKAN data pribadi, beserta alasannya.
 *
 * Daftar ini ada supaya test bisa menuntut setiap kolom `User` terklasifikasi:
 * masuk `KATEGORI_DATA` atau masuk sini. Tanpa pasangan ini, test hanya bisa
 * memeriksa kolom yang sudah disebut, dan kolom baru yang lupa disebut lolos
 * tanpa suara — kegagalan yang persis ingin dicegah.
 */
export const KOLOM_BUKAN_DATA_PRIBADI: Readonly<Record<string, string>> = {
  id: 'Pengenal internal baris, dibuat sistem.',
  role: 'Tingkat akses di dalam aplikasi, ditentukan pengelola.',
  authProvider: 'Cara Anda masuk (surel atau Google).',
  isVerified: 'Penanda apakah alamat surel sudah diverifikasi.',
  xenditCustomerId:
    'Pengenal yang dibuat penyedia pembayaran; bukan data yang Anda berikan.',
  createdAt: 'Waktu akun dibuat.',
  updatedAt: 'Waktu akun terakhir diubah.',
  // Relasi Prisma, bukan kolom yang menyimpan nilai.
  bookings: 'Relasi ke pesanan, bukan kolom.',
  createdBillboards: 'Relasi ke media yang dibuat akun staf, bukan kolom.',
  updatedBillboards: 'Relasi ke media yang diubah akun staf, bukan kolom.',
  auditLogs: 'Relasi ke riwayat perubahan media, bukan kolom.',
  pengajuanTitik: 'Relasi ke pengajuan lokasi, bukan kolom.',
  tokenResetSandi: 'Relasi ke permintaan reset sandi, bukan kolom.',
};

/** Seluruh kolom `User` yang diperlakukan sebagai data pribadi. */
export const KOLOM_PRIBADI: readonly string[] = KATEGORI_DATA.flatMap(
  (k) => k.kolom
);

/** Satu pihak ketiga yang menerima data. */
export type PenerimaData = {
  readonly nama: string;
  /** Data apa yang sampai ke sana — sesempit mungkin, bukan "data Anda". */
  readonly data: string;
  readonly alasan: string;
};

/**
 * Pihak ketiga yang benar-benar menerima data, diturunkan dari kode.
 *
 * Tidak ada satu pun layanan analitik, pelacak iklan, atau pixel media sosial
 * di daftar ini, dan itu fakta yang terverifikasi: nol berkas di repo memuat
 * Google Analytics, Tag Manager, Meta Pixel, atau Hotjar. Kalau kelak salah
 * satunya dipasang, ia harus ditambahkan di sini — dan sebaiknya bersamaan
 * dengan pemberitahuan cookie, yang hari ini tidak dibutuhkan karena satu-satunya
 * cookie yang dipasang aplikasi ini adalah cookie sesi masuk.
 */
export const PENERIMA_DATA: readonly PenerimaData[] = [
  {
    nama: 'Xendit',
    data: 'Nama, alamat surel, dan nomor telepon Anda, serta nominal dan nomor pesanan.',
    alasan:
      'Memproses pembayaran. Kami tidak pernah menerima maupun menyimpan nomor kartu atau kredensial perbankan Anda — itu diisi langsung di halaman penyedia pembayaran.',
  },
  {
    nama: 'Penyedia surel keluar (SMTP)',
    data: 'Alamat surel Anda dan isi pemberitahuan yang dikirim.',
    alasan: 'Mengirim pemberitahuan pesanan, invoice, dan tautan reset sandi.',
  },
  {
    nama: 'Cloudinary',
    data: 'Berkas gambar yang diunggah melalui halaman pengelola media.',
    alasan: 'Menyimpan dan menyajikan gambar media iklan.',
  },
  {
    nama: 'Google (Gemini)',
    data: 'Isi percakapan pada layanan obrolan bantuan.',
    alasan:
      'Menyusun saran jawaban untuk tim kami. Bila Anda tidak ingin isi percakapan diproses demikian, hubungi kami lewat surel alih-alih kotak obrolan.',
  },
  {
    nama: 'Google (Masuk dengan Google)',
    data: 'Nama dan alamat surel dari akun Google Anda.',
    alasan: 'Hanya bila Anda memilih masuk dengan Google.',
  },
];

/** Satu hak pemilik data, dengan cara menggunakannya. */
export type HakAnda = {
  readonly judul: string;
  readonly isi: string;
};

/**
 * Hak Anda atas data Anda.
 *
 * Setiap butir menyebut CARA menggunakannya, dan bila caranya adalah "hubungi
 * kami lewat surel", itu ditulis apa adanya. Menyebut hak tanpa jalan
 * menggunakannya membuat halaman ini pajangan kepatuhan, bukan alat.
 */
export const HAK_ANDA: readonly HakAnda[] = [
  {
    judul: 'Melihat dan memperbaiki',
    isi: 'Data akun Anda bisa dilihat dan diubah sendiri di halaman Pengaturan Akun. Data pesanan bisa dilihat di Pesanan Saya.',
  },
  {
    judul: 'Meminta penghapusan',
    isi: `Kirim permintaan dari alamat surel akun Anda ke ${EMAIL_PENJUAL}. Akun dan data pesanannya dihapus, kecuali catatan transaksi yang masih dibutuhkan untuk kewajiban pembukuan dan perpajakan — bagian itu kami sebutkan saat menjawab permintaan Anda, bukan setelahnya.`,
  },
  {
    judul: 'Meminta salinan',
    isi: `Kirim permintaan dari alamat surel akun Anda ke ${EMAIL_PENJUAL}. Belum ada tombol unduh mandiri di aplikasi ini; permintaannya dilayani manual.`,
  },
  {
    judul: 'Menarik persetujuan',
    isi: 'Anda bisa berhenti memakai layanan dan meminta penghapusan kapan pun. Untuk pesanan yang sedang berjalan, data yang dibutuhkan untuk menyelesaikannya tetap kami proses sampai pesanan itu selesai atau dibatalkan.',
  },
];

/** Satu butir Syarat & Ketentuan. */
export type ButirSyarat = {
  readonly judul: string;
  readonly isi: readonly string[];
};

/**
 * Syarat & Ketentuan.
 *
 * Isinya mengikuti perilaku sistem yang bisa ditunjuk di kode: tenggat bayar 24
 * jam (`JAM_TENGGAT_PEMBAYARAN`), harga dihitung server, tanggal terkunci oleh
 * pesanan yang belum dibatalkan, dan pengembalian dana lewat alur yang sudah
 * ada. Angka persentase dan nominal SENGAJA tidak ditulis di sini: keduanya ada
 * di `src/lib/tarif.ts` dan ditampilkan di halaman pemesanan, dan menyalinnya
 * ke dokumen ini membuat tempat ketiga yang harus ikut diubah setiap kali tarif
 * bergeser — pada dokumen yang paling mungkin terlupakan, dan yang paling
 * merugikan bila keliru.
 */
export const BUTIR_SYARAT: readonly ButirSyarat[] = [
  {
    judul: 'Siapa kami',
    isi: [
      `Layanan ini dijalankan oleh ${BADAN_USAHA_PENJUAL}, beralamat di ${ALAMAT_PENJUAL}. Pertanyaan dan keberatan dapat dikirim ke ${EMAIL_PENJUAL}.`,
    ],
  },
  {
    judul: 'Akun',
    isi: [
      'Satu alamat surel untuk satu akun. Anda bertanggung jawab menjaga kata sandi akun Anda.',
      'Data yang Anda isi harus benar. Pesanan dengan data penyewa yang tidak dapat dihubungi tidak dapat kami proses.',
    ],
  },
  {
    judul: 'Pemesanan dan harga',
    isi: [
      'Seluruh nominal — harga sewa, pajak, biaya admin, dan porsi uang muka — dihitung oleh sistem kami dari harga media yang tersimpan, bukan dari angka yang dikirim peramban Anda. Angka yang tertera pada ringkasan pesanan adalah angka yang ditagihkan.',
      'Pesanan baru menahan tanggal yang Anda pilih. Bila pembayaran belum masuk sampai tenggat yang tertera pada pesanan Anda, pesanan itu hangus dan tanggalnya kembali tersedia untuk pemesan lain.',
      'Satu media tidak dapat disewa dua pihak pada rentang tanggal yang bertabrakan. Bila dua pesanan masuk hampir bersamaan untuk tanggal yang sama, yang tercatat lebih dulu yang berlaku, dan yang kedua ditolak dengan pemberitahuan — bukan diterima lalu dibatalkan belakangan.',
    ],
  },
  {
    judul: 'Pembayaran',
    isi: [
      'Pembayaran diproses oleh penyedia pembayaran Xendit. Kami tidak menerima dan tidak menyimpan nomor kartu maupun kredensial perbankan Anda.',
      'Pembayaran dinyatakan diterima ketika penyedia pembayaran mengonfirmasinya ke sistem kami, bukan ketika halaman pembayaran menampilkan pesan berhasil. Bila keduanya berbeda, konfirmasi penyedia yang berlaku.',
      'Bila Anda membayar dengan uang muka, sisa pokoknya menjadi tagihan terpisah yang jatuh tempo sebelum masa tayang dimulai.',
    ],
  },
  {
    judul: 'Materi iklan',
    isi: [
      'Anda menjamin memiliki hak atas materi yang Anda kirimkan, dan bahwa materi itu tidak melanggar hukum yang berlaku di Indonesia maupun ketentuan pemerintah daerah tentang reklame.',
      'Kami dapat menolak materi yang melanggar ketentuan tersebut. Penolakan disertai alasannya, dan Anda diberi kesempatan mengirim penggantinya.',
      'Materi yang dikirim setelah tahap produksi dimulai dapat menggeser jadwal tayang.',
    ],
  },
  {
    judul: 'Pembatalan dan pengembalian dana',
    isi: [
      'Permintaan pembatalan diajukan dari halaman pesanan Anda. Persentase pengembalian dan tahap mana yang masih bisa dibatalkan ditampilkan pada halaman itu saat Anda mengajukan.',
      'Pengembalian dana dikirim ke rekening bank yang Anda cantumkan pada pengajuan, bukan ke metode pembayaran asal. Pastikan nama pemilik rekening sesuai.',
      'Pesanan yang medianya sudah terpasang tidak dapat dibatalkan.',
    ],
  },
  {
    judul: 'Hal yang di luar kendali kami',
    isi: [
      'Kerusakan media akibat cuaca ekstrem, kerusuhan, atau tindakan pihak ketiga, serta pembongkaran atas perintah pemerintah daerah, adalah keadaan di luar kendali kami. Bila itu terjadi selama masa tayang Anda, kami menghubungi Anda untuk menyepakati penggantian masa tayang atau pengembalian dana secara proporsional.',
    ],
  },
  {
    judul: 'Perubahan ketentuan',
    isi: [
      `Ketentuan ini dapat berubah. Tanggal berlaku versi yang sedang Anda baca tertera di bagian atas halaman. Perubahan tidak berlaku surut terhadap pesanan yang sudah dibayar sebelum tanggal itu.`,
    ],
  },
];
