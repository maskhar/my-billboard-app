// src/app/billboards/page.tsx
//
// Katalog publik: inventori yang sama dengan peta beranda, dalam bentuk daftar.
//
// KENAPA HALAMAN INI ADA
// ----------------------
// Sebelum berkas ini, satu-satunya jalan menelusuri inventori adalah peta di
// beranda — dan peta itu merender seluruh tautan produknya DI DALAM popup
// Leaflet, setelah JavaScript jalan. Tiga akibat yang tidak satu pun terlihat
// sebagai galat:
//
//  1. **Nol tautan produk di HTML halaman depan.** Mesin pencari yang merayapi
//     `/` tidak menemukan satu pun jalan ke halaman `/billboard/[slug]`. Satu-
//     satunya yang mengaitkannya adalah `sitemap.ts` — dan sitemap adalah
//     petunjuk, bukan tautan. Seluruh katalog karena itu bergantung pada satu
//     berkas XML.
//  2. **Tidak ada cara membandingkan.** Harga, jenis, dan alamat hanya terlihat
//     satu per satu, setelah mengklik penanda dan menutupnya lagi. Pertanyaan
//     pertama setiap penyewa — "ada berapa dan berapa harganya" — tidak punya
//     jawaban di situs ini.
//  3. **Pengunjung tanpa JavaScript melihat halaman kosong.** Termasuk perayap
//     yang tidak mengeksekusi skrip, dan pembaca layar yang menghadapi peta
//     tanpa padanan tekstual.
//
// Daftar ini menjawab ketiganya dengan HTML biasa: `<Link>` yang ada di sumber
// halaman, harga yang bisa diurutkan, dan nol byte JavaScript miliknya sendiri.
//
// SATU `where`, DUA HALAMAN
// -------------------------
// Klausanya dari `wherePublikBillboard` di `@/lib/saringan-daftar`, persis yang
// dipakai beranda. Itu bukan kerapian: dua gerbang keamanan (`status:
// 'Available'` dan `publishStatus: 'PUBLISHED'`) yang disalin lalu menyimpang
// berarti baris `DRAFT` — harga yang masih ditawar, alamat yang belum
// dikonfirmasi pemilik lahan — tampil di sini sebagai barang dagangan, tanpa
// satu pun galat yang memberi tahu.
//
// KENAPA BUKAN CLIENT COMPONENT
// -----------------------------
// Seluruh keadaan halaman ini ada di URL: kata kunci, jenis, tanggal, urutan,
// nomor halaman. Jadi ia tidak butuh satu pun hook, dan setiap keadaan yang bisa
// dilihat pengunjung bisa ia bagikan sebagai tautan. `SearchFilter` di atasnya
// tetap Client Component — ia memang perlu — tapi hasilnya dirender server.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutGrid, MapPin, Search } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SearchFilter from '@/components/SearchFilter';
import { prisma } from '@/lib/prisma';
import { rupiah } from '@/lib/money';
import { bacaKataKunci, bacaPilihan } from '@/lib/kueri-daftar';
import { bacaHalaman, hitungPaginasi, urlHalaman } from '@/lib/paginasi';
import { KUNCI_URUT_PUBLIK, URUT_PUBLIK, wherePublikBillboard } from '@/lib/saringan-daftar';
import { PILIHAN_TIPE_MEDIA, TIPE_SEMUA } from '@/lib/tipe-billboard';
import { STATUS_MENGUNCI_TANGGAL } from '@/lib/transisi-status';

/**
 * `force-dynamic` karena isinya bergantung pada `searchParams` DAN pada
 * ketersediaan tanggal yang berubah setiap kali ada pesanan masuk. Halaman yang
 * di-cache di sini menjual tanggal yang sudah terjual.
 */
export const dynamic = 'force-dynamic';

const PER_HALAMAN_KATALOG = 12;

/**
 * Label urutan yang dibaca pengunjung, untuk setiap kunci di `URUT_PUBLIK`.
 *
 * `Record<string, string>` dan bukan `Record<keyof typeof URUT_PUBLIK, string>`
 * karena `URUT_PUBLIK` sendiri dideklarasikan `Record<string, …>` — jadi tidak
 * ada gerbang kompilasi yang bisa menuntut kelengkapan di sini. Yang menjaganya
 * adalah `labelUrut()` di bawah: kunci yang belum punya label jatuh ke kuncinya
 * sendiri, bukan ke `undefined` yang merender `<option>` tanpa teks.
 */
const LABEL_URUT: Record<string, string> = {
  terbaru: 'Terbaru diperbarui',
  'harga-naik': 'Harga termurah',
  'harga-turun': 'Harga tertinggi',
  'judul-naik': 'Judul A–Z',
  'judul-turun': 'Judul Z–A',
};

function labelUrut(kunci: string): string {
  return LABEL_URUT[kunci] ?? kunci;
}

export const metadata: Metadata = {
  title: 'Semua Titik Media',
  description:
    'Daftar seluruh videotron, baliho, dan megatron yang sedang tersedia, beserta harga sewa dan alamatnya.',
  alternates: {
    // KANONIK TANPA QUERY, dan itu keputusan yang perlu ditulis.
    //
    // Setiap kombinasi `?q=`/`?type=`/`?date=`/`?urut=`/`?halaman=` adalah alamat
    // yang sah dan memuat himpunan baris yang berbeda — tapi bukan HALAMAN yang
    // berbeda. Tanpa kanonik, mesin pencari mengindeks ratusan alamat yang isinya
    // saling bersarang, dan peringkat katalog ini terpecah di antara semuanya.
    //
    // Konsekuensinya diterima: halaman 2 tidak diindeks sebagai halaman
    // tersendiri. Itu benar untuk katalog yang barisnya berubah setiap hari —
    // "halaman 2" bukan konsep yang stabil, dan produk yang sebenarnya ingin
    // diindeks punya halamannya sendiri di `/billboard/[slug]`, yang terdaftar
    // di `sitemap.ts`.
    canonical: '/billboards',
  },
};

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function KatalogBillboard({ searchParams: searchParamsProp }: Props) {
  const searchParams = await searchParamsProp;

  const kataKunci = bacaKataKunci(searchParams.q);
  const tipe = bacaPilihan(searchParams.type, PILIHAN_TIPE_MEDIA, TIPE_SEMUA);
  const urutAktif = bacaPilihan(searchParams.urut, KUNCI_URUT_PUBLIK, 'terbaru');
  const halamanDiminta = bacaHalaman(searchParams.halaman);

  const { where, kunciTanggal, tanggalDitolak } = wherePublikBillboard(
    { kataKunci, tipe, tanggal: searchParams.date },
    STATUS_MENGUNCI_TANGGAL
  );

  // `$transaction` supaya `count` dan `findMany` melihat SNAPSHOT yang sama.
  //
  // Dua kueri terpisah pada katalog yang sedang dipesan bisa menghitung 13 baris
  // lalu mengambil halaman yang barisnya sudah tinggal 12 — navigasinya menulis
  // "2 halaman" di atas halaman kedua yang kosong. Bentuk yang sama dipakai
  // keempat daftar admin.
  const [total, baris] = await prisma.$transaction([
    prisma.billboard.count({ where }),
    prisma.billboard.findMany({
      where,
      // Tujuh kolom yang benar-benar dirender kartunya. `sku` TIDAK ikut, dan itu
      // sengaja: ia kode internal yang tertulis di kontrak dan surat jalan, dan
      // `wherePublikBillboard` juga menolak mencarinya. Kolom yang tidak dipilih
      // tidak bisa bocor lewat kelalaian JSX di kemudian hari.
      select: {
        id: true,
        slug: true,
        title: true,
        type: true,
        address: true,
        mainImage: true,
        price: true,
      },
      orderBy: URUT_PUBLIK[urutAktif],
      skip: (Math.max(1, halamanDiminta) - 1) * PER_HALAMAN_KATALOG,
      take: PER_HALAMAN_KATALOG,
    }),
  ]);

  const paginasi = hitungPaginasi(halamanDiminta, total, PER_HALAMAN_KATALOG);

  // Saringan yang sedang aktif, dibawa oleh setiap tautan di halaman ini.
  //
  // `date` memakai `kunciTanggal`, bukan nilai mentah: tautan paginasi yang
  // membawa `?date=2026-02-30` mengulang penolakan yang sama di halaman
  // berikutnya, beserta peringatannya.
  const kueriAktif = {
    q: kataKunci === '' ? undefined : kataKunci,
    type: tipe === TIPE_SEMUA ? undefined : tipe,
    date: kunciTanggal ?? undefined,
    urut: urutAktif === 'terbaru' ? undefined : urutAktif,
  };

  // Nomor di luar jangkauan DIALIHKAN, tidak dibetulkan diam-diam.
  //
  // Alasan lengkapnya di `@/lib/paginasi`: `skip` sudah terkirim sebelum `count`
  // terjawab, jadi membetulkan nomornya hanya untuk tampilan menghasilkan
  // "Halaman 2 dari 2" di atas daftar yang kosong. `?halaman=999` di sini bukan
  // hipotetis — jumlah halaman MENGECIL saat titik terjual, jadi setiap tautan
  // lama adalah calon halaman terkurung.
  if (paginasi.terlaluJauh) {
    redirect(urlHalaman('/billboards', paginasi.totalHalaman, kueriAktif));
  }

  const { halaman, totalHalaman } = paginasi;

  // `price` TIDAK diubah menjadi `number` di sini, dan itu keputusan.
  //
  // `uangUntukClient` wajib bila nilainya menyeberang ke komponen `'use client'`
  // — `Prisma.Decimal` tidak bisa diubah menjadi JSON dan halamannya gagal saat
  // DIJALANKAN tanpa satu pun keluhan dari `tsc`. Di sini tidak ada penyeberangan
  // itu: seluruh kartu dirender server, dan `rupiah()` menerima `Decimal`
  // langsung. Melewatkan `number` justru membuang presisi tanpa alasan.
  //
  // Bila satu bagian halaman ini kelak menjadi Client Component, `price`-nya
  // HARUS lewat `uangUntukClient` di titik penyeberangan itu.
  const kartu = baris;

  const adaSaringan = kataKunci !== '' || tipe !== TIPE_SEMUA || kunciTanggal !== null;

  return (
    <main className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">
              Semua titik media
            </h1>
            <p className="text-sm text-gray-600 mt-2 max-w-2xl leading-relaxed">
              Inventori yang sama dengan peta di halaman depan, dalam bentuk yang
              bisa dibandingkan. Harga yang tertera adalah harga sewa per periode,
              belum termasuk pajak dan biaya administrasi yang dihitung saat
              memesan.
            </p>
          </div>

          {/* JALAN BALIK KE PETA, dan ia WAJIB ada di sini.
              Navbar "Cari Billboard" sekarang menunjuk halaman ini, jadi satu-
              satunya kendali yang tersisa menuju peta adalah logo — sebuah
              tautan yang tidak mengaku membawa ke peta. Peta menjawab pertanyaan
              yang daftar ini tidak bisa ("mana yang dekat perempatan itu"), jadi
              menguburnya berarti menukar satu cacat navigasi dengan cacat
              lainnya.

              Saringan TIDAK dibawa: beranda membacanya lewat
              `wherePublikBillboard` yang sama, tapi maksud pengunjung yang
              menekan ini adalah melihat SEBARANNYA — dan peta yang terbuka
              dengan tiga penanda karena kata kunci yang masih menempel terbaca
              sebagai peta yang rusak. */}
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:border-utero hover:text-utero"
          >
            <MapPin size={16} className="text-utero" />
            Lihat di peta
          </Link>
        </header>

        {/* Bilah pencarian yang SAMA dengan beranda. Ia membaca `usePathname`,
            jadi tombol Cari-nya tetap di halaman ini alih-alih melempar
            pengunjung balik ke peta. */}
        <div className="mt-6">
          <SearchFilter />
        </div>

        {tanggalDitolak && (
          <p
            role="status"
            className="mt-6 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
          >
            Tanggal yang diminta tidak dikenali, jadi daftar ini belum disaring
            menurut ketersediaan. Pilih tanggal lewat kolom Mulai Tayang.
          </p>
        )}

        {/* RINGKASAN + URUTAN */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">
              {total} titik tersedia
              {kunciTanggal !== null && ` mulai ${kunciTanggal}`}
            </p>
            {adaSaringan && (
              <Link
                href="/billboards"
                className="text-xs font-semibold text-utero hover:underline mt-1 inline-block"
              >
                Hapus semua saringan
              </Link>
            )}
          </div>

          {/* URUTAN SEBAGAI TAUTAN, BUKAN `<select onChange>`.
              Halaman ini nol JavaScript miliknya sendiri; sebuah `<select>` yang
              mengubah URL menuntut Client Component beserta seluruh bundelnya
              hanya untuk lima tautan. Tautan juga bisa dibuka di tab baru dan
              dibagikan — dua hal yang `onChange` tidak bisa. */}
          <nav aria-label="Urutan daftar" className="flex flex-wrap gap-2">
            {KUNCI_URUT_PUBLIK.map((kunci) => {
              const aktif = kunci === urutAktif;
              return (
                <Link
                  key={kunci}
                  // Halaman 1, bukan halaman yang sedang dibuka. Mengubah urutan
                  // menyusun ulang seluruh daftar, jadi "halaman 5 menurut harga"
                  // tidak punya hubungan apa pun dengan "halaman 5 menurut
                  // judul" — membawa nomornya mendaratkan pengunjung di tengah
                  // daftar yang belum pernah ia lihat awalnya.
                  href={urlHalaman('/billboards', 1, {
                    ...kueriAktif,
                    urut: kunci === 'terbaru' ? undefined : kunci,
                  })}
                  aria-current={aktif ? 'true' : undefined}
                  className={
                    aktif
                      ? 'rounded-full border border-utero bg-utero/10 px-3 py-1.5 text-xs font-bold text-utero'
                      : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:border-utero hover:text-utero'
                  }
                >
                  {labelUrut(kunci)}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* DAFTAR */}
        {kartu.length === 0 ? (
          // KOSONG KARENA SARINGAN ≠ KOSONG KARENA TIDAK ADA STOK.
          //
          // Dua kalimat yang berbeda, karena yang harus dilakukan pengunjung juga
          // berbeda: yang pertama perlu melonggarkan saringannya, yang kedua tidak
          // punya apa pun untuk dilakukan di halaman ini. Satu kalimat untuk
          // keduanya mengirim setengah pengunjung memperbaiki sesuatu yang tidak
          // rusak.
          <div className="mt-10 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
            <Search className="mx-auto text-gray-300" size={28} />
            {adaSaringan ? (
              <>
                <p className="mt-4 font-bold text-gray-900">
                  Tidak ada titik yang cocok dengan saringan ini
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Coba longgarkan kata kunci, jenis media, atau tanggal mulai
                  tayangnya.
                </p>
                <Link
                  href="/billboards"
                  className="mt-5 inline-block rounded-full bg-utero px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-600"
                >
                  Hapus semua saringan
                </Link>
              </>
            ) : (
              <>
                <p className="mt-4 font-bold text-gray-900">
                  Belum ada titik yang tersedia saat ini
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Seluruh media sedang tersewa. Hubungi kami untuk menanyakan
                  jadwal titik yang akan kosong.
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {kartu.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/billboard/${b.slug}`}
                  className="group block h-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:border-utero hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-utero"
                >
                  {/* `<img>`, bukan `next/image`, dan itu sengaja: `mainImage`
                      berisi alamat yang diunggah admin, dan `next/image` menolak
                      host yang tidak terdaftar di `next.config.ts` dengan MELEMPAR
                      saat render — satu titik bergambar dari host baru mematikan
                      seluruh halaman katalog, bukan satu kartunya.

                      `loading="lazy"` karena dua belas gambar per halaman dan
                      hanya tiga yang terlihat lebih dulu. */}
                  <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                    {b.mainImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.mainImage}
                        alt={`Foto ${b.title}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      // Placeholder DENGAN teks, bukan kotak abu-abu kosong:
                      // kartu tanpa gambar dan tanpa penjelasan terbaca sebagai
                      // gambar yang gagal dimuat.
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-400">
                        <LayoutGrid size={18} className="mr-2" />
                        Foto belum tersedia
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <span className="inline-block rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-600">
                      {b.type}
                    </span>
                    <h2 className="mt-2 font-bold leading-snug text-gray-900 group-hover:text-utero">
                      {b.title}
                    </h2>
                    <p className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-gray-500">
                      <MapPin size={12} className="mt-0.5 shrink-0" />
                      {b.address}
                    </p>
                    <p className="mt-3 text-sm font-extrabold text-gray-900">
                      {rupiah(b.price)}
                      <span className="ml-1 text-xs font-semibold text-gray-500">
                        / periode
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* PAGINASI.
            `NavigasiHalaman` di `components/admin/` sengaja TIDAK dipakai di
            sini: ia milik daftar admin, dan menariknya ke halaman publik berarti
            satu komponen yang harus melayani dua tampilan sekaligus — perubahan
            untuk admin lalu menyentuh katalog, dan sebaliknya. Yang dibagi adalah
            `urlHalaman`, yaitu aturannya, bukan tampilannya. */}
        {totalHalaman > 1 && (
          <nav
            aria-label="Navigasi halaman katalog"
            className="mt-10 flex items-center justify-between gap-4 text-sm"
          >
            {halaman > 1 ? (
              <Link
                href={urlHalaman('/billboards', halaman - 1, kueriAktif)}
                rel="prev"
                className="rounded-full border border-gray-200 bg-white px-4 py-2 font-bold text-gray-700 transition hover:border-utero hover:text-utero"
              >
                Sebelumnya
              </Link>
            ) : (
              // `<span aria-disabled>`, bukan `<a>` tanpa `href`: tautan tanpa
              // alamat tetap bisa difokus di sebagian peramban dan tidak punya
              // arti bagi pembaca layar.
              <span
                aria-disabled="true"
                className="cursor-not-allowed select-none rounded-full border border-gray-100 bg-gray-50 px-4 py-2 font-bold text-gray-300"
              >
                Sebelumnya
              </span>
            )}

            <span className="text-xs font-semibold text-gray-500">
              Halaman {halaman} dari {totalHalaman}
            </span>

            {halaman < totalHalaman ? (
              <Link
                href={urlHalaman('/billboards', halaman + 1, kueriAktif)}
                rel="next"
                className="rounded-full border border-gray-200 bg-white px-4 py-2 font-bold text-gray-700 transition hover:border-utero hover:text-utero"
              >
                Berikutnya
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="cursor-not-allowed select-none rounded-full border border-gray-100 bg-gray-50 px-4 py-2 font-bold text-gray-300"
              >
                Berikutnya
              </span>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
