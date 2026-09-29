// src/app/admin/(dashboard)/calendar/page.tsx
//
// Butir audit 5.23: kalender ketersediaan / timeline booking untuk admin.
//
// APA YANG BELUM ADA SEBELUM HALAMAN INI
// --------------------------------------
// Pertanyaan "titik mana yang kosong bulan depan" hari ini hanya bisa dijawab
// dengan membuka `/admin/billboards`, mencatat mana yang berstatus `Booked`,
// lalu membuka `/admin/orders` dan membaca tanggal satu per satu. Dan
// `Billboard.status` tidak menjawabnya: ia satu bit tanpa tanggal, jadi titik
// yang tersewa sampai pekan depan dan titik yang tersewa sampai tahun depan
// terbaca sama. Penjual yang ditelepon calon pembeli tidak punya layar yang
// bisa dibaca dalam sepuluh detik.
//
// KENAPA PENGGERBANGNYA `PERAN_PEMBACA_PESANAN`, BUKAN `PERAN_PEMBACA_PANEL`
// -------------------------------------------------------------------------
// Batangnya memuat nomor pesanan dan nama penyewa. Itu data pesanan, dan
// `PERAN_PEMBACA_PESANAN` sengaja tidak memuat CS karena rincian pesanan
// membawa nominal serta data perusahaan. Menggerbangnya dengan
// `PERAN_PEMBACA_PANEL` berarti CS membaca daftar penyewa seluruh inventori
// dari layar yang tidak pernah ditinjau untuk itu.
//
// Layout `(dashboard)` sudah memulangkan CS ke `CS_Layout`, jadi gerbang ini
// terasa berlebihan — tapi itu kebetulan struktur route, bukan aturan. Halaman
// yang menggantungkan izinnya pada tata letak induk akan terbuka pada hari
// seseorang memindahkannya satu direktori.
//
// KENAPA PAGINASI TETAP ADA
// -------------------------
// Satu bulan × 25 titik adalah 25 baris; tanpa batas, inventori 3.000 titik
// membuat satu permintaan mengambil 3.000 baris beserta seluruh pesanan yang
// menyentuh bulan itu. Halaman ini karena itu mengikuti kontrak `paginasi.ts`
// yang sama dengan empat daftar admin lainnya — termasuk pengalihan nomor di
// luar jangkauan, yang tanpa itu memberi "Halaman 999 dari 2" berisi kalender
// kosong.

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

import { bacaHalaman, hitungPaginasi, PER_HALAMAN, urlHalaman } from '@/lib/paginasi';
import { bacaKataKunci } from '@/lib/kueri-daftar';
import { whereBillboard } from '@/lib/saringan-daftar';
import { peranBoleh, PERAN_PEMBACA_PESANAN } from '@/lib/gerbang-peran';
// Daftar status pengunci tanggal TIDAK ditulis ulang di sini. Ia diturunkan
// otomatis dari `TRANSISI_SAH`, jadi status baru ikut terhitung dengan
// sendirinya — sementara daftar yang disalin ke halaman ini akan menampilkan
// tanggal sebagai kosong padahal `booking/create` menolak menjualnya.
import { STATUS_MENGUNCI_TANGGAL } from '@/lib/transisi-status';
import {
  bacaBulan,
  BATAS_BULAN,
  geserKunciBulan,
  hariKalender,
  hariKosong,
  labelBulan,
  rentangBulan,
  segmenKalender,
} from '@/lib/kalender-ketersediaan';
import GridKalender, { type BarisKalender } from '@/components/admin/GridKalender';
import NavigasiHalaman from '@/components/admin/NavigasiHalaman';
import KotakCari from '@/components/admin/KotakCari';

export const dynamic = 'force-dynamic';

const BASIS = '/admin/calendar';

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ bulan?: string; halaman?: string; q?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/admin/login');

  if (!peranBoleh(PERAN_PEMBACA_PESANAN, session.user?.role)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <h1 className="text-lg font-bold text-red-700">Akses Ditolak</h1>
        <p className="mt-2 text-sm text-red-600">
          Kalender ketersediaan memuat nomor pesanan dan nama penyewa, jadi hanya
          dapat dibuka peran yang boleh membaca pesanan.
        </p>
      </div>
    );
  }

  const paramsQuery = await searchParams;

  const pilihanBulan = bacaBulan(paramsQuery?.bulan);
  const bulan = pilihanBulan.bulan;
  const halamanDiminta = bacaHalaman(paramsQuery?.halaman);
  const kataKunci = bacaKataKunci(paramsQuery?.q);

  const { mulai, sampaiEksklusif } = rentangBulan(bulan);
  const where: Prisma.BillboardWhereInput = whereBillboard(kataKunci);

  // Pesanannya di-`include` per titik, BUKAN diambil sebagai query kedua lalu
  // dikelompokkan di memori. Query kedua atas `billboardId: { in: [...] }`
  // memerlukan daftar id halaman ini — yang baru ada setelah query pertama
  // selesai, jadi keduanya tidak bisa masuk satu `$transaction` dan angka
  // `count` bisa berasal dari snapshot yang berbeda.
  //
  // Saringan tanggalnya setangkup dengan gerbang tumpang-tindih di
  // `booking/create`: `startDate < batas` dan `endDate > mulai`, dengan
  // `endDate` sebagai batas EKSKLUSIF. `lte`/`gte` di sini akan menarik
  // pesanan yang berakhir tepat tanggal 1 ke dalam bulan ini, dan
  // `segmenKalender` lalu memotongnya menjadi batang nol hari.
  const [titik, total] = await prisma.$transaction([
    prisma.billboard.findMany({
      where,
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        sku: true,
        status: true,
        bookings: {
          where: {
            status: { in: [...STATUS_MENGUNCI_TANGGAL] },
            startDate: { lt: sampaiEksklusif },
            endDate: { gt: mulai },
          },
          // Kolom uang, kolom penyedia pembayaran, dan data perusahaan
          // pembeli TIDAK ikut. Yang dirender hanya nomor, status, rentang,
          // dan nama — dan `select` yang longgar di Server Component berakhir
          // di HTML yang terkirim ke browser.
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            user: { select: { name: true } },
          },
          orderBy: { startDate: 'asc' },
        },
      },
      skip: (halamanDiminta - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    prisma.billboard.count({ where }),
  ]);

  const paginasi = hitungPaginasi(halamanDiminta, total);

  // `bulan` ikut di setiap tautan. Tanpa itu, tombol "Berikutnya" memulangkan
  // admin ke bulan ini sementara ia sedang memeriksa Desember — dan halaman 2
  // Desember terbaca sebagai "Desember kosong".
  //
  // Bulan yang sama dengan bakunya dibuang, alasan sama seperti `urut` di
  // `billboards/page.tsx`: URL yang menuliskan nilai baku membuat dua tautan
  // ke layar yang sama tidak bisa dibandingkan.
  const kueriAktif = {
    bulan: pilihanBulan.ditolak ? undefined : paramsQuery?.bulan === undefined ? undefined : bulan,
    q: kataKunci === '' ? undefined : kataKunci,
  };

  if (paginasi.terlaluJauh) {
    redirect(urlHalaman(BASIS, paginasi.totalHalaman, kueriAktif));
  }

  const { halaman, totalHalaman } = paginasi;

  const hari = hariKalender(bulan);

  // Segmen dihitung per titik. `segmenKalender` menempatkan jalur hanya di
  // antara pesanan yang diserahkan padanya, jadi memanggilnya sekali untuk
  // seluruh halaman akan bekerja juga — tapi memanggilnya per titik menjaga
  // `rentangKosong` bisa dihubungkan ke titiknya saat dilaporkan.
  //
  // Angka ringkasannya dijumlahkan lewat `reduce` DI LUAR `map`, bukan dengan
  // menambah dua `let` dari dalam callback-nya. Callback yang menyentuh
  // variabel luar ditolak `react-hooks/immutability`, dan alasannya berlaku
  // di sini: `map` adalah pemetaan, dan pemetaan yang juga menumpuk penjumlahan
  // akan menghitung ganda pada hari seseorang memanggilnya dua kali.
  const perTitik = titik.map((t) => ({
    titik: t,
    hasil: segmenKalender(
      bulan,
      t.bookings.map((b) => ({
        id: b.id,
        billboardId: t.id,
        status: b.status,
        startDate: b.startDate,
        endDate: b.endDate,
        namaPenyewa: b.user?.name ?? null,
      }))
    ),
  }));

  const jumlahRentangKosong = perTitik.reduce(
    (jumlah, p) => jumlah + p.hasil.rentangKosong.length,
    0
  );
  const hariKosongTotal = perTitik.reduce(
    (jumlah, p) => jumlah + hariKosong(bulan, p.hasil.segmen),
    0
  );

  const baris: BarisKalender[] = perTitik.map(({ titik: t, hasil }) => ({
    billboardId: t.id,
    judul: t.title,
    sku: t.sku,
    status: t.status,
    segmen: hasil.segmen,
  }));

  const bulanSebelum = geserKunciBulan(bulan, -1);
  const bulanSesudah = geserKunciBulan(bulan, 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            <CalendarDays size={24} className="text-utero" /> Kalender Ketersediaan
          </h1>
          <p className="text-sm text-gray-500">
            Tanggal terpakai per titik, {labelBulan(bulan)}.
          </p>
        </div>

        {/* Navigasi bulan. `<Link>` biasa, bukan tombol dengan `onClick`:
            keadaannya ada di URL, jadi bulan yang sedang dilihat bisa
            di-bookmark dan dikirim ke rekan — dan halaman ini tidak perlu
            menjadi Client Component. */}
        <div className="flex items-center gap-2">
          <Link
            href={urlHalaman(BASIS, 1, { bulan: bulanSebelum, q: kueriAktif.q })}
            className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-utero hover:text-utero"
            aria-label={`Ke ${labelBulan(bulanSebelum)}`}
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-[10rem] text-center text-sm font-bold text-gray-800">
            {labelBulan(bulan)}
          </div>
          <Link
            href={urlHalaman(BASIS, 1, { bulan: bulanSesudah, q: kueriAktif.q })}
            className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:border-utero hover:text-utero"
            aria-label={`Ke ${labelBulan(bulanSesudah)}`}
          >
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      {/* Bulan yang ditolak DIKATAKAN, tidak diam-diam diganti. URL yang
          dibuka bertuliskan `?bulan=2099-01`; kalender yang menampilkan
          Oktober tanpa satu pun tanda membuat admin membaca ketersediaan
          bulan yang salah — dan menelepon pembeli dengan tanggal itu. */}
      {pilihanBulan.ditolak && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Bulan yang diminta tidak dikenal atau di luar jangkauan {BATAS_BULAN} bulan,
          jadi yang ditampilkan adalah <b>{labelBulan(bulan)}</b>.
        </div>
      )}

      {/* Rentang nol hari tidak bisa lahir dari `booking/create` (durasi minimum
          satu bulan), jadi angka bukan-nol di sini berarti baris yang ditulis
          di luar aplikasi. Ia dilaporkan alih-alih dibuang karena pesanan itu
          TIDAK mengunci tanggal — dan tanggal itu akan dijual ke orang lain. */}
      {jumlahRentangKosong > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {jumlahRentangKosong} pesanan pada halaman ini punya rentang tanggal nol
          hari atau terbalik, jadi tidak digambar dan tidak mengunci tanggal apa
          pun. Periksa <code>startDate</code> dan <code>endDate</code>-nya.
        </div>
      )}

      <KotakCari
        basis={BASIS}
        nilai={kataKunci}
        label="Cari titik berdasarkan judul, SKU, atau alamat"
        placeholder="Cari judul, SKU, atau alamat…"
        tersembunyi={{ bulan: kueriAktif.bulan }}
      />

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        {baris.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-bold text-gray-700">
              {kataKunci === '' ? 'Belum ada titik' : `Tidak ada titik yang cocok dengan "${kataKunci}"`}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {kataKunci === ''
                ? 'Tambahkan titik di Inventory Billboard untuk melihat kalendernya.'
                : 'Coba kata kunci lain, atau hapus pencarian.'}
            </p>
          </div>
        ) : (
          <>
            <GridKalender hari={hari} baris={baris} />

            <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
              {/* Total hari kosong dijumlahkan lintas titik halaman ini: satuannya
                  "titik-hari", dan namanya disebut supaya tidak terbaca sebagai
                  jumlah hari kalender. */}
              <p className="text-xs text-gray-500">
                {hariKosongTotal} titik-hari masih kosong pada {baris.length} titik di
                halaman ini.
              </p>
              <NavigasiHalaman
                basis={BASIS}
                halaman={halaman}
                totalHalaman={totalHalaman}
                total={total}
                satuan="titik"
                parameter={kueriAktif}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
