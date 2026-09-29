// src/app/admin/(dashboard)/users/page.tsx
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jumlah, kurang, lebihBesar, uangUntukClient } from '@/lib/money';
import UserClientPage from './UserClientPage';
import { bacaHalaman, hitungPaginasi, PER_HALAMAN, urlHalaman } from '@/lib/paginasi';
import NavigasiHalaman from '@/components/admin/NavigasiHalaman';
import { redirect } from 'next/navigation';

// Sejak Next 16, `searchParams` adalah sebuah Promise dan harus di-`await`
// dulu. Sebelumnya `searchParams?.halaman` dibaca langsung dari objek Promise
// dan selalu `undefined`, jadi paginasi di bawah tidak pernah berlaku: tombol
// "Berikutnya" mengubah URL tapi daftar tetap menampilkan halaman 1.
export default async function ManageUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ halaman?: string }>;
}) {
  const paramsQuery = await searchParams;
  // Tanpa `take`, halaman ini mengambil SELURUH pengguna beserta SELURUH
  // pesanan masing-masing setiap kali dibuka, lalu menanamkan semuanya ke
  // dalam HTML. Dengan 30 pelanggan itu tidak terasa; dengan 5.000 pelanggan
  // yang punya riwayat panjang, halaman ini yang paling lambat dibuka
  // sekaligus paling sering dipakai admin.
  const halamanDiminta = bacaHalaman(paramsQuery?.halaman);

  // Sebelumnya query ini memakai `include: { bookings: true }` tanpa `select`,
  // sehingga SELURUH kolom User ikut terkirim ke komponen client — termasuk
  // `password` (hash bcrypt). Data props komponen client tertanam di HTML
  // halaman, jadi siapa pun yang membuka devtools bisa memanen hash password
  // seluruh pengguna sekaligus. Sekarang kolomnya dipilih eksplisit.
  const [users, totalPengguna] = await prisma.$transaction([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        authProvider: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (halamanDiminta - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    prisma.user.count(),
  ]);

  const paginasi = hitungPaginasi(halamanDiminta, totalPengguna);

  // Nomor di luar jangkauan dialihkan ke halaman terakhir. Tanpa ini,
  // `?halaman=999` merender daftar kosong dengan tulisan "Halaman 999 dari 2"
  // dan hanya tombol "Sebelumnya" — yang membawa ke 998, juga kosong.
  if (paginasi.terlaluJauh) {
    redirect(urlHalaman('/admin/users', paginasi.totalHalaman));
  }

  const { halaman, totalHalaman } = paginasi;
  const idHalamanIni = users.map((u) => u.id);

  // "Total Spending" dulu dihitung di browser: SELURUH baris booking milik
  // tiap pengguna dikirim ke client hanya untuk dijumlahkan di sana, lalu
  // dibuang. Yang dipakai layar hanya dua angka per baris. Jadi penjumlahannya
  // dipindahkan ke sisi server, dan yang menyeberang ke browser tinggal
  // hasilnya.
  //
  // SUMBER ANGKANYA KINI LEDGER PEMBAYARAN, BUKAN STATUS PESANAN.
  //
  // Rumus sebelumnya menjumlahkan `Booking.totalPrice` atas pesanan berstatus
  // pendapatan. Itu nilai KONTRAK, bukan uang: pelanggan DP yang baru menyetor
  // 40% tercatat sudah membelanjakan 100%, dan pesanan yang ditandai
  // `PAID_CONFIRMED` tanpa satu rupiah pun masuk tetap dihitung penuh.
  //
  // Tiga query terpisah dengan sengaja:
  //   - `_count` dihitung atas SEMUA pesanan (kolom "Riwayat Order" memang
  //     berarti berapa kali orang ini pernah memesan, termasuk yang batal).
  //   - Penerimaan diambil dari `Payment PAID`, termasuk `TAMBAHAN` — pelanggan
  //     memang membayarnya.
  //   - Refund yang sudah selesai ditransfer dikurangkan.
  //
  // Prisma tidak bisa `groupBy` melewati relasi, jadi penerimaan diambil baris
  // per baris lalu dilipat di sini. Aman karena hanya 25 pengguna per halaman.
  //
  // Sengaja `Promise.all`, bukan `$transaction([...])`: tipe hasil `groupBy`
  // luruh menjadi bentuk umum begitu ia masuk ke dalam array transaksi, dan
  // `_sum`/`_count` jadi tidak terbaca TypeScript. Ketiganya hanya membaca,
  // jadi tidak ada yang perlu dijamin atomik di sini.
  const [jumlahOrderPerUser, penerimaan, refundPerUser] =
    idHalamanIni.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.booking.groupBy({
            by: ['userId'],
            where: { userId: { in: idHalamanIni } },
            _count: { _all: true },
          }),
          prisma.payment.findMany({
            where: {
              status: PaymentStatus.PAID,
              booking: { userId: { in: idHalamanIni } },
            },
            select: { jumlah: true, booking: { select: { userId: true } } },
          }),
          prisma.booking.groupBy({
            by: ['userId'],
            where: { userId: { in: idHalamanIni }, status: BookingStatus.REFUNDED },
            _sum: { refundAmount: true },
          }),
        ]);

  const petaJumlahOrder = new Map(jumlahOrderPerUser.map((b) => [b.userId, b._count._all]));

  // Dilipat sebagai Decimal, bukan number. Nominal digabung dulu sampai
  // selesai, baru diubah menjadi angka biasa tepat sebelum menyeberang ke
  // browser — menjumlahkan `number` di tengah jalan membuang jaminan presisi
  // yang justru dijaga `src/lib/money.ts`.
  const petaPenerimaan = new Map<string, Prisma.Decimal>();
  for (const p of penerimaan) {
    const userId = p.booking.userId;
    petaPenerimaan.set(userId, jumlah(petaPenerimaan.get(userId), p.jumlah));
  }

  const petaRefund = new Map(refundPerUser.map((b) => [b.userId, b._sum.refundAmount]));

  const usersUntukClient = users.map((user) => {
    // Pengguna tanpa pesanan sama sekali tidak muncul di hasil query, jadi
    // bukan "hilang" melainkan nol.
    const selisih = kurang(petaPenerimaan.get(user.id), petaRefund.get(user.id));

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      jumlahOrder: petaJumlahOrder.get(user.id) ?? 0,
      // Ditahan di nol: refund tidak boleh membuat belanja pelanggan terlihat
      // negatif, dan angka negatif di kolom ini lebih membingungkan daripada
      // informatif.
      totalSpent: uangUntukClient(lebihBesar(selisih, 0) ? selisih : 0),
    };
  });

  return (
    <div className="space-y-6">
      <UserClientPage users={usersUntukClient} />

      <NavigasiHalaman
        basis="/admin/users"
        halaman={halaman}
        totalHalaman={totalHalaman}
        total={totalPengguna}
        satuan="pengguna"
      />
    </div>
  );
}
