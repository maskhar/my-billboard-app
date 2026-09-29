// src/app/admin/(dashboard)/users/page.tsx
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { jumlah, kurang, lebihBesar, uangUntukClient } from '@/lib/money';
import UserClientPage from './UserClientPage';
import { bacaHalaman, hitungPaginasi, PER_HALAMAN, urlHalaman } from '@/lib/paginasi';
import { bacaKataKunci, bacaPilihan } from '@/lib/kueri-daftar';
import NavigasiHalaman from '@/components/admin/NavigasiHalaman';
import { redirect } from 'next/navigation';

/**
 * Urutan yang boleh diminta URL, beserta `orderBy` Prisma-nya.
 *
 * Daftarnya tertutup karena `orderBy` yang dirangkai dari teks URL berarti nama
 * kolom apa pun bisa diminta pengunjung — dan tabel ini punya kolom `password`,
 * `ktp`, dan `npwp`. Tidak satu pun dari ketiganya dirender, tapi
 * `?urut=password` yang lolos ke Prisma akan MENGURUTKAN barisnya menurut hash
 * password, dan urutan baris adalah informasi: ia membocorkan perbandingan antar
 * nilai kolom yang tidak pernah boleh terbaca siapa pun.
 *
 * Jadi peta ini bukan kenyamanan tipe, ia gerbang. Nama kunci di URL juga
 * sengaja tidak sama dengan nama kolomnya, supaya skema tabel tidak ikut
 * tertulis di bilah alamat.
 */
const URUT: Record<string, Prisma.UserOrderByWithRelationInput> = {
  // `terbaru` bakunya: pendaftar baru adalah yang paling sering dicari admin.
  terbaru: { createdAt: 'desc' },
  terlama: { createdAt: 'asc' },
  'nama-naik': { name: 'asc' },
  'nama-turun': { name: 'desc' },
  'peran-naik': { role: 'asc' },
  'peran-turun': { role: 'desc' },
  // Mengurutkan menurut jumlah relasi, bukan kolom. Ini satu-satunya kunci yang
  // tidak bisa ditiru di sisi client: `jumlahOrder` dihitung lewat `groupBy`
  // TERPISAH atas 25 baris halaman ini, jadi mengurutkannya di browser hanya
  // akan mengurutkan 25 baris itu — dan halaman 1 "menurut order terbanyak"
  // tidak akan memuat pelanggan tersibuk yang kebetulan mendaftar tahun lalu.
  'order-banyak': { bookings: { _count: 'desc' } },
  'order-sedikit': { bookings: { _count: 'asc' } },
};

const KUNCI_URUT = Object.keys(URUT) as [string, ...string[]];

// Sejak Next 16, `searchParams` adalah sebuah Promise dan harus di-`await`
// dulu. Sebelumnya `searchParams?.halaman` dibaca langsung dari objek Promise
// dan selalu `undefined`, jadi paginasi di bawah tidak pernah berlaku: tombol
// "Berikutnya" mengubah URL tapi daftar tetap menampilkan halaman 1.
export default async function ManageUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ halaman?: string; urut?: string; q?: string }>;
}) {
  const paramsQuery = await searchParams;
  // Tanpa `take`, halaman ini mengambil SELURUH pengguna beserta SELURUH
  // pesanan masing-masing setiap kali dibuka, lalu menanamkan semuanya ke
  // dalam HTML. Dengan 30 pelanggan itu tidak terasa; dengan 5.000 pelanggan
  // yang punya riwayat panjang, halaman ini yang paling lambat dibuka
  // sekaligus paling sering dipakai admin.
  const halamanDiminta = bacaHalaman(paramsQuery?.halaman);
  const urutAktif = bacaPilihan(paramsQuery?.urut, KUNCI_URUT, 'terbaru');
  const kataKunci = bacaKataKunci(paramsQuery?.q);

  // Pencarian pengguna DI DATABASE. Halaman ini tidak pernah punya kotak cari:
  // satu-satunya cara menemukan satu pelanggan yang menelepon adalah menebak
  // halaman berapa ia terdaftar, dan urutan bakunya adalah tanggal daftar —
  // yaitu urutan yang tidak diketahui siapa pun yang sedang menelepon.
  //
  // Empat kolom dicari, dan `whatsapp` yang paling penting dari keempatnya:
  // pelanggan menelepon, layar admin menampilkan nomornya, dan itulah satu-satunya
  // pengenal yang admin punya sebelum ia tahu nama atau emailnya.
  //
  // Kata kuncinya TIDAK dinormalkan ke bentuk `628…` dulu: kolomnya memang
  // menyimpan bentuk itu, tapi `contains` dipakai untuk potongan tengah nomor —
  // mengubah `0812` menjadi `62812` justru membuat potongan yang diketik admin
  // tidak lagi cocok dengan apa pun.
  //
  // `password`, `ktp`, dan `npwp` TIDAK ikut dicari. Membuat hash password bisa
  // dicari berarti membuatnya bisa dites lewat URL, dan nomor KTP/NPWP adalah
  // data yang boleh dilihat pada satu profil yang sudah dibuka — bukan dijadikan
  // kunci untuk menemukan orangnya.
  const where: Prisma.UserWhereInput =
    kataKunci === ''
      ? {}
      : {
          OR: [
            { name: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } },
            { whatsapp: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } },
            { companyName: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } },
          ],
        };

  // Sebelumnya query ini memakai `include: { bookings: true }` tanpa `select`,
  // sehingga SELURUH kolom User ikut terkirim ke komponen client — termasuk
  // `password` (hash bcrypt). Data props komponen client tertanam di HTML
  // halaman, jadi siapa pun yang membuka devtools bisa memanen hash password
  // seluruh pengguna sekaligus. Sekarang kolomnya dipilih eksplisit.
  const [users, totalPengguna] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        authProvider: true,
        createdAt: true,
      },
      orderBy: URUT[urutAktif],
      skip: (halamanDiminta - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    // `count` memakai `where` yang SAMA. Tanpa itu, headernya menulis jumlah
    // seluruh pengguna sementara tabelnya menampilkan hasil pencarian, dan
    // paginasinya menawarkan halaman-halaman yang tidak punya isi.
    prisma.user.count({ where }),
  ]);

  const paginasi = hitungPaginasi(halamanDiminta, totalPengguna);

  // Urutan dan kata kunci dikumpulkan sekali lalu dipakai pengalihan, navigasi
  // halaman, kepala kolom, dan kotak cari.
  const kueriAktif = {
    urut: urutAktif === 'terbaru' ? undefined : urutAktif,
    q: kataKunci === '' ? undefined : kataKunci,
  };

  // Nomor di luar jangkauan dialihkan ke halaman terakhir. Tanpa ini,
  // `?halaman=999` merender daftar kosong dengan tulisan "Halaman 999 dari 2"
  // dan hanya tombol "Sebelumnya" — yang membawa ke 998, juga kosong.
  //
  // Kata kunci ikut dibawa: jumlah halaman hasil pencarian jauh lebih kecil
  // daripada jumlah halaman seluruh daftar, jadi pengalihan yang membuang `q`
  // akan mendaratkan admin di seluruh pengguna tanpa satu pun tanda bahwa
  // pencariannya batal.
  if (paginasi.terlaluJauh) {
    redirect(urlHalaman('/admin/users', paginasi.totalHalaman, kueriAktif));
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
      <UserClientPage
        users={usersUntukClient}
        urutAktif={urutAktif}
        kataKunci={kataKunci}
        kueriAktif={kueriAktif}
        total={totalPengguna}
      />

      <NavigasiHalaman
        basis="/admin/users"
        halaman={halaman}
        totalHalaman={totalHalaman}
        total={totalPengguna}
        satuan="pengguna"
        parameter={kueriAktif}
      />
    </div>
  );
}
