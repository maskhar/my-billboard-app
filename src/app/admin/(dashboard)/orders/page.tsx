// src/app/admin/(dashboard)/orders/page.tsx
import type { ComponentProps } from 'react';
import { prisma } from '@/lib/prisma';
import { uangUntukClient } from '@/lib/money';
import TransactionClient from './TransactionClient';
import Link from 'next/link';
import { getServerSession } from "next-auth"; 
import { authOptions } from "@/lib/auth";

const PER_HALAMAN = 25;

// Sejak Next 16, `searchParams` adalah sebuah Promise dan harus di-`await`
// dulu. Sebelumnya propertinya dibaca langsung dari objek Promise, sehingga
// `searchParams.status` dan `searchParams.halaman` SELALU `undefined`: filter
// tab jatuh ke 'ALL' dan halaman selalu 1. Tombol "Berikutnya" mengubah URL
// tapi tidak mengubah isi tabel, dan tab Refund menampilkan semua transaksi.
// Tidak ada error yang muncul — baik di `tsc` maupun saat dijalankan.
export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; halaman?: string }>;
}) {
  const paramsQuery = await searchParams;
  const session = await getServerSession(authOptions);
  const currentUserRole = session?.user?.role || 'USER';

  const filterStatus = paramsQuery.status || 'ALL';

  const whereClause: any = {};
  if (filterStatus === 'PENDING') whereClause.status = { in: ['PENDING_PAYMENT', 'PAID_CONFIRMED'] };
  if (filterStatus === 'ACTIVE') whereClause.status = 'ACTIVE';
  // Dulu tertulis 'REFUND_REQUESTED' — status yang tidak pernah ditulis
  // ke database oleh kode mana pun. Yang sebenarnya dipakai saat user
  // mengajukan refund adalah 'REVIEW_REFUND' (request-refund/route.ts).
  // Akibatnya: pengajuan refund yang baru masuk TIDAK MUNCUL di tab Refund,
  // dan baru terlihat setelah user mengisi nomor rekening. Permintaan yang
  // berhenti sebelum itu tidak pernah terlihat admin.
  if (filterStatus === 'REFUND') whereClause.status = { in: ['REVIEW_REFUND', 'PROCESS_REFUND', 'WAITING_BANK'] };

  // DESIGN_RECEIVED, IN_PRODUCTION, dan INSTALLATION dulu ikut masuk tab
  // "Selesai". Ketiganya justru pesanan yang sedang DIKERJAKAN: desain baru
  // masuk, bahan sedang dicetak, tim sedang memasang. Akibatnya pekerjaan
  // yang sedang berjalan terkubur di antara pesanan yang sudah tutup, dan
  // tidak muncul di tab mana pun yang berarti "sedang dikerjakan".
  if (filterStatus === 'PROGRESS') whereClause.status = { in: ['DESIGN_RECEIVED', 'IN_PRODUCTION', 'INSTALLATION'] };
  if (filterStatus === 'DONE') whereClause.status = { in: ['REFUNDED', 'CANCELLED'] };

  // Relasi `user` sebelumnya diambil utuh (`user: true`), sehingga hash
  // password, otpCode, dan otpExpires milik tiap pemesan ikut terkirim ke
  // komponen client dan tertanam di HTML halaman. TransactionClient hanya
  // memakai name, email, dan whatsapp — jadi hanya itu yang dilewatkan.
  // Tanpa `take`, query ini mengambil SELURUH riwayat transaksi setiap kali
  // halaman dibuka — beserta relasi user, billboard penuh, dan seluruh biaya
  // tambahan per baris. Semuanya lalu diserialisasi dan ditanam ke dalam HTML.
  // Dengan 50 pesanan itu tidak terasa; setelah setahun beroperasi, halaman
  // yang paling sering dipakai admin justru yang paling lambat terbuka.
  const halamanMentah = Number(paramsQuery.halaman);
  const halaman = Number.isFinite(halamanMentah) && halamanMentah >= 1 ? Math.floor(halamanMentah) : 1;

  const [transactions, totalTransaksi] = await prisma.$transaction([
    prisma.booking.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              whatsapp: true,
            },
          },
          billboard: true,
          additionalCharges: true // <-- MENAMBAHKAN DATA BIAYA TAMBAHAN
        },
        skip: (halaman - 1) * PER_HALAMAN,
        take: PER_HALAMAN,
    }),
    prisma.booking.count({ where: whereClause }),
  ]);

  const totalHalaman = Math.max(1, Math.ceil(totalTransaksi / PER_HALAMAN));

  // Semua nominal di bawah bertipe Decimal, dan objek Decimal tidak bisa
  // diubah menjadi JSON. Sebelumnya hasil query di atas diteruskan apa adanya
  // ke TransactionClient (`'use client'`), jadi halaman transaksi ini mati
  // saat dijalankan — seluruh pesanan tidak bisa dikelola. Cast
  // `as unknown as` di bawah membuat TypeScript diam soal ini.
  const transactionsUntukClient = transactions.map(trx => ({
    ...trx,
    totalPrice: uangUntukClient(trx.totalPrice),
    dpAmount: trx.dpAmount === null ? null : uangUntukClient(trx.dpAmount),
    refundAmount: trx.refundAmount === null ? null : uangUntukClient(trx.refundAmount),
    unitPrice: trx.unitPrice === null ? null : uangUntukClient(trx.unitPrice),
    basePrice: trx.basePrice === null ? null : uangUntukClient(trx.basePrice),
    taxAmount: trx.taxAmount === null ? null : uangUntukClient(trx.taxAmount),
    adminFee: trx.adminFee === null ? null : uangUntukClient(trx.adminFee),
    billboard: { ...trx.billboard, price: uangUntukClient(trx.billboard.price) },
    additionalCharges: trx.additionalCharges.map(charge => ({
      ...charge,
      amount: uangUntukClient(charge.amount),
    })),
  }));

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Transactions</h1>
            {/* Dulu tertulis `transactions.length` — sejak ada paginasi, itu
                jumlah baris DI HALAMAN INI, bukan jumlah transaksi. Admin
                akan membaca "25 transaksi" untuk usaha yang punya ribuan. */}
            <p className="text-gray-500 text-sm">Total: <span className="font-bold text-utero">{totalTransaksi}</span> transaksi</p>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 p-1 bg-white border border-gray-200 rounded-lg shadow-sm">
            <Link href='/admin/orders' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='ALL'?'bg-gray-800 text-white shadow':'text-gray-500 hover:bg-gray-50'}`}>Semua</Link>
            <Link href='/admin/orders?status=PENDING' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='PENDING'?'bg-yellow-500 text-white shadow':'text-gray-500 hover:bg-yellow-50'}`}>Pending</Link>
            <Link href='/admin/orders?status=PROGRESS' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='PROGRESS'?'bg-purple-600 text-white shadow':'text-gray-500 hover:bg-purple-50'}`}>Dikerjakan</Link>
            <Link href='/admin/orders?status=ACTIVE' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='ACTIVE'?'bg-green-600 text-white shadow':'text-gray-500 hover:bg-green-50'}`}>Aktif</Link>
            <Link href='/admin/orders?status=REFUND' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='REFUND'?'bg-blue-600 text-white shadow':'text-gray-500 hover:bg-blue-50'}`}>Refund</Link>
            <Link href='/admin/orders?status=DONE' className={`px-4 py-2 rounded-md text-xs font-bold transition ${filterStatus==='DONE'?'bg-red-500 text-white shadow':'text-gray-500 hover:bg-red-50'}`}>Selesai</Link>
        </div>
      </div>
      {/*
        CATATAN TINDAK LANJUT: TransactionClient masih mendeklarasikan propsnya
        sebagai `Booking & { user: User; ... }` — tipe Prisma yang utuh, lebih
        longgar daripada data yang benar-benar dikirim sejak relasi user
        dipersempit di atas. Cast ini menjembatani sementara; idealnya tipe
        `Transaction` di TransactionClient.tsx dipersempit agar sesuai (file itu
        di luar cakupan perubahan ini).
      */}
      <TransactionClient
        transactions={transactionsUntukClient as unknown as ComponentProps<typeof TransactionClient>['transactions']}
        currentUserRole={currentUserRole}
      />

      {totalHalaman > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Halaman {halaman} dari {totalHalaman}
          </span>
          <div className="flex gap-2">
            {halaman > 1 && (
              <Link
                href={`/admin/orders?${new URLSearchParams({ ...(filterStatus !== 'ALL' ? { status: filterStatus } : {}), halaman: String(halaman - 1) })}`}
                className="rounded border border-gray-200 bg-white px-3 py-1.5 font-bold text-gray-600 transition hover:bg-gray-50"
              >
                Sebelumnya
              </Link>
            )}
            {halaman < totalHalaman && (
              <Link
                href={`/admin/orders?${new URLSearchParams({ ...(filterStatus !== 'ALL' ? { status: filterStatus } : {}), halaman: String(halaman + 1) })}`}
                className="rounded border border-gray-200 bg-white px-3 py-1.5 font-bold text-gray-600 transition hover:bg-gray-50"
              >
                Berikutnya
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}