// src/app/api/register/route.ts
//
// Route ini HILANG — direktori `src/app/api/register/` ada tapi kosong, dan
// `src/app/register/page.tsx:28` mengarah ke `${NEXT_PUBLIC_API_URL}/api/users/register`
// di backend NestJS.
//
// Endpoint NestJS itu memanggil `UsersService.create()`, yang badannya hanya
// berisi komentar `// ... (existing create method)` — tanpa implementasi.
// Karena method kosong mengembalikan `undefined` tanpa melempar error,
// controller-nya tetap membalas 201 dengan `{ message: 'Sukses mendaftar' }`.
//
// Akibatnya halaman menampilkan "Pendaftaran Berhasil! Silakan Login." padahal
// tidak ada satu pun baris User yang dibuat. Pengguna lalu mencoba login dan
// ditolak, tanpa petunjuk apa pun tentang apa yang salah.
//
// Implementasi di bawah ditulis dari awal karena tidak ada yang bisa diport.

import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { adalahDuplikatUnik } from '@/lib/db-error';
import { keE164, normalisasiNomorLokal } from '@/lib/telepon';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Allowlist eksplisit. Field diambil satu per satu, tidak pernah
    // `...body` — supaya `role: 'SUPER_ADMIN'` atau `isVerified: true` yang
    // diselipkan penyerang ke dalam payload tidak pernah sampai ke Prisma.
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' || typeof body.phone === 'number'
      ? String(body.phone).trim()
      : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!name || !email || !phone || !password) {
      return NextResponse.json(
        { message: 'Nama, email, nomor WhatsApp, dan password wajib diisi.' },
        { status: 400 }
      );
    }

    if (!keE164(phone)) {
      return NextResponse.json(
        { message: 'Format nomor WhatsApp tidak valid.' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { message: 'Format email tidak valid.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: 'Password minimal 8 karakter.' },
        { status: 400 }
      );
    }

    // bcrypt memotong input di 72 byte; menolak lebih awal lebih jujur
    // daripada diam-diam mengabaikan sisa karakter yang diketik pengguna.
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return NextResponse.json(
        { message: 'Password terlalu panjang (maksimal 72 karakter).' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, authProvider: true },
    });

    if (existing) {
      // Pesannya sengaja tidak membedakan "email sudah dipakai untuk akun
      // Google" dari "sudah dipakai akun biasa". Membedakannya akan
      // memberitahu orang asing apakah sebuah alamat terdaftar di sini dan
      // dengan cara apa.
      return NextResponse.json(
        { message: 'Email sudah terdaftar. Silakan login.' },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(password, 12);

    // Pemeriksaan di atas menangkap kasus biasa, tapi tidak menutup celah
    // balapan: `hash(password, 12)` sengaja lambat (ratusan milidetik), dan
    // selama itu permintaan kedua dengan email yang sama bisa lewat
    // pemeriksaan yang sama — keduanya lolos, keduanya menulis. Ini bukan
    // kasus langka: klik ganda pada tombol Daftar sudah cukup.
    //
    // Yang menolak penulisan kedua adalah unique index pada kolom `email`.
    // Sebelumnya penolakan itu jatuh ke catch umum di bawah dan pengguna
    // membaca "Terjadi kesalahan pada server" — padahal pesan yang benar sudah
    // ditulis beberapa baris di atas, hanya tidak pernah sampai.
    let user;
    try {
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          // Dinormalisasi supaya satu orang tidak bisa terdaftar tiga kali
          // dengan nomor yang sama ditulis berbeda — dan supaya nomor yang
          // tersimpan bisa dipakai gerbang pembayaran tanpa ditafsirkan ulang.
          //
          // Bentuknya sudah dibuktikan `keE164` di atas. Tanpa pembuktian itu,
          // `normalisasiNomorLokal` membuang huruf dan menyimpan sisa angkanya:
          // `+62812ABC4567` akan tersimpan sebagai nomor lain yang kelihatan
          // sah, dan pembeli tidak pernah diberi tahu nomornya diubah.
          whatsapp: normalisasiNomorLokal(phone),
          role: 'USER',          // selalu USER; tidak pernah dari body
          authProvider: 'EMAIL',
          isVerified: false,
        },
        select: { id: true, name: true, email: true },
      });
    } catch (error) {
      if (adalahDuplikatUnik(error, 'email')) {
        // Pesan dan status disamakan persis dengan jalur di atas, supaya
        // pengguna tidak bisa membedakan mana yang tertangkap pemeriksaan dan
        // mana yang tertangkap database.
        return NextResponse.json(
          { message: 'Email sudah terdaftar. Silakan login.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(
      { user, message: 'Pendaftaran berhasil' },
      { status: 201 }
    );
  } catch (error) {
    // Detail internal tidak dikirim ke client — pesan Prisma bisa memuat nama
    // kolom dan isi query.
    console.error('Gagal mendaftarkan user:', error);
    return NextResponse.json(
      { message: 'Terjadi kesalahan pada server.' },
      { status: 500 }
    );
  }
}
