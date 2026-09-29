// src/app/api/sewakan-tempat/route.ts
//
// Penerima pengajuan titik dari pemilik lahan — isi tombol "Sewakan Tempat".
//
// KENAPA ROUTE INI ADA
// --------------------
// `src/components/Navbar.tsx` dulu punya dua tombol "Sewakan Tempat" (desktop
// dan mobile) tanpa `onClick`, tanpa `href`, dan tanpa `type`. Diklik, tidak
// terjadi apa pun. Tombolnya dibuang, bukan ditambal, dengan alasan yang masih
// berlaku: alur dulu, tombol kemudian. Route ini beserta halaman
// `/sewakan-tempat` adalah alurnya, dan tombolnya dipasang di commit yang sama.
//
// TANPA SESI, DAN ITU KEPUTUSAN
// -----------------------------
// Pemilik lahan yang ingin menawarkan tanahnya tidak punya akun di sini dan
// tidak perlu punya. Menuntut pendaftaran lebih dulu membuang mayoritas pengaju
// di langkah pertama — dan yang kita minta darinya hanyalah nomor yang bisa
// dihubungi. Karena terbuka, route ini dibatasi per alamat asal, sama seperti
// `api/register`.
//
// APA YANG TIDAK DITERIMA ROUTE INI
// ---------------------------------
//   - `status` dan `catatanAdmin`. Keduanya milik admin. Field diambil satu per
//     satu dari body, tidak pernah `...body`, supaya `status: 'SELESAI'` yang
//     diselipkan penyerang tidak pernah sampai ke Prisma. Pola yang sama dengan
//     `api/register` menolak `role: 'SUPER_ADMIN'`.
//   - Nominal apa pun. Tidak ada kolom uang di tabelnya; harga dibicarakan lewat
//     WhatsApp saat admin menghubungi. Lihat komentar di `prisma/schema.prisma`.
//   - Berkas. Formulirnya tidak menerima unggahan karena `/api/upload` dijaga
//     sesi dan pengaju di sini tidak punya sesi. Fotonya dikirim lewat WhatsApp.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { keE164, normalisasiNomorLokal } from '@/lib/telepon';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { asalPermintaan } from '@/lib/asal-permintaan';
import { bacaBodyJson } from "@/lib/body-json";

// Batasnya lebih ketat daripada pendaftaran akun (10/jam): satu orang menawarkan
// satu atau dua titik, tidak lima. Kuncinya alamat asal dan bukan nomor WA —
// nomor datang dari pengirim dan bisa diganti setiap permintaan, jadi kunci per
// nomor tidak menahan apa pun.
//
// `asalPermintaan` boleh `null` bila header asalnya tidak ada, dan saat itu
// batasnya DILEWATI, bukan diganti kunci tetap: kunci tetap membuat semua
// pengunjung berbagi satu penghitung, sehingga lima kiriman dari siapa pun akan
// menutup formulir bagi semua orang selama sejam.
const BATAS_PENGAJUAN = 5;
const JENDELA_PENGAJUAN_MS = 60 * 60 * 1000;

// Batas panjang per kolom. Kolomnya `TEXT` di Postgres — tanpa batas di sini,
// satu permintaan bisa menyimpan megabyte teks per baris, dan daftar admin yang
// membacanya ikut melambat.
//
// Nilainya dipotong (`slice`), bukan ditolak: pengaju yang menulis catatan
// panjang tidak pantas kehilangan seluruh kirimannya karena batas yang tidak
// pernah ia lihat. Yang wajib diisi tetap ditolak bila kosong.
const BATAS = {
  namaPemilik: 120,
  alamat: 500,
  kota: 80,
  ukuran: 60,
  catatan: 2000,
  email: 200,
} as const;

/** Mengambil satu field teks dari body, dirapikan dan dipotong. */
function teks(nilai: unknown, batas: number): string {
  if (typeof nilai !== 'string') return '';
  return nilai.trim().slice(0, batas);
}

export async function POST(req: Request) {
  try {
    // Diperiksa sebelum body dibaca: menolak setelah pekerjaannya selesai tidak
    // menghemat apa pun.
    const asal = asalPermintaan(req);
    if (asal) {
      const batas = rateLimit({
        key: `sewakan-tempat:${asal}`,
        limit: BATAS_PENGAJUAN,
        windowMs: JENDELA_PENGAJUAN_MS,
      });

      if (!batas.success) {
        return NextResponse.json(
          {
            message: `Terlalu banyak pengajuan dari jaringan ini. Coba lagi dalam ${batas.retryAfterSeconds} detik, atau hubungi kami lewat WhatsApp.`,
          },
          { status: 429, headers: rateLimitHeaders(BATAS_PENGAJUAN, batas) }
        );
      }
    }

    const hasilBody = await bacaBodyJson(req, 'sewakan-tempat');
    if (!hasilBody.ok) return hasilBody.jawaban;
    const body = hasilBody.body;

    // Allowlist eksplisit. `status` dan `catatanAdmin` tidak ada di daftar ini
    // dan karena itu tidak bisa dikirim dari luar.
    const namaPemilik = teks(body.namaPemilik, BATAS.namaPemilik);
    const nomorWaMentah = typeof body.nomorWa === 'string' || typeof body.nomorWa === 'number'
      ? String(body.nomorWa).trim()
      : '';
    const alamat = teks(body.alamat, BATAS.alamat);
    const kota = teks(body.kota, BATAS.kota);
    const ukuran = teks(body.ukuran, BATAS.ukuran);
    const catatan = teks(body.catatan, BATAS.catatan);
    const email = teks(body.email, BATAS.email).toLowerCase();

    if (!namaPemilik || !nomorWaMentah || !alamat || !kota) {
      return NextResponse.json(
        { message: 'Nama, nomor WhatsApp, alamat lokasi, dan kota wajib diisi.' },
        { status: 400 }
      );
    }

    if (!keE164(nomorWaMentah)) {
      return NextResponse.json(
        { message: 'Format nomor WhatsApp tidak valid. Contoh: 08123456789.' },
        { status: 400 }
      );
    }

    // Email opsional — tapi bila diisi, bentuknya diperiksa. Alamat yang salah
    // tulis lebih buruk daripada kolom kosong: admin mengirim balasan ke alamat
    // mati dan menyimpulkan pengaju tidak menjawab.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: 'Format email tidak valid. Kosongkan bila tidak ingin diisi.' },
        { status: 400 }
      );
    }

    await prisma.pengajuanTitik.create({
      data: {
        namaPemilik,
        // Dinormalisasi supaya satu orang tidak tercatat dua kali dengan nomor
        // yang sama ditulis berbeda, dan supaya nomornya bisa langsung dipakai
        // menyusun tautan WhatsApp di daftar admin.
        //
        // Bentuknya sudah dibuktikan `keE164` di atas. Tanpa pembuktian itu,
        // `normalisasiNomorLokal` membuang huruf dan menyimpan sisa angkanya:
        // `+62812ABC4567` akan tersimpan sebagai nomor lain yang kelihatan sah,
        // dan pengaju tidak pernah diberi tahu nomornya diubah.
        nomorWa: normalisasiNomorLokal(nomorWaMentah),
        email: email || null,
        alamat,
        kota,
        ukuran: ukuran || null,
        catatan: catatan || null,
        // `status` tidak disebut di sini: nilainya `BARU` dari `@default` di
        // schema. Menuliskannya di sini membuat tempat kedua yang harus ikut
        // berubah bila nilai awalnya bergeser.
      },
      // Hanya `id` yang dibaca kembali, dan itu pun tidak diteruskan ke pengaju
      // — jawabannya di bawah hanya berisi pesan. Prisma menuntut sedikitnya
      // satu field bila `select` ditulis, dan tanpa `select` seluruh baris ikut
      // terbaca, termasuk `catatanAdmin` yang milik internal.
      select: { id: true },
    });

    return NextResponse.json(
      {
        message:
          'Pengajuan Anda sudah kami terima. Tim kami akan menghubungi nomor WhatsApp yang Anda tulis.',
      },
      { status: 201 }
    );
  } catch (error) {
    // Detail internal tidak dikirim ke client — pesan Prisma bisa memuat nama
    // kolom dan isi query.
    console.error('Gagal menyimpan pengajuan titik:', error);
    return NextResponse.json(
      { message: 'Terjadi kesalahan pada server. Coba lagi beberapa saat lagi.' },
      { status: 500 }
    );
  }
}
