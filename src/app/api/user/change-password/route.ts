// src/app/api/user/change-password/route.ts
//
// Route ini dulu MELEMAHKAN akun setiap kali dipakai.
//
// `bcrypt.hash(newPassword, 10)` di sini lawan `hash(password, 12)` di
// `api/register` dan `api/admin/users/create`: pengguna yang mengganti
// passwordnya diturunkan diam-diam ke biaya hash yang empat kali lebih murah
// ditebak bila database bocor. Tidak ada batas panjang minimum juga, jadi
// password satu karakter yang DITOLAK saat mendaftar diterima di sini. Nasihat
// "ganti password Anda secara berkala" karena itu justru melemahkan akunnya.
//
// Aturannya sekarang satu, di `src/lib/sandi.ts`, dan diimpor oleh ketiga
// penulis hash.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { BIAYA_HASH_SANDI, periksaSandiBaru } from '@/lib/sandi';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';

// Password lama diuji di sini, dan ujiannya gratis bagi penyerang yang sudah
// memegang sesi curian: tanpa pembatas ia bisa menebak password lama sebanyak
// apa pun untuk memakainya di layanan lain, dan setiap tebakan memakan ~230 ms
// CPU di `bcrypt.compare`. Kuncinya id akun, bukan alamat asal: yang dilindungi
// adalah satu akun, dan sesi sudah membuktikan akun mana.
const BATAS_GANTI_SANDI = 10;
const JENDELA_GANTI_SANDI_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Tidak terautentikasi.' }, { status: 401 });
    }

    try {
        const batas = rateLimit({
            key: `ganti-sandi:${session.user.id}`,
            limit: BATAS_GANTI_SANDI,
            windowMs: JENDELA_GANTI_SANDI_MS,
        });
        if (!batas.success) {
            return NextResponse.json(
                { message: `Terlalu banyak percobaan. Coba lagi dalam ${batas.retryAfterSeconds} detik.` },
                { status: 429, headers: rateLimitHeaders(BATAS_GANTI_SANDI, batas) }
            );
        }

        const body = await req.json();

        // TIPENYA, bukan keberadaannya. `if (!currentPassword)` meloloskan objek
        // (`{}` selalu truthy), dan nilai itu lalu sampai ke `bcrypt.compare`
        // yang melemparnya sebagai galat internal — pengguna membaca "Terjadi
        // kesalahan pada server" untuk isian yang ia ketik sendiri.
        const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
        if (currentPassword === '') {
            return NextResponse.json({ message: 'Password saat ini wajib diisi.' }, { status: 400 });
        }

        const sandiBaru = periksaSandiBaru(body?.newPassword);
        if (!sandiBaru.sah) {
            return NextResponse.json({ message: sandiBaru.pesan }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            // Kolomnya dipilih satu per satu. `findUnique` tanpa `select`
            // membawa seluruh baris — termasuk `ktp`, `npwp`, dan kolom OTP — ke
            // memori pada setiap percobaan, juga yang gagal.
            select: { id: true, password: true },
        });

        if (!user || !user.password) {
            return NextResponse.json({ message: 'Pengguna tidak ditemukan atau tidak memiliki password (mungkin login via Google?).' }, { status: 404 });
        }

        // Cek apakah password saat ini cocok
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ message: 'Password saat ini salah.' }, { status: 403 }); // 403 Forbidden
        }

        // Password baru yang sama dengan yang lama ditolak: menjawab "berhasil
        // diubah" untuk password yang tidak berubah membuat pengguna percaya
        // akunnya sudah diselamatkan padahal belum — yang justru berbahaya bila
        // ia mengganti password karena menduga passwordnya bocor.
        if (await bcrypt.compare(sandiBaru.nilai, user.password)) {
            return NextResponse.json(
                { message: 'Password baru harus berbeda dari password saat ini.' },
                { status: 400 }
            );
        }

        // Biaya 12, diimpor dari `@/lib/sandi` — bukan angka yang ditulis ulang
        // di sini dan bisa menyimpang lagi dari dua penulis hash lainnya.
        const hashedNewPassword = await bcrypt.hash(sandiBaru.nilai, BIAYA_HASH_SANDI);

        // Update password di database
        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                password: hashedNewPassword,
            },
        });

        return NextResponse.json({ message: 'Password berhasil diubah.' }, { status: 200 });

    } catch (error) {
        console.error("Error changing password:", error);
        return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
    }
}
