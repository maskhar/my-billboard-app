// src/app/dashboard/DashboardWrapper.tsx
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from 'next/navigation';
import DashboardClientPage from './DashboardClientPage'; // Impor komponen client yang baru kita buat

// Status yang dianggap "Aktif / Berjalan"
const activeStatuses = [
    'PENDING_PAYMENT', 
    'PAID_CONFIRMED', 
    'ACTIVE', 
    'REVIEW_REFUND', 
    'PROCESS_REFUND', 
    'WAITING_BANK',
    'DESIGN_RECEIVED', 
    'IN_PRODUCTION', 
    'INSTALLATION'
];

export default async function DashboardWrapper() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
      redirect('/login');
  }

  // Semua logika pengambilan data ada di sini (Server Component)
  const myBookings = await prisma.booking.findMany({
      where: { userId: session.user.id },
      include: { billboard: true },
      orderBy: { createdAt: 'desc' }
  });

  const activeOrders = myBookings.filter(b => activeStatuses.includes(b.status));
  const historyOrders = myBookings.filter(b => !activeStatuses.includes(b.status));

  const totalSpent = myBookings
    .filter(b => ['ACTIVE', 'REFUNDED'].includes(b.status))
    .reduce((acc, curr) => acc + curr.totalPrice, 0);

  // Render komponen client dan kirim data sebagai props
  return (
    <DashboardClientPage 
        session={session}
        activeOrders={activeOrders}
        historyOrders={historyOrders}
        totalSpent={totalSpent}
    />
  );
}