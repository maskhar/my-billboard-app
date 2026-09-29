// src/app/checkout/page.tsx
import Navbar from '@/components/Navbar';
import { prisma } from '@/lib/prisma';
import CheckoutForm from '@/components/CheckoutForm';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { uangUntukClient } from '@/lib/money';

// Kita gunakan ini untuk menangkap parameter dari URL
type Props = {
    searchParams: Promise<{ [key:string]: string | string[] | undefined }>;
}

export default async function CheckoutPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  
    // 1. Baca ID, Tanggal, dan Durasi dari Link URL
  const billboardId = resolvedSearchParams.id as string;
  const startDate = resolvedSearchParams.date as string;
  const duration = resolvedSearchParams.duration as string;

  // 2. Validasi Kritis: Pastikan semua data ada.
  // Jika user iseng atau ada link yang salah, redirect ke home.
  if (!billboardId || !startDate || !duration) {
      console.error("Checkout attempt with missing params:", { billboardId, startDate, duration });
      redirect('/');
  }

  // 3. SESI WAJIB.
  //
  // Halaman ini dulu bisa dibuka tanpa login. Pembeli mengisi seluruh formulir,
  // menekan Lanjutkan, dan `api/booking/create` menjawab 401 "Sesi Habis." —
  // yang di layar muncul sebagai `alert("❌ Gagal: Sesi Habis.")` setelah semua
  // isian selesai diketik. Ditolak di sini, sebelum satu kolom pun diisi, dan
  // `callbackUrl` membawa pembeli kembali ke checkout yang sama setelah login
  // (termasuk tanggal dan durasinya).
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
      const tujuan = `/checkout?id=${encodeURIComponent(billboardId)}&date=${encodeURIComponent(startDate)}&duration=${encodeURIComponent(duration)}`;
      redirect(`/login?callbackUrl=${encodeURIComponent(tujuan)}`);
  }

  // Admin tidak boleh memesan — gerbang yang sama dengan `api/booking/create`.
  // Tanpa gerbang di sini, admin melihat formulir lengkap lalu ditolak 403 oleh
  // route, dan `CheckoutForm` memberi `alert` setelah semuanya diisi.
  if (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN') {
      redirect('/admin');
  }

  // 4. Ambil Data ASLI dari Database
  //
  // Identitas penyewa diambil bersamaan agar formulirnya terisi lebih dulu.
  // Kolomnya HANYA yang dirender: `findUnique` tanpa `select` membawa `ktp`,
  // `ktpAddress`, dan `xenditCustomerId` ke halaman yang tidak memerlukannya.
  const [billboard, penyewa] = await Promise.all([
      prisma.billboard.findUnique({
          where: { id: billboardId }
      }),
      prisma.user.findUnique({
          where: { id: session.user.id },
          select: { name: true, email: true, whatsapp: true, companyName: true, npwp: true },
      }),
  ]);

  // Jika ID billboard tidak valid, redirect juga.
  if (!billboard) {
      redirect('/');
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      {/* `<main>`, bukan `<div>`: pembaca layar punya pintasan langsung ke
          landmark utama, dan tanpa satu pun `<main>` di halaman, pintasan itu
          tidak menemukan apa-apa sehingga pengguna harus menelusuri seluruh
          navbar dulu. Tautan lewati di `Navbar` menutup kasus papan tombol;
          landmark ini menutup kasus pembaca layar yang menavigasi per-wilayah.
          Hanya SATU `<main>` per halaman — itu sebabnya ia dipasang di
          pembungkus isi, bukan di dalam kartu. */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Checkout & Pembayaran</h1>
        
        {/*
          Dulu seluruh baris billboard diserahkan apa adanya ke komponen
          client. Dua masalah sekaligus:

          1. `price` bertipe Decimal, dan Next.js mengubah setiap prop menjadi
             JSON saat menyeberang ke komponen 'use client'. Objek Decimal
             gagal diubah — halaman checkout mati saat dijalankan, padahal
             pemeriksaan tipe tidak berkata apa-apa.
          2. Seluruh kolom ikut terkirim ke browser, termasuk yang tidak
             dipakai tampilan sama sekali.

          Sekarang hanya lima kolom yang memang dirender yang dikirim.
        */}
        <CheckoutForm
          billboard={{
            id: billboard.id,
            title: billboard.title,
            type: billboard.type,
            price: uangUntukClient(billboard.price),
            mainImage: billboard.mainImage,
          }}
          startDate={startDate}
          duration={parseInt(duration)}
          penyewa={{
            // Diambil dari database, BUKAN dari `useSession()` di browser. Token
            // JWT dibuat saat login dan tidak ikut berubah saat profil
            // diperbarui, jadi sesi bisa membawa nama lama; `whatsapp`,
            // `companyName`, dan `npwp` tidak ada di token sama sekali.
            name: penyewa?.name ?? '',
            email: penyewa?.email ?? '',
            whatsapp: penyewa?.whatsapp ?? '',
            companyName: penyewa?.companyName ?? '',
            npwp: penyewa?.npwp ?? '',
          }}
        />

      </main>
    </div>
  );
}