import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SearchFilter from '@/components/SearchFilter';
import MapWrapper from '@/components/MapWrapper';
import ChatWidget from '@/components/ChatWidget';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { uangUntukClient } from '@/lib/money';
import { bacaKataKunci, bacaPilihan } from '@/lib/kueri-daftar';
import { wherePublikBillboard } from '@/lib/saringan-daftar';
import { PILIHAN_TIPE_MEDIA, TIPE_SEMUA } from '@/lib/tipe-billboard';
import { STATUS_MENGUNCI_TANGGAL } from '@/lib/transisi-status';

export const dynamic = 'force-dynamic';

// Sebelumnya halaman ini fetch ke backend NestJS di port 4001, lalu menyaring
// hasilnya di JavaScript. Dua masalah:
//
//   1. `findAll()` di NestJS sengaja tidak menyaring publishStatus (ada
//      komentar "Hapus filter publishStatus" di sana), jadi SELURUH isi tabel
//      billboard — termasuk DRAFT yang belum siap publik — dikirim melewati
//      jaringan, baru disaring setelah sampai.
//   2. Ini Server Component; ia berjalan di server yang sama dengan database.
//      Memanggil HTTP ke proses lain hanya untuk menjalankan satu query adalah
//      lapisan yang tidak perlu — dan satu-satunya alasan backend/ harus hidup
//      agar halaman depan tidak kosong.
//
// Penyaringan sekarang dilakukan di query, jadi baris yang tidak layak tampil
// tidak pernah meninggalkan database.
// GALAT DATABASE TIDAK LAGI DITELAN MENJADI DAFTAR KOSONG.
//
// Blok `try/catch` di sini dulu mengembalikan `[]` saat query gagal. Dari kursi
// pengunjung, itu tidak bisa dibedakan dari "perusahaan ini tidak punya satu pun
// billboard": peta terbuka bersih, pencarian tidak menemukan apa-apa, dan tidak
// ada satu pun tanda bahwa yang rusak adalah sambungan database. Inventaris yang
// sebenarnya penuh tampil habis, dan pemilik usaha tidak tahu apa pun karena
// halamannya balas 200 OK dengan senang hati.
//
// Sekarang galat dibiarkan melempar ke `src/app/error.tsx`, yang mengatakan
// "gagal dimuat" — kalimat yang benar — alih-alih "tidak ada". Itulah sebabnya
// batas galat harus ada lebih dulu sebelum `catch` ini boleh dilepas.
//
// KLAUSA `where`-NYA SEKARANG DI `@/lib/saringan-daftar`.
//
// Ia dulu ditulis di sini, dan itu tidak menjadi masalah selama halaman ini satu-
// satunya yang menampilkan inventori publik. `/billboards` mengubahnya: dua
// halaman yang harus menampilkan himpunan baris yang SAMA, dengan dua gerbang
// keamanan (`status: 'Available'` dan `publishStatus: 'PUBLISHED'`) yang tidak
// boleh berbeda sehuruf pun. Salinan yang menyimpang di sini tidak menghasilkan
// galat — ia menghasilkan baris `DRAFT` yang tampil sebagai barang dagangan.
async function getBillboards(where: Prisma.BillboardWhereInput) {
  return await prisma.billboard.findMany({
    where,
    // Peta hanya merender delapan kolom ini. Sebelumnya seluruh baris
    // dikirim ke browser — termasuk catatan internal dan jejak siapa yang
    // terakhir mengubah. Dan karena `price` bertipe Decimal (objek), data
    // itu juga gagal diubah menjadi JSON saat menyeberang ke komponen
    // 'use client': peta tidak muncul sama sekali, tanpa keluhan dari
    // pemeriksaan tipe.
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      mainImage: true,
      lat: true,
      lng: true,
      price: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

// MENANGKAP URL SEARCH PARAM
type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams: searchParamsProp }: Props) {
  const searchParams = await searchParamsProp;

  // KETIGANYA DIBACA LEWAT PEMBACA YANG SAMA DENGAN DAFTAR ADMIN.
  //
  // `(searchParams.q as string) || ''` yang dulu di sini punya dua cacat yang
  // keduanya tidak terlihat: `?q=a&q=b` menyerahkan ARRAY, dan `as string`
  // membuat TypeScript menerimanya sementara `contains: ['a','b']` ditolak
  // Prisma saat dijalankan — halaman depan menjawab 500 dari satu parameter
  // ganda. Dan `?type=` apa pun lolos ke `where.type`, jadi `?type=Videotro`
  // menjawab peta kosong yang tidak bisa dibedakan dari "tidak ada stok".
  const kataKunci = bacaKataKunci(searchParams.q);
  const tipe = bacaPilihan(searchParams.type, PILIHAN_TIPE_MEDIA, TIPE_SEMUA);

  // `?date=` DULU TIDAK PERNAH DIBACA SIAPA PUN.
  //
  // `SearchFilter` menuliskannya ke URL sejak awal (`if (date) params.set('date', date)`),
  // dan halaman ini membaca `q` dan `type` saja. Jadi pengunjung memilih tanggal
  // mulai tayang, menekan Cari, melihat tanggalnya di bilah alamat — dan
  // menerima daftar yang sama sekali tidak menyaringnya. Ia lalu menyimpulkan
  // seluruh titik di peta kosong pada tanggal itu, membuka satu, dan baru
  // ditolak di ujung checkout.
  const { where, kunciTanggal, tanggalDitolak } = wherePublikBillboard(
    { kataKunci, tipe, tanggal: searchParams.date },
    STATUS_MENGUNCI_TANGGAL
  );

  // Penyaringan kini terjadi di database, bukan setelah data sampai.
  const filteredBillboards = (await getBillboards(where)).map((b) => ({
    ...b,
    price: uangUntukClient(b.price),
  }));

  // TAUTAN KE KATALOG, MEMBAWA SARINGAN YANG SEDANG AKTIF.
  //
  // `urlHalaman` SENGAJA tidak dipakai di sini walau ia yang menyusun setiap
  // tautan paginasi: ia selalu menuliskan `halaman` (lihat komentarnya — nomor
  // halaman ditulis terakhir supaya menang), jadi tautan masuk dari beranda akan
  // berbunyi `?halaman=1`. Itu alamat kedua untuk halaman pertama katalog, dan
  // yang ditautkan dari halaman paling banyak dibuka di situs ini — persis
  // bentuk duplikat yang `metadata.alternates.canonical` di sana harus melawan.
  const kueriKatalog = new URLSearchParams();
  if (kataKunci !== '') kueriKatalog.set('q', kataKunci);
  if (tipe !== TIPE_SEMUA) kueriKatalog.set('type', tipe);
  // Kunci yang sudah TERVALIDASI yang diteruskan, bukan `searchParams.date`
  // mentah: menyalin yang mentah berarti mengirim `?date=2026-02-30` ke halaman
  // berikutnya, yang menolaknya lagi di sana dan menampilkan peringatan kedua
  // atas kesalahan yang sama.
  if (kunciTanggal !== null) kueriKatalog.set('date', kunciTanggal);
  // `toString()`, bukan `.size`: properti itu baru ada di Node 19 dan modul ini
  // juga dibaca saat build. Hasilnya `''` untuk kueri kosong, dan itu cukup.
  const kueriTeks = kueriKatalog.toString();
  const tautanKatalog = kueriTeks === '' ? '/billboards' : `/billboards?${kueriTeks}`;

  return (
    <main className="relative h-screen w-full bg-white overflow-hidden">
      <Navbar />
      <div className="relative h-full w-full">
        <div className="absolute inset-0 z-0">
           <MapWrapper data={filteredBillboards} />
        </div>
        <div className="absolute top-20 left-0 w-full z-10 px-4 pointer-events-none flex justify-center">
             <div className="pointer-events-auto w-full max-w-[800px]">
                <SearchFilter />

                {/* PETA TIDAK BISA MENJAWAB "BERAPA BANYAK" DAN "BERAPA HARGANYA".
                    Sebelum tautan ini ada, satu-satunya jalan menelusuri inventori
                    adalah mengklik penanda di peta satu per satu — dan HTML halaman
                    ini tidak memuat SATU PUN tautan produk, karena seluruhnya
                    dirender Leaflet di dalam popup setelah JavaScript jalan. Jadi
                    pengunjung tanpa JavaScript, dan setiap perayap mesin pencari,
                    melihat halaman depan tanpa jalan menuju barang dagangannya. */}
                <div className="mt-3 flex justify-center">
                  <Link
                    href={tautanKatalog}
                    className="inline-flex items-center gap-2 bg-white/95 backdrop-blur-md border border-gray-100 shadow-lg rounded-full px-5 py-2.5 text-sm font-bold text-gray-700 hover:text-utero hover:border-utero transition"
                  >
                    <LayoutGrid size={16} className="text-utero" />
                    Lihat semua dalam bentuk daftar
                  </Link>
                </div>

                {/* Tanggal yang ditolak DIKATAKAN, tidak diabaikan diam-diam.
                    Kolom tanggal di bilah di atas tetap menampilkan apa yang
                    diketik pengunjung, jadi peta yang tidak tersaring akan
                    terbaca sebagai "semuanya kosong pada tanggal itu" — jawaban
                    yang jauh lebih buruk daripada mengaku tidak paham. */}
                {tanggalDitolak && (
                  <p
                    role="status"
                    className="mt-3 mx-auto max-w-md text-center text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5"
                  >
                    Tanggal yang diminta tidak dikenali, jadi peta ini menampilkan
                    seluruh titik. Pilih tanggal lewat kolom Mulai Tayang.
                  </p>
                )}
             </div>
        </div>
        <ChatWidget />
      </div>
    </main>
  );
}