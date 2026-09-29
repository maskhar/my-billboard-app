// src/app/api/admin/users/create/route.ts
//
// Sebelumnya route ini tanpa autentikasi: siapa pun bisa POST dan membuat akun
// SUPER_ADMIN untuk dirinya sendiri, karena `role` diambil mentah dari body.
// Sekarang: wajib sesi admin, dan hanya SUPER_ADMIN yang boleh menentukan role.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { Role, daftarNilai, sahRole } from '@/lib/enum-guard';
import { adalahDuplikatUnik } from '@/lib/db-error';
import { BIAYA_HASH_SANDI, periksaSandiBaru } from '@/lib/sandi';
import { bacaBodyJson } from "@/lib/body-json";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const hasilBody = await bacaBodyJson(req, 'admin/users/create');
    if (!hasilBody.ok) return hasilBody.jawaban;
    const body = hasilBody.body;
    const { role } = body;

    // 1. Validasi input dasar
    //
    // TIPENYA, BUKAN KEBERADAANNYA. Ketiga nilai di bawah dulu diambil mentah
    // dan hanya diperiksa truthy. Objek selalu truthy, jadi
    // `{"email":{"not":""}}` lolos utuh ke `where` milik `findUnique` di
    // bawah — gerbang email-ganda itulah yang gagal, dan admin melihat 500
    // "Terjadi kesalahan pada server".
    //
    // `email` juga DINORMALKAN. Tanpa `toLowerCase()`, akun yang dibuat admin
    // sebagai `Budi@X.test` tersimpan apa adanya sementara `authorize` di
    // `src/lib/auth.ts` mencari dengan alamat yang sudah dihuruf-kecilkan:
    // akunnya ada, tapi pemiliknya tidak akan pernah bisa login dan pesan yang
    // ia terima hanya "Email atau password salah".
    //
    // Aturannya disamakan dengan `api/register` supaya akun yang dibuat admin
    // tidak lebih lemah daripada yang mendaftar sendiri.
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!name || !email || !password) {
      return NextResponse.json({ message: 'Semua field harus diisi.' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: 'Format email tidak valid.' }, { status: 400 });
    }

    // Panjang minimum dan batas 72 byte bcrypt datang dari `@/lib/sandi`, satu
    // tempat yang sama dengan `api/register` dan `api/user/change-password`.
    // Ketiganya dulu menuliskan aturannya sendiri, dan yang ketiga menyimpang.
    const sandi = periksaSandiBaru(password);
    if (!sandi.sah) {
      return NextResponse.json({ message: sandi.pesan }, { status: 400 });
    }

    // 2. Tentukan role. Hanya SUPER_ADMIN yang boleh mengangkat role apa pun;
    //    ADMIN biasa selalu membuat akun USER, berapa pun isi body-nya.
    //    Daftar role sekarang berasal dari enum Prisma, bukan array terpisah
    //    yang harus diingat untuk ikut diperbarui setiap kali role bertambah.
    let roleFinal: Role = Role.USER;
    if (session.user.role === 'SUPER_ADMIN' && role) {
      if (!sahRole(role)) {
        return NextResponse.json(
          { message: `Role tidak valid. Nilai yang sah: ${daftarNilai(Role)}` },
          { status: 400 }
        );
      }
      roleFinal = role;
    }

    // 3. Cek apakah email sudah ada
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Email sudah terdaftar.' }, { status: 409 }); // 409 Conflict
    }

    // 4. Hash password
    //
    // Biaya 12, sama dengan `api/register`. Sebelumnya 10 di sini dan 12 di
    // sana: akun buatan admin — yang justru paling sering berperan ADMIN atau
    // SUPER_ADMIN — dilindungi lebih lemah daripada akun pembeli biasa.
    // Angkanya sekarang diimpor, bukan ditulis ulang di tiap penulis hash.
    const hashedPassword = await bcrypt.hash(sandi.nilai, BIAYA_HASH_SANDI);

    // 5. Buat user baru. Field sensitif (isVerified, authProvider, otp*) diset
    //    di server, tidak pernah diambil dari body.
    //
    // Pemeriksaan di langkah 3 menutup kasus biasa tapi bukan balapan:
    // `bcrypt.hash(password, 12)` sengaja lambat, dan selama ratusan milidetik
    // itu permintaan kedua dengan email sama bisa lewat pemeriksaan yang sama.
    // Klik ganda pada tombol Simpan sudah cukup. Yang menolak penulisan kedua
    // adalah unique index `email`, dan penolakannya harus dibaca sebagai 409
    // yang sama — bukan 500 "Terjadi kesalahan pada server".
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: roleFinal,
          authProvider: 'EMAIL', // Default untuk pembuatan manual
          isVerified: true, // Akun buatan admin dianggap terverifikasi
        },
        // Select eksplisit: hash password dan kolom OTP tidak ikut terkirim.
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isVerified: true,
          authProvider: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (adalahDuplikatUnik(error, 'email')) {
        // Status dan pesan disamakan persis dengan jalur di langkah 3.
        return NextResponse.json({ message: 'Email sudah terdaftar.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(newUser, { status: 201 }); // 201 Created
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
