// src/lib/identitas-penyewa.ts
//
// Identitas penyewa yang diketik di halaman checkout.
//
// KENAPA NILAINYA DISIMPAN KE `User`, BUKAN KE `Booking`
// -----------------------------------------------------
// Form "Data Penyewa" di checkout dulu terdiri dari empat kolom tanpa `value`
// maupun `onChange`, dan payload ke `api/booking/create` tidak pernah memuat
// satu pun di antaranya. Pembeli mengisi nama, WhatsApp, email, dan NPWP-nya,
// menekan Lanjutkan, dan seluruh isian itu hilang tanpa jejak — sementara
// `siapkanSesiPembayaran` di halaman berikutnya justru MENOLAK pembayaran
// dengan `PROFIL_BELUM_LENGKAP` karena nama atau nomor WhatsApp-nya kosong.
// Pembeli baru saja mengisi keduanya.
//
// Tabel `Booking` tidak punya kolom identitas, dan menambahkannya berarti
// migrasi baru. Yang sudah ada adalah `User.name`, `User.whatsapp`,
// `User.companyName`, dan `User.npwp` — kolom yang justru dibaca gerbang
// pembayaran dan ditampilkan dashboard admin. Jadi isian checkout menulis ke
// sana: satu identitas per akun, bukan satu salinan per pesanan.
//
// Akibatnya harus disebut apa adanya: pesanan lama TIDAK menyimpan identitas
// pada saat ia dibuat. Bila pembeli mengganti nomornya setahun kemudian,
// invoice lamanya ikut menampilkan nomor yang baru. Untuk nominal hal itu
// sudah diselesaikan dengan menyalin rincian tagihan ke `Booking`; untuk
// identitas, penyelesaiannya butuh kolom baru — dicatat sebagai keterbatasan,
// bukan disamarkan.
//
// EMAIL SENGAJA TIDAK ADA DI SINI
// -------------------------------
// `User.email` adalah kunci login dan `@unique`. Halaman Pengaturan Akun sudah
// menyatakannya "tidak dapat diubah", dan mengizinkan checkout menggantinya
// berarti satu permintaan pemesanan bisa memindahkan akun ke alamat lain —
// atau menabrak alamat milik orang lain dan menggagalkan pemesanan dengan
// galat unique yang tidak menyebut email sama sekali. Karena itu kolom email di
// checkout hanya menampilkan alamat sesi, tidak menerima ketikan.

import { keE164, normalisasiNomorLokal } from '@/lib/telepon';

/** Batas panjang kolom teks bebas. Kolomnya `String` tanpa batas di Postgres. */
export const PANJANG_NAMA_MAKS = 120;
export const PANJANG_PERUSAHAAN_MAKS = 160;

/**
 * NPWP lama 15 digit; sejak 2024 NPWP orang pribadi memakai NIK 16 digit.
 * Keduanya diterima karena keduanya sah dipakai pada faktur pajak hari ini.
 */
const PANJANG_NPWP = [15, 16];

export type IdentitasPenyewa = {
  name: string;
  whatsapp: string;
  companyName: string | null;
  npwp: string | null;
};

export type HasilIdentitas =
  | { sah: true; nilai: IdentitasPenyewa }
  | { sah: false; pesan: string };

function teksRapi(nilai: unknown, batas: number): string {
  if (typeof nilai !== 'string') return '';
  return nilai.trim().slice(0, batas);
}

/**
 * Bentuk penyimpanan NPWP: hanya angka.
 *
 * Orang menulisnya `09.254.294.3-407.000`, `092542943407000`, atau dengan spasi.
 * Menyimpan apa adanya berarti satu nomor yang sama tercatat dalam beberapa
 * bentuk dan tidak bisa dicocokkan.
 */
export function keNpwp(nilai: unknown): string | null {
  if (typeof nilai !== 'string') return null;
  const digit = nilai.replace(/\D/g, '');
  return PANJANG_NPWP.includes(digit.length) ? digit : null;
}

/**
 * Baca identitas penyewa dari badan permintaan.
 *
 * Mengembalikan pesan yang MENYEBUT KOLOMNYA bila ada yang salah. Pesan umum
 * seperti "data tidak valid" memaksa pembeli menebak mana dari empat kolom yang
 * ditolak, dan di halaman checkout tebakan yang salah berarti pesanan tidak
 * pernah jadi.
 *
 * `perluFaktur` datang dari centang "Saya butuh Faktur Pajak". Ia menentukan
 * apakah NPWP WAJIB, bukan apakah nilainya dipakai: NPWP yang terisi selalu
 * disimpan, karena satu-satunya jejak bahwa pembeli meminta faktur adalah
 * nomor itu sendiri (tidak ada kolom penanda faktur di skema).
 */
export function bacaIdentitasPenyewa(body: unknown, perluFaktur: boolean): HasilIdentitas {
  const isi = (body ?? {}) as Record<string, unknown>;

  const name = teksRapi(isi.name, PANJANG_NAMA_MAKS);
  if (name === '') {
    return { sah: false, pesan: 'Nama lengkap penyewa wajib diisi.' };
  }

  // Bentuknya dibuktikan lebih dulu, lalu disimpan dalam bentuk lokal
  // ternormalisasi — sama dengan `api/register`. Tanpa pembuktian `keE164`,
  // `normalisasiNomorLokal` membuang huruf dan menyimpan sisa angkanya, jadi
  // `0812ABC4567` pulang sebagai nomor lain yang kelihatan sah.
  //
  // Angka diterima karena `<input type="number">` yang lama mengirimkannya
  // sebagai number; apa pun selain teks/angka ditolak tanpa diubah menjadi
  // teks — `String({})` menghasilkan `"[object Object]"`, yang lolos bentuk
  // ketikan dan berakhir sebagai nomor karangan.
  const nomorMentah =
    typeof isi.whatsapp === 'string' ? isi.whatsapp
    : typeof isi.whatsapp === 'number' && Number.isFinite(isi.whatsapp) ? String(isi.whatsapp)
    : null;
  if (nomorMentah === null || !keE164(nomorMentah)) {
    return { sah: false, pesan: 'Nomor WhatsApp tidak valid. Contoh: 08123456789.' };
  }
  const whatsapp = normalisasiNomorLokal(nomorMentah);

  const perusahaan = teksRapi(isi.companyName, PANJANG_PERUSAHAAN_MAKS);
  const companyName = perusahaan === '' ? null : perusahaan;

  const npwp = keNpwp(isi.npwp);
  if (perluFaktur && npwp === null) {
    return {
      sah: false,
      pesan: 'Faktur pajak membutuhkan NPWP 15 atau 16 digit.',
    };
  }

  return { sah: true, nilai: { name, whatsapp, companyName, npwp } };
}
