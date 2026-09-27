// src/lib/penjual.ts
//
// Identitas penjual — satu sumber untuk seluruh aplikasi.
//
// Nilainya dulu ditulis ulang di empat tempat dengan TIGA isi yang berbeda:
//
//   - `admin/(dashboard)/orders/TransactionClient.tsx:321-322`
//     "Iklan Jaya Group" / "Jl. Melati No. 10, Jakarta"
//   - `invoice/[id]/page.tsx:151-153`
//     "UteroCloud" / "Jl. Soekarno Hatta No. 1, Malang" / "support@utero.cloud"
//   - `src/lib/mail.ts:118,160`
//     "UTERO CLOUD" / "Utero Indonesia"
//   - `admin/(dashboard)/page.tsx:115`, `admin/login/page.tsx:52`
//     "Utero Cloud"
//
// Yang pertama bukan sekadar tidak seragam, ia SALAH: nama dan alamat itu tidak
// pernah muncul di satu pun dokumen yang dilihat pelanggan. Admin membuka
// halaman transaksi, membaca "Penjual: Iklan Jaya Group, Jl. Melati No. 10,
// Jakarta", lalu membacakannya ke pelanggan yang memegang invoice bertuliskan
// perusahaan dan kota yang lain — pada dokumen yang dipakai untuk pembukuan dan
// penagihan. Tidak ada galat, tidak ada peringatan; keduanya sama-sama yakin.
//
// Yang dipakai sebagai kebenaran adalah isi invoice, karena itulah satu-satunya
// dari ketiganya yang benar-benar diserahkan ke pelanggan.
//
// Alamatnya konstanta modul, bukan `process.env`: `TransactionClient` adalah
// Client Component, dan variabel tanpa awalan `NEXT_PUBLIC_` tidak terbaca di
// sana — sementara memberi awalan itu pada identitas penjual berarti setiap
// nilainya ditanam ke dalam bundel browser saat build, tanpa satu pun manfaat.
// Kalau kelak perlu bisa diatur admin, tempatnya `SystemSetting.siteName` yang
// sudah ada di schema, bukan env.

/** Nama badan usaha, sebagaimana tertulis di invoice pelanggan. */
export const NAMA_PENJUAL = 'Utero Cloud';

/** Nama lengkap untuk keperluan hukum dan footer surat. */
export const BADAN_USAHA_PENJUAL = 'Utero Indonesia';

/** Alamat kantor, sebagaimana tertulis di invoice pelanggan. */
export const ALAMAT_PENJUAL = 'Jl. Soekarno Hatta No. 1, Malang';

/** Alamat surat yang boleh dihubungi pelanggan. */
export const EMAIL_PENJUAL = 'support@utero.cloud';

/** Tagline yang dipakai di kepala surat. */
export const TAGLINE_PENJUAL = 'PREMIUM OUTDOOR MEDIA';
