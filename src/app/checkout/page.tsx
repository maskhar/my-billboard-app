// src/app/checkout/page.tsx
import Navbar from '@/components/Navbar';
import { prisma } from '@/lib/prisma';
import CheckoutForm from '@/components/CheckoutForm';
import { redirect } from 'next/navigation';
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

  // 3. Ambil Data ASLI dari Database
  const billboard = await prisma.billboard.findUnique({
      where: { id: billboardId }
  });

  // Jika ID billboard tidak valid, redirect juga.
  if (!billboard) {
      redirect('/');
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24">
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
        />
        
      </div>
    </div>
  );
}