// src/app/dashboard/DashboardWrapper.tsx
import { PaymentStatus } from '@prisma/client';
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

  // KOLOM DIPILIH SATU PER SATU, BUKAN `include: { billboard: true }`.
  //
  // Sebelumnya seluruh baris Booking dan Billboard dikirim ke komponen client,
  // lalu disebar dengan `...b`. Artinya setiap kolom baru pada kedua tabel ikut
  // menyeberang ke browser dengan sendirinya — termasuk kolom yang tidak pernah
  // ditampilkan. Pada tabel pembayaran kolom seperti itu bukan hal sepele:
  // id sesi provider, id customer, dan payload webhook tidak boleh pernah
  // sampai ke browser. Daftar di bawah adalah tepat apa yang dipakai layar.
  const myBookings = await prisma.booking.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        totalPrice: true,
        dpAmount: true,
        designOption: true,
        designFileUrl: true,
        designStatus: true,
        designRejectionReason: true,
        refundProof: true,
        billboard: {
          select: {
            slug: true,
            title: true,
            address: true,
            mainImage: true,
          },
        },
        // Hanya keberadaannya yang dibutuhkan layar, bukan isi barisnya. `select`
        // di sini dipersempit ke `id` supaya tidak ada satu pun kolom sesi
        // pembayaran yang terbawa; `id`-nya sendiri tidak diteruskan ke client.
        payments: {
          where: { status: PaymentStatus.PENDING },
          select: { id: true },
          take: 1,
        },
      },
  });

  // Nominal uang di database bertipe Decimal — sebuah objek, bukan angka.
  // Next.js mengubah setiap prop menjadi JSON sebelum menyeberangkannya ke
  // komponen 'use client', dan objek Decimal tidak bisa diubah menjadi JSON:
  // halaman dashboard gagal dirender saat dijalankan. Jadi nominal diubah ke
  // angka biasa di sini, sebelum menyeberang.
  const siapkanPesanan = (b: (typeof myBookings)[number]) => ({
    id: b.id,
    status: b.status,
    // Diserialisasi eksplisit: `Date` menyeberang sebagai string, dan kartu
    // pesanan memang membacanya lewat `new Date(...)`.
    expiresAt: b.expiresAt === null ? null : b.expiresAt.toISOString(),
    totalPrice: uangUntukClient(b.totalPrice),
    dpAmount: b.dpAmount === null ? null : uangUntukClient(b.dpAmount),
    designOption: b.designOption,
    designFileUrl: b.designFileUrl,
    designStatus: b.designStatus,
    designRejectionReason: b.designRejectionReason,
    refundProof: b.refundProof,
    billboard: b.billboard,
    // Tombol bayar hanya boleh tampil bila memang ada tagihan yang masih dapat
    // dibayar. Status `PENDING_PAYMENT` saja tidak cukup: tagihannya bisa sudah
    // ditutup sebagai EXPIRED oleh alur sesi pembayaran.
    adaTagihanPending: b.payments.length > 0,
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

  // Hanya nama dan email yang ditampilkan kartu profil. Objek sesi NextAuth
  // memuat lebih dari itu (id, role, dan apa pun yang ditambahkan callback di
  // kemudian hari); tidak ada alasan semuanya menyeberang ke browser.
  return (
    <DashboardClientPage
        session={{
          user: {
            name: session.user?.name ?? null,
            email: session.user?.email ?? null,
          },
        }}
        activeOrders={activeOrders}
        historyOrders={historyOrders}
        totalSpent={totalSpent}
    />
  );
}