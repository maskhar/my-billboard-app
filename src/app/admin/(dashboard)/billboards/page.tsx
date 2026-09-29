import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Plus, MapPin, Edit, Eye, Clock } from 'lucide-react';
import DeleteBillboardBtn from '@/components/admin/DeleteBillboardBtn';
import StatusChanger from '@/components/admin/StatusChanger';
import { Billboard, Prisma } from '@prisma/client';
import { angkaRupiah } from '@/lib/money';
import { tanggalRingkas } from '@/lib/tanggal';
import { bacaHalaman, hitungPaginasi, PER_HALAMAN, urlHalaman } from '@/lib/paginasi';
import { bacaKataKunci, bacaPilihan } from '@/lib/kueri-daftar';
import NavigasiHalaman from '@/components/admin/NavigasiHalaman';
import KepalaUrut from '@/components/admin/KepalaUrut';
import KotakCari from '@/components/admin/KotakCari';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Hanya `name` yang dirender (inisial + nama pengubah terakhir). Kolom User
// lainnya — email, hash password, KTP, NPWP — tidak ikut dikirim ke browser.
type BillboardWithUsers = Billboard & {
  updatedBy: { id: string; name: string | null } | null;
  createdBy: { id: string; name: string | null } | null;
}

/**
 * Urutan yang boleh diminta URL, beserta `orderBy` Prisma-nya.
 *
 * Daftarnya TERTUTUP, dan itu bukan sekadar kehati-hatian: `orderBy` yang
 * dirangkai dari teks URL berarti nama kolom apa pun bisa diminta pengunjung,
 * termasuk kolom yang tidak dirender halaman ini. Prisma menolak nama yang tidak
 * dikenalnya dengan melempar — jadi `?urut=password` menghasilkan layar galat
 * penuh, dan yang lebih buruk, nama kolom yang KEBETULAN ada menjadi saluran
 * untuk menyimpulkan isi tabel dari urutan barisnya.
 *
 * Peta ini juga yang membuat kunci urutnya boleh berbeda dari nama kolom
 * database. `harga-naik` lebih jelas di URL daripada `price:asc`, dan tidak
 * membocorkan nama kolom.
 */
const URUT: Record<string, Prisma.BillboardOrderByWithRelationInput> = {
  // `terbaru` adalah bakunya: yang paling sering dicari admin adalah titik yang
  // baru saja ia sunting.
  terbaru: { updatedAt: 'desc' },
  terlama: { updatedAt: 'asc' },
  'judul-naik': { title: 'asc' },
  'judul-turun': { title: 'desc' },
  'harga-naik': { price: 'asc' },
  'harga-turun': { price: 'desc' },
  'status-naik': { status: 'asc' },
  'status-turun': { status: 'desc' },
};

const KUNCI_URUT = Object.keys(URUT) as [string, ...string[]];

// Sebelumnya lewat HTTP ke backend NestJS. Halaman ini Server Component dan
// akses ke halaman admin sudah dijaga middleware, jadi query langsung sudah
// cukup — dan menghilangkan ketergantungan pada proses kedua yang harus hidup.
// Tanpa batas, query ini mengambil SELURUH inventori setiap kali halaman
// dibuka — beserta gambar, spesifikasi, dan dua relasi User per baris. Dengan
// 30 billboard itu tidak terasa; dengan 3.000 halaman ini berhenti terbuka
// sama sekali, dan tidak ada satu pun pesan yang menjelaskan kenapa.
//
// `PER_HALAMAN` sekarang datang dari `@/lib/paginasi` — empat halaman daftar
// admin mendeklarasikannya sendiri-sendiri dengan nilai yang kebetulan sama,
// dan nilai yang kebetulan sama adalah nilai yang akan menyimpang.

// Parameternya `halamanDiminta`, bukan `halaman`. Sejak nomor halaman dijepit
// ke atas, ada DUA angka yang beredar: yang diminta URL, dan yang dijepit
// setelah `count` diketahui. Yang dijepit tidak bisa dipakai di sini — ia baru
// ada setelah query ini selesai — jadi nama `halaman` di posisi ini adalah nama
// yang mengundang salah pakai.
//
// `where` dan `orderBy` diserahkan pemanggil, sudah dalam bentuk Prisma. Fungsi
// ini sengaja TIDAK membaca `searchParams` sendiri: keputusan tentang nilai apa
// yang sah diambil sekali, di satu tempat, oleh pemanggilnya — karena keputusan
// yang sama juga menentukan tautan tab dan tautan paginasinya.
async function getAdminBillboards(
  halamanDiminta: number,
  where: Prisma.BillboardWhereInput,
  orderBy: Prisma.BillboardOrderByWithRelationInput,
): Promise<{ data: BillboardWithUsers[]; total: number }> {
  try {
    const [data, total] = await prisma.$transaction([
      prisma.billboard.findMany({
        where,
        orderBy,
        include: {
          createdBy: { select: { id: true, name: true } },
          updatedBy: { select: { id: true, name: true } },
        },
        skip: (halamanDiminta - 1) * PER_HALAMAN,
        take: PER_HALAMAN,
      }),
      prisma.billboard.count({ where }),
    ]);
    return { data, total };
  } catch (error) {
    console.error('Gagal mengambil data admin billboards:', error);
    return { data: [], total: 0 };
  }
}

// Sejak Next 16, `searchParams` adalah sebuah Promise dan harus di-`await`
// dulu. Sebelumnya `searchParams?.halaman` dibaca langsung dari objek Promise
// dan selalu `undefined`, jadi paginasi inventori tidak pernah berlaku:
// halaman 2 ke atas menampilkan isi yang sama dengan halaman 1.
export default async function AdminBillboardsPage({
  searchParams,
}: {
  searchParams?: Promise<{ halaman?: string; urut?: string; q?: string }>;
}) {
  const paramsQuery = await searchParams;

  // `Number("abc")` menghasilkan NaN dan `Number("-5")` menghasilkan skip
  // negatif — keduanya membuat query gagal. `bacaHalaman()` menormalkan keduanya
  // ke 1, beserta `Infinity` dan parameter ganda (`?halaman=2&halaman=5`).
  const halamanDiminta = bacaHalaman(paramsQuery?.halaman);

  const urutAktif = bacaPilihan(paramsQuery?.urut, KUNCI_URUT, 'terbaru');
  const kataKunci = bacaKataKunci(paramsQuery?.q);

  // Pencarian inventori DI DATABASE, bukan di browser. Halaman ini tidak pernah
  // punya kotak cari sama sekali — satu-satunya cara menemukan satu titik di
  // antara ribuan adalah menebak halaman berapa ia berada.
  //
  // `sku` ikut dicari karena itulah yang tertulis di kontrak dan surat jalan,
  // dan itulah yang dibacakan tim lapangan lewat telepon. `address` ikut karena
  // titik lebih sering disebut lewat lokasinya daripada judulnya.
  const where: Prisma.BillboardWhereInput =
    kataKunci === ''
      ? {}
      : {
          OR: [
            { title: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } },
            { sku: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } },
            { address: { contains: kataKunci, mode: Prisma.QueryMode.insensitive } },
          ],
        };

  const { data: billboards, total } = await getAdminBillboards(halamanDiminta, where, URUT[urutAktif]);
  const paginasi = hitungPaginasi(halamanDiminta, total);

  // Urutan dan kata kunci dikumpulkan sekali, lalu dipakai pengalihan, navigasi
  // halaman, kepala kolom, dan kotak cari. Empat salinan dari daftar yang sama
  // adalah empat tempat yang akan menyimpang — dan yang menyimpang adalah
  // saringan yang hilang tanpa suara saat admin menekan salah satu tombolnya.
  //
  // `urut: 'terbaru'` dibuang dari tautan karena ia bakunya: URL yang menuliskan
  // nilai baku tidak salah, tapi ia membuat tautan "Berikutnya" berbeda
  // tergantung dari mana admin datang, dan itu menyulitkan membandingkan dua URL.
  const kueriAktif = {
    urut: urutAktif === 'terbaru' ? undefined : urutAktif,
    q: kataKunci === '' ? undefined : kataKunci,
  };

  // Nomor di luar jangkauan DIALIHKAN, tidak dibetulkan diam-diam: sebelumnya
  // `?halaman=999` pada 30 baris merender tabel kosong dengan tulisan "Halaman
  // 999 dari 2" dan hanya tombol "Sebelumnya" — yang membawa ke 998, juga
  // kosong. Admin harus menyunting URL dengan tangan untuk keluar, dan URL
  // halaman admin memang di-bookmark lalu dibuka lagi setelah barisnya
  // berkurang.
  //
  // Urutan dan kata kunci ikut dibawa. Jumlah halaman HASIL PENCARIAN jauh lebih
  // kecil daripada jumlah halaman seluruh inventori, jadi `?q=jakarta&halaman=9`
  // adalah URL yang biasa terjadi — dan pengalihan yang membuang `q` mendaratkan
  // admin di seluruh inventori tanpa satu pun petunjuk bahwa pencariannya batal.
  if (paginasi.terlaluJauh) {
    redirect(urlHalaman('/admin/billboards', paginasi.totalHalaman, kueriAktif));
  }

  const { halaman, totalHalaman } = paginasi;

  return (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">Inventory Billboard</h1>
                <p className="text-gray-500 text-sm">Kelola data asset dan detail lokasi.</p>
            </div>
            <Link href="/admin/billboards/form" className="bg-utero hover:bg-red-700 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-lg transition w-fit">
                <Plus size={20}/> Tambah Titik Baru
            </Link>
        </div>

        {/* Urutan ikut dibawa sebagai medan tersembunyi. Tanpa itu, menekan Cari
            mengembalikan urutan ke bakunya tanpa satu pun tanda — dan admin yang
            baru mengurutkan menurut harga akan membaca hasil pencarian sebagai
            hasil yang masih terurut. */}
        <KotakCari
          basis="/admin/billboards"
          nilai={kataKunci}
          label="Cari titik berdasarkan judul, SKU, atau alamat"
          placeholder="Cari judul, SKU, atau alamat…"
          tersembunyi={{ urut: kueriAktif.urut }}
        />

        {/* Tanpa pembungkus penggulung, luberan tabel ini bocor ke `<body>`:
            yang menggulung adalah SELURUH halaman, jadi header dan sidebar
            admin ikut bergeser mengikuti kolom yang dikejar. `overflow-x-auto`
            menahan gulungan di dalam kartunya sendiri.

            `overflow-hidden` di pembungkus luar khusus untuk sudut membulat —
            tanpanya baris pertama tabel menutupi lengkungan `rounded-xl`; ia
            tidak boleh dipasang pada elemen yang sama dengan `overflow-x-auto`,
            karena sudut membulatnya hilang saat gulungan aktif. */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[820px]">
                <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-100">
                    <tr>
                        {/* Kolom Foto tidak bisa diurutkan, dan itu disengaja:
                            urutan menurut URL gambar bukan urutan yang punya
                            arti bagi siapa pun. Kepala kolom yang bisa diklik
                            tanpa menghasilkan urutan yang berguna hanya
                            mengajak salah klik. */}
                        <th className="px-6 py-4">Foto</th>
                        <KepalaUrut
                          className="px-6 py-4"
                          label="Info Produk"
                          basis="/admin/billboards"
                          urutAktif={urutAktif}
                          naik="judul-naik"
                          turun="judul-turun"
                          parameter={kueriAktif}
                        />
                        {/* Kolom "Audit (Admin)" menampilkan pengubah TERAKHIR
                            beserta waktunya, jadi urutannya `updatedAt` — yaitu
                            `terbaru`/`terlama`, kunci yang sama dengan urutan
                            bakunya. Mengurutkan menurut NAMA pengubah akan
                            mengurutkan relasi, dan nama itu bukan yang dicari
                            admin saat ia menekan kolom ini. */}
                        <KepalaUrut
                          className="px-6 py-4"
                          label="Audit (Admin)"
                          basis="/admin/billboards"
                          urutAktif={urutAktif}
                          naik="terlama"
                          turun="terbaru"
                          parameter={kueriAktif}
                        />
                        {/* Satu kolom, dua angka — status dan harga — jadi ia
                            punya dua kepala urut berdampingan. Menaruh keduanya
                            di satu tautan berarti salah satunya tidak pernah
                            bisa diminta. */}
                        <th className="px-6 py-4" aria-sort={
                          urutAktif === 'status-naik' ? 'ascending'
                          : urutAktif === 'status-turun' ? 'descending'
                          : 'none'
                        }>
                          <span className="flex flex-col gap-1">
                            <Link
                              href={urlHalaman('/admin/billboards', 1, {
                                ...kueriAktif,
                                urut: urutAktif === 'status-naik' ? 'status-turun' : 'status-naik',
                              })}
                              className="inline-flex items-center gap-1 hover:text-gray-800"
                            >
                              Status
                              <span aria-hidden="true" className={urutAktif.startsWith('status-') ? 'text-utero' : 'text-gray-300'}>
                                {urutAktif === 'status-naik' ? '▲' : urutAktif === 'status-turun' ? '▼' : '↕'}
                              </span>
                            </Link>
                            <Link
                              href={urlHalaman('/admin/billboards', 1, {
                                ...kueriAktif,
                                urut: urutAktif === 'harga-naik' ? 'harga-turun' : 'harga-naik',
                              })}
                              className="inline-flex items-center gap-1 text-[10px] font-bold hover:text-gray-800"
                            >
                              Harga
                              <span aria-hidden="true" className={urutAktif.startsWith('harga-') ? 'text-utero' : 'text-gray-300'}>
                                {urutAktif === 'harga-naik' ? '▲' : urutAktif === 'harga-turun' ? '▼' : '↕'}
                              </span>
                            </Link>
                          </span>
                        </th>
                        <th className="px-6 py-4 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                    {billboards.length === 0 ? (
                        // Keadaan kosong membedakan "tidak ada yang cocok" dari
                        // "belum ada data". Keduanya terlihat sama di layar, dan
                        // yang pertama membuat admin menyimpulkan titiknya sudah
                        // terhapus.
                        <tr><td colSpan={5} className="p-8 text-center text-gray-400">
                          {kataKunci !== ''
                            ? `Tidak ada titik yang cocok dengan "${kataKunci}".`
                            : 'Belum ada data.'}
                        </td></tr>
                    ) : billboards.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition group">

                            <td className="px-6 py-3 w-24">
                                <Link href={`/billboard/${item.slug}`} target="_blank">
                                    {/*
                                      `<img>` biasa, bukan `next/image`:
                                      `mainImage` diisi admin dan boleh menunjuk
                                      ke penyimpanan mana pun, sedangkan
                                      `remotePatterns` di next.config.ts hanya
                                      memuat tiga host. `next/image` MELEMPAR
                                      saat dijalankan untuk sumber di luar
                                      daftar itu, jadi satu billboard dengan
                                      host baru akan menjatuhkan seluruh daftar
                                      inventori admin.

                                      `alt` dulu tidak ada. Sel ini adalah
                                      TAUTAN ke halaman produk, dan tautan yang
                                      isinya hanya gambar tanpa alt dibacakan
                                      pembaca layar sebagai URL berkasnya —
                                      operator yang memakainya tidak punya cara
                                      tahu baris mana yang sedang dibukanya.
                                    */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.mainImage} alt={`Foto ${item.title}`} className="w-20 h-12 object-cover rounded bg-gray-200 border hover:scale-110 transition cursor-pointer" />
                                </Link>
                            </td>

                            <td className="px-6 py-3 max-w-[250px]">
                                <div className="font-bold text-gray-800 line-clamp-1">{item.title}</div>
                                <div className="text-[10px] font-mono text-gray-400 mt-0.5">{item.sku || '-'}</div>
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1 line-clamp-1">
                                    <MapPin size={12}/> {item.address}
                                </div>
                            </td>

                            <td className="px-6 py-3">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center text-[9px] font-bold">
                                            {item.updatedBy?.name?.charAt(0) || "S"}
                                        </div>
                                        <span className="text-xs font-bold text-gray-700">{item.updatedBy?.name || "System"}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                        <Clock size={10}/> {tanggalRingkas(item.updatedAt)}
                                    </div>
                                </div>
                            </td>

                            <td className="px-6 py-3">
                                <StatusChanger billboardId={item.id} currentStatus={item.status} currentPublishStatus={item.publishStatus || 'DRAFT'} />
                                <div className="font-bold text-gray-800 text-xs mt-1">Rp {angkaRupiah(item.price)}</div>
                            </td>

                            <td className="px-6 py-3">
                                <div className="flex justify-center gap-2">
                                    <Link href={`/billboard/${item.slug}`} target="_blank" className="p-2 text-green-600 hover:bg-green-50 rounded border border-green-200 transition"><Eye size={16}/></Link>
                                    <Link href={`/admin/billboards/form?id=${item.id}`} className="p-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition"><Edit size={16}/></Link>
                                    <DeleteBillboardBtn id={item.id} title={item.title} />
                                </div>
                            </td>

                        </tr>
                    ))}
                </tbody>
            </table>
          </div>

            {/* Navigasi halaman DI LUAR pembungkus penggulung. Di dalamnya, ia
                ikut bergeser bersama tabel — admin yang menggulung ke kanan
                untuk melihat kolom Aksi kehilangan tombol "Berikutnya" di
                sebelah kiri. */}
            <div className="border-t border-gray-100 px-6 py-4">
              <NavigasiHalaman
                basis="/admin/billboards"
                halaman={halaman}
                totalHalaman={totalHalaman}
                total={total}
                satuan="titik"
                parameter={kueriAktif}
              />
            </div>
        </div>
    </div>
  );
}
