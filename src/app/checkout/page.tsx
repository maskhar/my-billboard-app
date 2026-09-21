// src/app/checkout/page.tsx
import Navbar from '@/components/Navbar';
import { prisma } from '@/lib/prisma';
import CheckoutForm from '@/components/CheckoutForm';
import { redirect } from 'next/navigation';

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
        
        <CheckoutForm billboard={billboard} startDate={startDate} duration={parseInt(duration)} />
        
      </div>
    </div>
  );
}