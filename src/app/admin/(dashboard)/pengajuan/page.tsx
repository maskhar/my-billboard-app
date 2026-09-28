// src/app/admin/(dashboard)/pengajuan/page.tsx
//
// Pembaca pengajuan titik dari pemilik lahan.
//
// Halaman ini ada bersama tabelnya, bukan sesudahnya. Tabel yang tidak dibaca
// siapa pun membuat pengaju menunggu telepon yang tidak akan pernah datang, dan
// itu lebih buruk daripada formulir yang tidak pernah dipasang: pemilik lahan
// sudah menyerahkan nomornya dengan harapan dihubungi.
//
// Server Component. Yang menyeberang ke browser hanya baris yang memang dibaca
// layar, dengan `createdAt` sudah menjadi teks ISO — `Date` tidak bisa
// diserialisasi ke props Client Component.

import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { StatusPengajuanTitik } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { nilaiEnumSah } from '@/lib/enum-guard';
import { keTautanWa } from '@/lib/telepon';
import PengajuanClient from './PengajuanClient';

// Sama dengan halaman users. Tanpa `take`, halaman ini mengambil SELURUH
// pengajuan yang pernah masuk setiap kali dibuka dan menanamkannya ke HTML.
const PER_HALAMAN = 25;

// Saringan status yang boleh muncul di tab. `SEMUA` bukan anggota enum, jadi ia
// ditangani terpisah di bawah.
const TAB = [
  { kunci: 'BARU', label: 'Baru' },
  { kunci: 'DIHUBUNGI', label: 'Dihubungi' },
  { kunci: 'SELESAI', label: 'Selesai' },
  { kunci: 'DITOLAK', label: 'Ditolak' },
  { kunci: 'SEMUA', label: 'Semua' },
] as const;

export default async function PengajuanTitikPage({
  searchParams,
}: {
  searchParams?: Promise<{ halaman?: string; status?: string }>;
}) {
  // Sejak Next 16 `searchParams` adalah Promise dan wajib di-`await`. Dibaca
  // langsung, nilainya selalu `undefined` dan paginasi tidak pernah berlaku —
  // cacat yang sudah pernah terjadi di `users/page.tsx`.
  const paramsQuery = await searchParams;

  const halamanMentah = Number(paramsQuery?.halaman);
  const halaman =
    Number.isFinite(halamanMentah) && halamanMentah >= 1 ? Math.floor(halamanMentah) : 1;

  // Nilai dari URL diperiksa terhadap enum, tidak diteruskan apa adanya:
  // `?status=DROP` yang lolos ke `where` membuat Prisma melempar, dan galatnya
  // muncul sebagai layar error penuh alih-alih daftar kosong.
  const statusParam = paramsQuery?.status;
  const statusAktif = nilaiEnumSah(StatusPengajuanTitik, statusParam)
    ? statusParam
    : 'SEMUA';

  const where = statusAktif === 'SEMUA' ? {} : { status: statusAktif };

  const [pengajuan, total, jumlahBaru] = await prisma.$transaction([
    prisma.pengajuanTitik.findMany({
      where,
      // Kolom dipilih eksplisit. `catatanAdmin` memang ikut — layar ini yang
      // menulisnya — tapi tidak ada satu pun kolom `User` yang diambil utuh:
      // hanya `name` penanganya, karena `include: { ditanganiOleh: true }` akan
      // membawa `password` (hash bcrypt) ke props Client Component, dan props
      // itu tertanam di HTML halaman. Cacat itu sudah pernah ada di
      // `users/page.tsx` dan tidak diulang.
      select: {
        id: true,
        namaPemilik: true,
        nomorWa: true,
        email: true,
        alamat: true,
        kota: true,
        ukuran: true,
        catatan: true,
        status: true,
        catatanAdmin: true,
        createdAt: true,
        ditanganiOleh: { select: { name: true } },
      },
      // `status, createdAt` punya indeksnya sendiri di migrasi tabel ini.
      orderBy: { createdAt: 'desc' },
      skip: (halaman - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    prisma.pengajuanTitik.count({ where }),
    // Penghitung `BARU` dihitung tanpa saringan tab supaya lencananya tetap
    // menunjukkan berapa yang belum disentuh, walaupun admin sedang membuka tab
    // "Selesai".
    prisma.pengajuanTitik.count({ where: { status: StatusPengajuanTitik.BARU } }),
  ]);

  const totalHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

  const daftar = pengajuan.map((p) => ({
    id: p.id,
    namaPemilik: p.namaPemilik,
    nomorWa: p.nomorWa,
    email: p.email,
    alamat: p.alamat,
    kota: p.kota,
    ukuran: p.ukuran,
    catatan: p.catatan,
    status: p.status,
    catatanAdmin: p.catatanAdmin,
    createdAt: p.createdAt.toISOString(),
    namaPenangan: p.ditanganiOleh?.name ?? null,
    // Tautan WhatsApp disusun di server, bukan di browser: `keTautanWa`
    // memvalidasi bentuk nomornya dan mengembalikan `null` bila tidak sah, dan
    // nomor di tabel ini sudah dinormalisasi saat masuk. Menyusunnya di client
    // berarti menyalin aturan formatnya ke tempat kedua.
    tautanWa: keTautanWa(
      p.nomorWa,
      `Halo ${p.namaPemilik}, kami dari tim Utero menghubungi soal lokasi yang Anda ajukan di ${p.kota}.`
    ),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Pengajuan Titik</h1>
        <p className="text-sm text-gray-500 mt-1">
          Lokasi yang ditawarkan pemilik lahan lewat halaman{' '}
          <Link href="/sewakan-tempat" className="font-bold text-utero hover:underline">
            /sewakan-tempat
          </Link>
          . Hubungi lewat WhatsApp, lalu tandai status penanganannya di sini.
        </p>
      </header>

      {/* Tab saringan berupa tautan, bukan state client: statusnya jadi bagian
          URL, sehingga admin bisa menyimpan tautan "yang belum dihubungi" dan
          tombol kembali peramban bekerja. */}
      <nav className="flex flex-wrap gap-2">
        {TAB.map((tab) => {
          const aktif = statusAktif === tab.kunci;
          return (
            <Link
              key={tab.kunci}
              href={
                tab.kunci === 'SEMUA'
                  ? '/admin/pengajuan'
                  : `/admin/pengajuan?status=${tab.kunci}`
              }
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                aktif
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.kunci === 'BARU' && jumlahBaru > 0 && (
                <span
                  className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${
                    aktif ? 'bg-white text-gray-900' : 'bg-utero/10 text-utero'
                  }`}
                >
                  {jumlahBaru}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {daftar.length === 0 ? (
        // Layar kosong menjelaskan keadaannya, bukan hanya menampilkan ruang
        // putih yang terbaca seperti halaman gagal dimuat.
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Inbox className="mx-auto text-gray-300" size={40} />
          <p className="font-bold text-gray-700 mt-4">Belum ada pengajuan di tab ini</p>
          <p className="text-sm text-gray-500 mt-1.5">
            Pengajuan masuk otomatis begitu pemilik lahan mengirim formulir di
            /sewakan-tempat.
          </p>
        </div>
      ) : (
        <PengajuanClient daftar={daftar} />
      )}

      {totalHalaman > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Halaman {halaman} dari {totalHalaman} · {total} pengajuan
          </span>
          <div className="flex gap-2">
            {/* Saringan status ikut dibawa ke halaman berikutnya. Tanpa itu,
                tombol "Berikutnya" melompat ke seluruh pengajuan dan admin
                kehilangan tab yang sedang ia buka. */}
            {halaman > 1 && (
              <Link
                href={`/admin/pengajuan?halaman=${halaman - 1}${
                  statusAktif === 'SEMUA' ? '' : `&status=${statusAktif}`
                }`}
                className="rounded border border-gray-200 bg-white px-3 py-1.5 font-bold text-gray-600 transition hover:bg-gray-50"
              >
                Sebelumnya
              </Link>
            )}
            {halaman < totalHalaman && (
              <Link
                href={`/admin/pengajuan?halaman=${halaman + 1}${
                  statusAktif === 'SEMUA' ? '' : `&status=${statusAktif}`
                }`}
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
