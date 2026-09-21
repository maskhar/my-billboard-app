

















import { prisma } from '@/lib/prisma';
import TransactionClient from './TransactionClient';
import Link from 'next/link';
import { getServerSession } from "next-auth"; 
import { authOptions } from "@/lib/auth";

export default async function AdminTransactionsPage({ searchParams }: { searchParams: { status?: string } }) {
  const session = await getServerSession(authOptions);
  const currentUserRole = session?.user?.role || 'USER';

  const filterStatus = searchParams.status || 'ALL';

  const whereClause: any = {};
  if (filterStatus === 'PENDING') whereClause.status = { in: ['PENDING_PAYMENT', 'PAID_CONFIRMED'] };
  if (filterStatus === 'ACTIVE') whereClause.status = 'ACTIVE';
  if (filterStatus === 'REFUND') whereClause.status = { in: ['REFUND_REQUESTED', 'PROCESS_REFUND', 'WAITING_BANK'] };
  if (filterStatus === 'DONE') whereClause.status = { in: ['REFUNDED', 'CANCELLED', 'INSTALLATION', 'IN_PRODUCTION', 'DESIGN_RECEIVED'] };

  const transactions = await prisma.booking.findMany({
      where: whereClause,


      orderBy: { createdAt: 'desc' }, 
      include: { 
        user: true, 
        billboard: true,
        additionalCharges: true // <-- MENAMBAHKAN DATA BIAYA TAMBAHAN
      }
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Transactions</h1>
            <p className="text-gray-500 text-sm">Total: <span className="font-bold text-utero">{transactions.length}</span> transaksi</p>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 p-1 bg-white border border-gray-200 rounded-lg shadow-sm">
            <Link href='/admin/orders' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='ALL'?'bg-gray-800 text-white shadow':'text-gray-500 hover:bg-gray-50'}`}>Semua</Link>
            <Link href='/admin/orders?status=PENDING' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='PENDING'?'bg-yellow-500 text-white shadow':'text-gray-500 hover:bg-yellow-50'}`}>Pending</Link>
            <Link href='/admin/orders?status=ACTIVE' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='ACTIVE'?'bg-green-600 text-white shadow':'text-gray-500 hover:bg-green-50'}`}>Aktif</Link>
            <Link href='/admin/orders?status=REFUND' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='REFUND'?'bg-blue-600 text-white shadow':'text-gray-500 hover:bg-blue-50'}`}>Refund</Link>
            <Link href='/admin/orders?status=DONE' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='DONE'?'bg-red-500 text-white shadow':'text-gray-500 hover:bg-red-50'}`}>Selesai</Link>
        </div>
      </div>
      <TransactionClient transactions={transactions} currentUserRole={currentUserRole} />
    </div>
  );
}