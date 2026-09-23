// src/app/admin/(dashboard)/users/page.tsx
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { keAngka } from '@/lib/money';
import { STATUS_PENDAPATAN } from '@/lib/revenue';
import UserClientPage from './UserClientPage';

const PER_HALAMAN = 25;

export default async function ManageUsersPage({
  searchParams,
}: {
  searchParams?: { halaman?: string };
}) {
  // Tanpa `take`, halaman ini mengambil SELURUH pengguna beserta SELURUH
  // pesanan masing-masing setiap kali dibuka, lalu menanamkan semuanya ke
  // dalam HTML. Dengan 30 pelanggan itu tidak terasa; dengan 5.000 pelanggan
  // yang punya riwayat panjang, halaman ini yang paling lambat dibuka
  // sekaligus paling sering dipakai admin.
  const halamanMentah = Number(searchParams?.halaman);
  const halaman =
    Number.isFinite(halamanMentah) && halamanMentah >= 1 ? Math.floor(halamanMentah) : 1;

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
      skip: (halaman - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    prisma.user.count(),
  ]);

  const totalHalaman = Math.max(1, Math.ceil(totalPengguna / PER_HALAMAN));
  const idHalamanIni = users.map((u) => u.id);

  // "Total Spending" dulu dihitung di browser: SELURUH baris booking milik
  // tiap pengguna dikirim ke client hanya untuk dijumlahkan di sana, lalu
  // dibuang. Yang dipakai layar hanya dua angka per baris. Jadi penjumlahannya
  // dipindahkan ke database, yang memang dirancang untuk itu, dan yang
  // menyeberang ke browser tinggal hasilnya.
  //
  // Dua agregat terpisah dengan sengaja:
  //   - `_count` dihitung atas SEMUA pesanan (kolom "Riwayat Order" memang
  //     berarti berapa kali orang ini pernah memesan, termasuk yang batal).
  //   - `_sum` hanya atas status pendapatan — uang yang sudah masuk dan belum
  //     dikembalikan. Daftarnya satu dengan kartu omzet admin lewat
  //     `STATUS_PENDAPATAN`, supaya dua halaman tidak bisa berbeda angkanya.
  //
  // Sengaja `Promise.all`, bukan `$transaction([...])`: tipe hasil `groupBy`
  // luruh menjadi bentuk umum begitu ia masuk ke dalam array transaksi, dan
  // `_sum`/`_count` jadi tidak terbaca TypeScript. Keduanya hanya membaca,
  // jadi tidak ada yang perlu dijamin atomik di sini.
  const [jumlahOrderPerUser, belanjaPerUser] =
    idHalamanIni.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.booking.groupBy({
            by: ['userId'],
            where: { userId: { in: idHalamanIni } },
            _count: { _all: true },
          }),
          prisma.booking.groupBy({
            by: ['userId'],
            where: { userId: { in: idHalamanIni }, status: { in: [...STATUS_PENDAPATAN] } },
            _sum: { totalPrice: true },
          }),
        ]);

  const petaJumlahOrder = new Map(jumlahOrderPerUser.map((b) => [b.userId, b._count._all]));
  // `_sum.totalPrice` bertipe Decimal — objek, bukan angka, dan tidak bisa
  // diubah menjadi JSON. Dilewatkan apa adanya ke komponen client, halaman ini
  // mati saat dijalankan. `keAngka` menutup itu di sini, sebelum menyeberang.
  const petaBelanja = new Map(
    belanjaPerUser.map((b) => [b.userId, b._sum.totalPrice === null ? 0 : keAngka(b._sum.totalPrice)])
  );

  const usersUntukClient = users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
    // Pengguna tanpa pesanan sama sekali tidak muncul di hasil groupBy, jadi
    // bukan "hilang" melainkan nol.
    jumlahOrder: petaJumlahOrder.get(user.id) ?? 0,
    totalSpent: petaBelanja.get(user.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <UserClientPage users={usersUntukClient} />

      {totalHalaman > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Halaman {halaman} dari {totalHalaman} · {totalPengguna} pengguna
          </span>
          <div className="flex gap-2">
            {halaman > 1 && (
              <Link
                href={`/admin/users?halaman=${halaman - 1}`}
                className="rounded border border-gray-200 bg-white px-3 py-1.5 font-bold text-gray-600 transition hover:bg-gray-50"
              >
                Sebelumnya
              </Link>
            )}
            {halaman < totalHalaman && (
              <Link
                href={`/admin/users?halaman=${halaman + 1}`}
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
