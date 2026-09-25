// src/app/dashboard/DashboardWrapper.tsx
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from 'next/navigation';
import DashboardClientPage from './DashboardClientPage'; // Impor komponen client yang baru kita buat
import { jumlah, keAngka, uangUntukClient } from '@/lib/money';
import { isRevenueStatus } from '@/lib/revenue';
import { STATUS_MENGUNCI_TANGGAL } from '@/lib/transisi-status';

// Status yang dianggap "Aktif / Berjalan".
//
// Daftarnya dulu disalin tangan di sini sebagai sembilan literal string.
// Isinya kebetulan sama persis dengan `STATUS_MENGUNCI_TANGGAL` — semua status
// kecuali CANCELLED dan REFUNDED — dan memang seharusnya: pesanan "masih
// berjalan" dan pesanan "masih mengunci tanggal" adalah pertanyaan yang sama.
//
// Karena disalin, keduanya bisa berbeda tanpa ada yang menyadari. Status baru
// yang ditambahkan ke `TRANSISI_SAH` masuk ke daftar turunan dengan
// sendirinya, tapi tidak ke salinan ini: pelanggan lalu membuka dashboard dan
// pesanannya yang masih berjalan sudah pindah ke tab "Riwayat", seolah sudah
// selesai. Tidak ada galat, hanya dua daftar yang diam-diam berbeda.
const activeStatuses: readonly string[] = STATUS_MENGUNCI_TANGGAL;

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

  // Nominal uang di database bertipe Decimal — sebuah objek, bukan angka.
  // Next.js mengubah setiap prop menjadi JSON sebelum menyeberangkannya ke
  // komponen 'use client', dan objek Decimal tidak bisa diubah menjadi JSON:
  // halaman dashboard gagal dirender saat dijalankan. Karena `order` di
  // BookingCard bertipe `any`, pemeriksaan tipe tidak memperingatkan apa pun.
  // Jadi semua nominal diubah ke angka biasa di sini, sebelum menyeberang.
  const siapkanPesanan = (b: (typeof myBookings)[number]) => ({
    ...b,
    totalPrice: uangUntukClient(b.totalPrice),
    dpAmount: b.dpAmount === null ? null : uangUntukClient(b.dpAmount),
    refundAmount: b.refundAmount === null ? null : uangUntukClient(b.refundAmount),
    // Empat kolom rincian di bawah baru terisi sejak harga dihitung di server.
    // Tanpa konversi ini mereka ikut terbawa `...b` sebagai objek Decimal —
    // halaman ini akan mati saat dijalankan begitu ada satu komponen yang
    // menampilkannya, dan `tsc` tidak akan berkata apa-apa karena prop
    // `order` di BookingCard bertipe `any`.
    unitPrice: b.unitPrice === null ? null : uangUntukClient(b.unitPrice),
    basePrice: b.basePrice === null ? null : uangUntukClient(b.basePrice),
    taxAmount: b.taxAmount === null ? null : uangUntukClient(b.taxAmount),
    adminFee: b.adminFee === null ? null : uangUntukClient(b.adminFee),
    billboard: b.billboard
      ? { ...b.billboard, price: uangUntukClient(b.billboard.price) }
      : b.billboard,
  });

  const activeOrders = myBookings.filter(b => activeStatuses.includes(b.status)).map(siapkanPesanan);
  const historyOrders = myBookings.filter(b => !activeStatuses.includes(b.status)).map(siapkanPesanan);

  // `acc + curr.totalPrice` dulu menyambung teks, bukan menjumlah: hasilnya
  // "1000000015000000" alih-alih 25.000.000. Ditampilkan sebagai "Total
  // Pengeluaran" di kartu profil.
  //
  // Penyaringan statusnya juga dulu salah pada dua hal. Pertama, `REFUNDED`
  // ikut dijumlahkan: pelanggan yang pesanannya dibatalkan dan uangnya sudah
  // dikembalikan penuh tetap melihat nominal itu tercatat sebagai
  // pengeluarannya — seolah uangnya hangus. Kedua, pesanan yang sudah dibayar
  // tapi belum tayang (PAID_CONFIRMED sampai INSTALLATION) tidak dihitung,
  // jadi pelanggan yang baru saja membayar melihat "Total Pengeluaran" tetap
  // nol sampai billboardnya terpasang. Kini daftarnya satu dengan yang dipakai
  // laporan admin, lewat `isRevenueStatus`.
  const totalSpent = keAngka(
    jumlah(
      ...myBookings
        .filter(b => isRevenueStatus(b.status))
        .map(b => b.totalPrice)
    )
  );

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