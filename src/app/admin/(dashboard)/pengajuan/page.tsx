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
import { bacaHalaman, hitungPaginasi, PER_HALAMAN, urlHalaman } from '@/lib/paginasi';
import { bacaKataKunci } from '@/lib/kueri-daftar';
import { wherePengajuan } from '@/lib/saringan-daftar';
import KotakCari from '@/components/admin/KotakCari';
import NavigasiHalaman from '@/components/admin/NavigasiHalaman';
import TombolEkspor from '@/components/admin/TombolEkspor';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { peranBoleh, PERAN_PENGELOLA } from '@/lib/gerbang-peran';
import { redirect } from 'next/navigation';

// Sama dengan halaman users. Tanpa `take`, halaman ini mengambil SELURUH
// pengajuan yang pernah masuk setiap kali dibuka dan menanamkannya ke HTML.
// `PER_HALAMAN` dipakai bersama tiga daftar admin lainnya lewat `@/lib/paginasi`.

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
  searchParams?: Promise<{ halaman?: string; status?: string; q?: string }>;
}) {
  // Sejak Next 16 `searchParams` adalah Promise dan wajib di-`await`. Dibaca
  // langsung, nilainya selalu `undefined` dan paginasi tidak pernah berlaku —
  // cacat yang sudah pernah terjadi di `users/page.tsx`.
  const paramsQuery = await searchParams;

  const halamanDiminta = bacaHalaman(paramsQuery?.halaman);

  // Nilai dari URL diperiksa terhadap enum, tidak diteruskan apa adanya:
  // `?status=DROP` yang lolos ke `where` membuat Prisma melempar, dan galatnya
  // muncul sebagai layar error penuh alih-alih daftar kosong.
  const statusParam = paramsQuery?.status;
  const statusAktif = nilaiEnumSah(StatusPengajuanTitik, statusParam)
    ? statusParam
    : 'SEMUA';

  const kataKunci = bacaKataKunci(paramsQuery?.q);

  // Ekspor dibatasi pengelola, lebih sempit daripada pintu panel yang juga
  // meloloskan CS dan OPERATOR. Isi tabel ini adalah nomor telepon dan alamat
  // pemilik lahan yang menyerahkannya supaya DIHUBUNGI tim — bukan supaya dibawa
  // keluar sebagai satu berkas berisi ratusan kontak. Gerbang sesungguhnya ada di
  // route ekspor; ini hanya menentukan tombolnya digambar atau tidak.
  const session = await getServerSession(authOptions);
  const bolehEkspor = peranBoleh(PERAN_PENGELOLA, session?.user?.role);

  // Pencarian pengajuan. Tabel ini yang paling tidak punya cara dicari di antara
  // empat daftar admin: pengaju menelepon balik menyebut nama dan kotanya, dan
  // satu-satunya cara menemukan barisnya adalah membuka tab demi tab lalu
  // menggulung. Urutannya tanggal masuk, yaitu urutan yang tidak diketahui
  // penelepon.
  //
  // Klausanya di `wherePengajuan`, dipakai bersama route ekspor CSV — beserta
  // alasan `catatanAdmin` tidak ikut dicari dan alasan `AND`-nya ditulis
  // eksplisit. Ekspor yang menyusun `where`-nya sendiri menghasilkan berkas yang
  // terbuka sempurna dengan himpunan baris yang berbeda dari layar.
  const where = wherePengajuan(statusAktif, kataKunci);

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
      skip: (halamanDiminta - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    prisma.pengajuanTitik.count({ where }),
    // Penghitung `BARU` dihitung tanpa saringan tab supaya lencananya tetap
    // menunjukkan berapa yang belum disentuh, walaupun admin sedang membuka tab
    // "Selesai".
    prisma.pengajuanTitik.count({ where: { status: StatusPengajuanTitik.BARU } }),
  ]);

  const paginasi = hitungPaginasi(halamanDiminta, total);

  // Tab dan kata kunci dikumpulkan sekali, lalu dipakai pengalihan, tab, kotak
  // cari, dan navigasi halaman. Empat salinan daftar yang sama adalah empat
  // tempat yang akan menyimpang.
  const kueriAktif = {
    status: statusAktif === 'SEMUA' ? undefined : statusAktif,
    q: kataKunci === '' ? undefined : kataKunci,
  };

  // Tab yang sedang dibuka ikut dibawa ke pengalihan, sama seperti ia dibawa
  // tombol "Berikutnya". Pengalihan yang membuangnya akan memindahkan admin dari
  // tab "Baru" ke seluruh pengajuan tanpa satu pun petunjuk.
  if (paginasi.terlaluJauh) {
    redirect(urlHalaman('/admin/pengajuan', paginasi.totalHalaman, kueriAktif));
  }

  const { halaman, totalHalaman } = paginasi;

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
              // Lewat `urlHalaman`, bukan template teks. Dua alasan: kata kunci
              // ikut terbawa saat admin berpindah tab — tanpa itu, mengeklik
              // "Dihubungi" di tengah pencarian membuang pencariannya tanpa
              // suara — dan nilainya ter-encode, sedangkan `?status=${…}` yang
              // ditempel apa adanya akan pecah pada kata kunci bertanda `&`.
              href={urlHalaman('/admin/pengajuan', 1, {
                status: tab.kunci === 'SEMUA' ? undefined : tab.kunci,
                q: kataKunci === '' ? undefined : kataKunci,
              })}
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

      {/* Tab yang sedang aktif dibawa sebagai medan tersembunyi, bukan ditempel
          ke `action`: query di `action` dibuang peramban saat formulir GET
          dikirim. Menaruh `?status=BARU` di sana menghasilkan tab yang diam-diam
          kembali ke "Semua" setiap kali admin menekan Cari. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex-1">
          <KotakCari
            basis="/admin/pengajuan"
            nilai={kataKunci}
            label="Cari pengajuan berdasarkan nama pemilik, nomor WhatsApp, email, kota, atau alamat"
            placeholder="Cari nama, nomor WhatsApp, kota, alamat…"
            tersembunyi={{ status: kueriAktif.status }}
          />
        </div>

        {bolehEkspor && (
          <TombolEkspor daftar="pengajuan" parameter={kueriAktif} label="Unduh CSV" />
        )}
      </div>

      {daftar.length === 0 ? (
        // Layar kosong menjelaskan keadaannya, bukan hanya menampilkan ruang
        // putih yang terbaca seperti halaman gagal dimuat.
        //
        // "Tidak ada yang cocok" dibedakan dari "belum ada": kalimat kedua pada
        // hasil pencarian membuat admin menyimpulkan pengajuannya sudah terhapus,
        // padahal ia hanya tidak cocok dengan kata yang diketik.
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Inbox className="mx-auto text-gray-300" size={40} />
          {kataKunci !== '' ? (
            <>
              <p className="font-bold text-gray-700 mt-4">
                Tidak ada pengajuan yang cocok dengan &ldquo;{kataKunci}&rdquo;
              </p>
              <p className="text-sm text-gray-500 mt-1.5">
                Pencarian ini hanya mencakup tab yang sedang dibuka. Coba tab
                &ldquo;Semua&rdquo; bila pengajuannya mungkin sudah ditandai
                selesai atau ditolak.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-gray-700 mt-4">Belum ada pengajuan di tab ini</p>
              <p className="text-sm text-gray-500 mt-1.5">
                Pengajuan masuk otomatis begitu pemilik lahan mengirim formulir di
                /sewakan-tempat.
              </p>
            </>
          )}
        </div>
      ) : (
        <PengajuanClient daftar={daftar} />
      )}

      {/* Saringan status dan kata kunci ikut dibawa ke halaman berikutnya lewat
          `parameter`. Tanpa itu, tombol "Berikutnya" melompat ke seluruh
          pengajuan dan admin kehilangan tab serta pencarian yang sedang aktif. */}
      <NavigasiHalaman
        basis="/admin/pengajuan"
        halaman={halaman}
        totalHalaman={totalHalaman}
        total={total}
        satuan="pengajuan"
        parameter={kueriAktif}
      />
    </div>
  );
}
