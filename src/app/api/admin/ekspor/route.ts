// src/app/api/admin/ekspor/route.ts
//
// Unduhan CSV keempat daftar admin.
//
// SATU ROUTE, BUKAN EMPAT
// -----------------------
// Empat route terpisah akan menyalin empat kali hal yang sama: gerbang sesi,
// pembacaan `q`/`urut`/`status`, batas baris, dan penyusunan header unduhan.
// Yang disalin empat kali akan menyimpang di satu tempat, dan yang menyimpang di
// sini adalah gerbang peran — cacat yang tidak terlihat sampai orang yang salah
// mengunduh berkas yang salah.
//
// Sebagai gantinya ada SATU tabel `EKSPOR`, bertipe `Record<DaftarEkspor, …>`.
// Bentuk itu dipilih dengan sengaja: menambahkan daftar kelima tanpa menyebutkan
// peran yang boleh mengunduhnya adalah galat kompilasi, bukan lubang yang diam.
// Idiom yang sama dipakai `STATUS_TAB_PESANAN` di `@/lib/saringan-daftar`.
//
// GERBANGNYA LEBIH SEMPIT DARIPADA HALAMANNYA
// -------------------------------------------
// `admin/(dashboard)/layout.tsx` meloloskan ADMIN, SUPER_ADMIN, CS, dan OPERATOR
// ke seluruh panel. Itu keputusan yang wajar untuk MEMBACA satu layar sekali
// duduk — 25 baris, di dalam aplikasi, tanpa jejak yang bisa dibawa pulang.
//
// Unduhan bukan hal yang sama. Satu klik menghasilkan berkas berisi seluruh
// pelanggan beserta email dan nomor WhatsApp-nya, di laptop yang keluar dari
// kantor, di luar kendali aplikasi ini selamanya. Jadi gerbangnya diputuskan
// ulang per daftar, bukan diwarisi dari pintu panel:
//
//   - `users`     → PERAN_PENGELOLA (ADMIN, SUPER_ADMIN). Basis data pelanggan.
//   - `orders`    → PERAN_PEMBACA_PESANAN (tanpa CS). Sama dengan gerbang detail
//                   pesanan di `api/admin/orders/detail`: barisnya memuat nilai
//                   transaksi dan data perusahaan pembeli.
//   - `billboards`→ PERAN_PEMBACA_PANEL. Inventori milik sendiri, bukan data
//                   orang: harga dan status titik memang dibaca operator lapangan.
//   - `pengajuan` → PERAN_PENGELOLA. Isinya nomor telepon dan alamat pemilik
//                   lahan yang menyerahkannya untuk dihubungi tim, bukan untuk
//                   dibawa keluar dalam satu berkas.
//
// BARISNYA WAJIB SAMA DENGAN LAYAR
// --------------------------------
// `where` dan `orderBy` diambil dari `@/lib/saringan-daftar` — modul yang sama
// yang dipanggil keempat `page.tsx`. Bukan salinannya. Bila route ini menyusun
// klausanya sendiri, hasilnya bukan galat melainkan berkas yang TERBUKA dengan
// sempurna dan memuat himpunan baris yang berbeda dari layar, dipakai untuk
// rekonsiliasi, tanpa satu pun tanda bahwa isinya bukan yang diminta.
//
// UANG DIEKSPOR SEBAGAI ANGKA MENTAH, BUKAN "Rp 15.000.000"
// ---------------------------------------------------------
// `angkaRupiah()` menyisipkan titik sebagai pemisah ribuan. Di spreadsheet,
// `15.000.000` terbaca sebagai TEKS — dan kolom teks tidak bisa dijumlahkan,
// yang justru satu-satunya alasan berkas ini diminta. Jadi nominalnya lewat
// `keAngka()`: `15000000`. Pemformatan adalah pekerjaan spreadsheet, bukan
// pekerjaan berkas.
//
// BATAS BARIS
// -----------
// `BATAS_BARIS_EKSPOR` menahan satu klik dari menarik tabel tanpa batas ke dalam
// memori proses ini. Bila terpotong, barisnya TIDAK dipotong diam-diam: header
// `X-Ekspor-Terpotong` ikut dikirim dan satu baris penutup ditulis di dalam
// berkasnya, karena admin yang merekonsiliasi berkas terpotong tanpa tahu akan
// menyimpulkan selisihnya ada di pembukuan.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma, Role } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  peranBoleh,
  PERAN_PEMBACA_PANEL,
  PERAN_PEMBACA_PESANAN,
  PERAN_PENGELOLA,
} from '@/lib/gerbang-peran';
import { headerCsv, keCsv, namaBerkasCsv } from '@/lib/csv';
import { bacaKataKunci, bacaPilihan } from '@/lib/kueri-daftar';
import {
  KUNCI_URUT_BILLBOARD,
  KUNCI_URUT_USER,
  TAB_PESANAN,
  URUT_BILLBOARD,
  URUT_USER,
  whereBillboard,
  whereBooking,
  wherePengajuan,
  whereUser,
} from '@/lib/saringan-daftar';
import { jumlah, keAngka, kurang, lebihBesar } from '@/lib/money';
import { sisaTagihan, sisaTambahan, uangMasuk } from '@/lib/pembayaran';
import { kunciTanggal, kunciTanggalJam } from '@/lib/tanggal';
import { labelPesanan } from '@/lib/nomor-pesanan';
import { nilaiEnumSah } from '@/lib/enum-guard';
import { PaymentStatus, PaymentTujuan, StatusPengajuanTitik, BookingStatus } from '@prisma/client';

/**
 * Batas baris satu unduhan.
 *
 * 5.000 dipilih karena ia jauh di atas jumlah baris yang punya arti bagi manusia
 * yang membuka spreadsheet, dan jauh di bawah jumlah yang membuat proses ini
 * menahan seluruh tabel beserta relasinya di memori. Tanpa batas, satu klik pada
 * tabel yang sudah berjalan tiga tahun adalah permintaan yang tidak pernah
 * selesai — dan tidak ada satu pun pesan yang menjelaskan kenapa.
 */
export const BATAS_BARIS_EKSPOR = 5000;

/** Nama daftar yang bisa diekspor, sebagaimana tertulis di `?daftar=`. */
const DAFTAR_EKSPOR = ['billboards', 'orders', 'users', 'pengajuan'] as const;

type DaftarEkspor = (typeof DAFTAR_EKSPOR)[number];

/** Isi satu berkas: judul kolom, barisnya, dan apakah terpotong batas. */
type HasilEkspor = {
  header: readonly string[];
  baris: readonly (readonly unknown[])[];
  terpotong: boolean;
};

type KonfigEkspor = {
  /** Peran yang boleh MENGUNDUH daftar ini — bukan yang boleh membacanya. */
  peran: readonly Role[];
  /** Awalan nama berkas; tanggalnya ditambahkan `namaBerkasCsv`. */
  awalan: string;
  ambil: (params: URLSearchParams) => Promise<HasilEkspor>;
};

/**
 * Apakah jumlah baris yang terambil menyentuh batas.
 *
 * Diambil dengan `take: BATAS + 1` lalu dipotong, bukan dengan `count` terpisah:
 * `count` kedua adalah query tambahan atas tabel yang sama yang bisa menjawab
 * angka berbeda dari `findMany` di sebelahnya, dan yang dibutuhkan di sini hanya
 * satu bit — "masih ada lagi atau tidak".
 */
function potong<T>(baris: T[]): { baris: T[]; terpotong: boolean } {
  return baris.length > BATAS_BARIS_EKSPOR
    ? { baris: baris.slice(0, BATAS_BARIS_EKSPOR), terpotong: true }
    : { baris, terpotong: false };
}

const EKSPOR: Record<DaftarEkspor, KonfigEkspor> = {
  // ---------------------------------------------------------------- billboards
  billboards: {
    peran: PERAN_PEMBACA_PANEL,
    awalan: 'billboard',
    async ambil(params) {
      const kataKunci = bacaKataKunci(params.get('q'));
      const urut = bacaPilihan(params.get('urut'), KUNCI_URUT_BILLBOARD, 'terbaru');

      const mentah = await prisma.billboard.findMany({
        where: whereBillboard(kataKunci),
        orderBy: URUT_BILLBOARD[urut],
        // Kolom dipilih eksplisit, dan `gallery`/`specs`/`includes`/`excludes`
        // sengaja TIDAK ikut: keempatnya `Json`, dan satu sel berisi JSON
        // beberapa kilobita membuat berkasnya tidak bisa dibaca manusia maupun
        // dijumlahkan spreadsheet. Yang membutuhkannya membuka halaman titiknya.
        select: {
          sku: true,
          title: true,
          address: true,
          type: true,
          status: true,
          publishStatus: true,
          price: true,
          lat: true,
          lng: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
          updatedBy: { select: { name: true } },
        },
        take: BATAS_BARIS_EKSPOR + 1,
      });

      const { baris, terpotong } = potong(mentah);

      return {
        header: [
          'SKU',
          'Judul',
          'Alamat',
          'Tipe',
          'Status',
          'Publikasi',
          'Harga',
          'Lat',
          'Lng',
          'Slug',
          'Dibuat',
          'Diubah',
          'Diubah oleh',
        ],
        baris: baris.map((b) => [
          b.sku,
          b.title,
          b.address,
          b.type,
          b.status,
          b.publishStatus,
          keAngka(b.price),
          b.lat,
          b.lng,
          b.slug,
          kunciTanggalJam(b.createdAt),
          kunciTanggalJam(b.updatedAt),
          b.updatedBy?.name ?? '',
        ]),
        terpotong,
      };
    },
  },

  // -------------------------------------------------------------------- orders
  orders: {
    peran: PERAN_PEMBACA_PESANAN,
    awalan: 'pesanan',
    async ambil(params) {
      const kataKunci = bacaKataKunci(params.get('q'));
      const tab = bacaPilihan(params.get('status'), TAB_PESANAN, 'ALL');

      const mentah = await prisma.booking.findMany({
        where: whereBooking(tab, kataKunci),
        // Urutan yang SAMA dengan layar. Halaman pesanan tidak punya pilihan
        // urut, jadi urutannya tetap — tapi ia ditulis di sini juga, karena
        // ekspor yang barisnya benar dengan urutan berbeda tetap salah: yang
        // dibandingkan admin antara berkas dan layar adalah baris ke-n.
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          duration: true,
          totalPrice: true,
          createdAt: true,
          paidAt: true,
          // `refundProof`, `userBankName`, dan `userBankAccount` sengaja TIDAK
          // ikut. Nomor rekening pembeli adalah satu-satunya kolom di tabel ini
          // yang cukup untuk memulai penipuan atas nama perusahaan, dan berkas
          // berisi ratusan nomor rekening pelanggan bukan hal yang sama dengan
          // satu nomor yang dibuka admin saat memproses satu refund. `refundAmount`
          // ikut karena itu angka pembukuan, bukan identitas rekening.
          refundAmount: true,
          billboard: { select: { sku: true, title: true } },
          user: { select: { name: true, email: true, whatsapp: true, companyName: true } },
          additionalCharges: { select: { amount: true } },
          payments: { select: { tujuan: true, status: true, jumlah: true } },
        },
        take: BATAS_BARIS_EKSPOR + 1,
      });

      const { baris, terpotong } = potong(mentah);

      return {
        header: [
          'Nomor',
          'Status',
          'SKU titik',
          'Titik',
          'Penyewa',
          'Email',
          'WhatsApp',
          'Perusahaan',
          'Mulai',
          'Selesai',
          'Durasi (bulan)',
          'Nilai pesanan',
          'Pokok masuk',
          'Sisa pokok',
          'Biaya tambahan',
          'Tambahan dibayar',
          'Sisa tambahan',
          'Grand total',
          'Refund',
          'Dibuat',
          'Dibayar',
        ],
        baris: baris.map((b) => {
          // Seluruh hitungan uang lewat `@/lib/pembayaran` dan `@/lib/money`,
          // sama seperti layarnya. Menjumlahkan `number` di sini akan membuang
          // presisi yang dijaga `Prisma.Decimal` — dan angka inilah yang
          // dijumlahkan ulang admin di spreadsheet untuk dibandingkan dengan
          // rekening koran.
          const pokokMasuk = uangMasuk(b.payments);
          const totalTambahan = jumlah(...b.additionalCharges.map((c) => c.amount));
          const tambahanDibayar = jumlah(
            ...b.payments
              .filter(
                (p) => p.status === PaymentStatus.PAID && p.tujuan === PaymentTujuan.TAMBAHAN
              )
              .map((p) => p.jumlah)
          );

          return [
            labelPesanan(b.id),
            b.status,
            b.billboard.sku,
            b.billboard.title,
            b.user.name,
            b.user.email,
            b.user.whatsapp,
            b.user.companyName,
            kunciTanggal(b.startDate),
            kunciTanggal(b.endDate),
            b.duration,
            keAngka(b.totalPrice),
            keAngka(pokokMasuk),
            keAngka(sisaTagihan(b.totalPrice, b.payments)),
            keAngka(totalTambahan),
            keAngka(tambahanDibayar),
            keAngka(sisaTambahan(b.additionalCharges, b.payments)),
            keAngka(jumlah(b.totalPrice, totalTambahan)),
            b.refundAmount === null ? '' : keAngka(b.refundAmount),
            kunciTanggalJam(b.createdAt),
            b.paidAt === null ? '' : kunciTanggalJam(b.paidAt),
          ];
        }),
        terpotong,
      };
    },
  },

  // --------------------------------------------------------------------- users
  users: {
    peran: PERAN_PENGELOLA,
    awalan: 'pengguna',
    async ambil(params) {
      const kataKunci = bacaKataKunci(params.get('q'));
      const urut = bacaPilihan(params.get('urut'), KUNCI_URUT_USER, 'terbaru');

      const mentah = await prisma.user.findMany({
        where: whereUser(kataKunci),
        orderBy: URUT_USER[urut],
        // `password`, `ktp`, `npwp`, `ktpAddress`, `officeAddress`, dan
        // `xenditCustomerId` TIDAK ikut, dan tidak satu pun karena kelalaian:
        //
        //  - `password` adalah hash bcrypt. Berkas berisi seluruhnya adalah
        //    bahan serangan luring yang tidak punya alasan pernah meninggalkan
        //    database.
        //  - `ktp`/`npwp` nomor identitas resmi. Keduanya boleh dilihat pada satu
        //    profil yang sudah dibuka untuk keperluan tertentu; satu berkas yang
        //    memuat semuanya adalah hal yang berbeda secara jenis, bukan derajat.
        //  - `xenditCustomerId` kaitan ke gerbang pembayaran, tidak punya arti di
        //    luar sistem ini.
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          whatsapp: true,
          companyName: true,
          authProvider: true,
          isVerified: true,
          createdAt: true,
        },
        take: BATAS_BARIS_EKSPOR + 1,
      });

      const { baris, terpotong } = potong(mentah);
      const id = baris.map((u) => u.id);

      // Dua angka yang dirender layar — "Riwayat Order" dan "Total Spending" —
      // dihitung dengan cara yang SAMA seperti di `users/page.tsx`: jumlah order
      // atas seluruh pesanan, dan belanja dari ledger `Payment PAID` dikurangi
      // refund yang sudah ditransfer. Menghitungnya dengan rumus lain di sini
      // menghasilkan berkas yang angkanya berbeda dari layar pada baris yang
      // sama, dan itu selisih yang akan dicari admin di pembukuan.
      const [jumlahOrder, penerimaan, refund] =
        id.length === 0
          ? [[], [], []]
          : await Promise.all([
              prisma.booking.groupBy({
                by: ['userId'],
                where: { userId: { in: id } },
                _count: { _all: true },
              }),
              prisma.payment.findMany({
                where: { status: PaymentStatus.PAID, booking: { userId: { in: id } } },
                select: { jumlah: true, booking: { select: { userId: true } } },
              }),
              prisma.booking.groupBy({
                by: ['userId'],
                where: { userId: { in: id }, status: BookingStatus.REFUNDED },
                _sum: { refundAmount: true },
              }),
            ]);

      const petaOrder = new Map(jumlahOrder.map((b) => [b.userId, b._count._all]));
      const petaMasuk = new Map<string, Prisma.Decimal>();
      for (const p of penerimaan) {
        petaMasuk.set(p.booking.userId, jumlah(petaMasuk.get(p.booking.userId), p.jumlah));
      }
      const petaRefund = new Map(refund.map((b) => [b.userId, b._sum.refundAmount]));

      return {
        header: [
          'Nama',
          'Email',
          'Peran',
          'WhatsApp',
          'Perusahaan',
          'Masuk lewat',
          'Terverifikasi',
          'Jumlah order',
          'Total belanja',
          'Terdaftar',
        ],
        baris: baris.map((u) => {
          const selisih = kurang(petaMasuk.get(u.id), petaRefund.get(u.id));

          return [
            u.name,
            u.email,
            u.role,
            u.whatsapp,
            u.companyName,
            u.authProvider,
            u.isVerified ? 'ya' : 'tidak',
            petaOrder.get(u.id) ?? 0,
            // Ditahan di nol, sama seperti layarnya: refund tidak boleh membuat
            // belanja pelanggan terlihat negatif.
            keAngka(lebihBesar(selisih, 0) ? selisih : 0),
            kunciTanggalJam(u.createdAt),
          ];
        }),
        terpotong,
      };
    },
  },

  // ----------------------------------------------------------------- pengajuan
  pengajuan: {
    peran: PERAN_PENGELOLA,
    awalan: 'pengajuan-titik',
    async ambil(params) {
      const kataKunci = bacaKataKunci(params.get('q'));
      // Sama seperti halamannya: nilai dari URL diperiksa terhadap enum, dan
      // nilai asing jatuh ke `SEMUA` secara eksplisit.
      const statusParam = params.get('status');
      const statusAktif = nilaiEnumSah(StatusPengajuanTitik, statusParam)
        ? statusParam
        : 'SEMUA';

      const mentah = await prisma.pengajuanTitik.findMany({
        where: wherePengajuan(statusAktif, kataKunci),
        orderBy: { createdAt: 'desc' },
        select: {
          namaPemilik: true,
          nomorWa: true,
          email: true,
          kota: true,
          alamat: true,
          ukuran: true,
          catatan: true,
          status: true,
          catatanAdmin: true,
          createdAt: true,
          ditanganiOleh: { select: { name: true } },
        },
        take: BATAS_BARIS_EKSPOR + 1,
      });

      const { baris, terpotong } = potong(mentah);

      return {
        header: [
          'Nama pemilik',
          'WhatsApp',
          'Email',
          'Kota',
          'Alamat',
          'Ukuran',
          'Catatan pengaju',
          'Status',
          'Catatan admin',
          'Ditangani oleh',
          'Masuk',
        ],
        baris: baris.map((p) => [
          p.namaPemilik,
          p.nomorWa,
          p.email,
          p.kota,
          p.alamat,
          p.ukuran,
          p.catatan,
          p.status,
          p.catatanAdmin,
          p.ditanganiOleh?.name ?? '',
          kunciTanggalJam(p.createdAt),
        ]),
        terpotong,
      };
    },
  },
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  // Sesi diperiksa lebih dulu, SEBELUM nama daftar dibaca. Urutan sebaliknya
  // menjawab 400 "daftar tidak dikenal" kepada orang yang belum masuk — yaitu
  // memberi tahu nama daftar mana yang ada kepada pihak yang belum berhak
  // mengetahui bahwa route ini pun ada.
  if (!session?.user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const nama = params.get('daftar');

  // `bacaPilihan` tidak dipakai di sini, dan itu disengaja: nilai bakunya akan
  // mengekspor `billboards` kepada siapa pun yang salah menulis nama daftar.
  // Permintaan yang tidak menyebut daftar yang ada harus ditolak, bukan dijawab
  // dengan berkas yang tidak diminta.
  const daftar = DAFTAR_EKSPOR.find((d) => d === nama);
  if (daftar === undefined) {
    return NextResponse.json(
      { message: `Parameter daftar wajib salah satu dari: ${DAFTAR_EKSPOR.join(', ')}` },
      { status: 400 }
    );
  }

  const konfig = EKSPOR[daftar];

  if (!peranBoleh(konfig.peran, session.user.role)) {
    // 403, bukan 401: yang memanggil sudah terbukti masuk, dan 401 akan membuat
    // klien menyimpulkan sesinya kedaluwarsa lalu menyuruh orangnya masuk ulang
    // untuk mendapat jawaban yang sama.
    return NextResponse.json({ message: 'Akses ditolak' }, { status: 403 });
  }

  const { header, baris, terpotong } = await konfig.ambil(params);

  const isi = terpotong
    ? // Penanda terpotong ditulis DI DALAM berkas, bukan hanya sebagai header
      // HTTP. Header tidak ikut saat berkasnya disimpan, dikirim lewat surel,
      // atau dibuka bulan depan — dan yang membaca berkas terpotong tanpa tahu
      // akan mencari selisihnya di pembukuan.
      keCsv([
        header,
        ...baris,
        [
          `Terpotong pada ${BATAS_BARIS_EKSPOR} baris pertama. Persempit pencarian atau saringan untuk mengunduh sisanya.`,
        ],
      ])
    : keCsv([header, ...baris]);

  const namaBerkas = namaBerkasCsv(konfig.awalan);

  return new NextResponse(isi, {
    headers: {
      ...headerCsv(namaBerkas),
      ...(terpotong ? { 'X-Ekspor-Terpotong': String(BATAS_BARIS_EKSPOR) } : {}),
    },
  });
}
