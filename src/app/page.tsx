import Navbar from '@/components/Navbar';
import SearchFilter from '@/components/SearchFilter';
import MapWrapper from '@/components/MapWrapper';
import ChatWidget from '@/components/ChatWidget';
import { prisma } from '@/lib/prisma';
import { uangUntukClient } from '@/lib/money';

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
async function getBillboards(query: string, type: string) {
  try {
    return await prisma.billboard.findMany({
      where: {
        status: 'Available',
        publishStatus: 'PUBLISHED',
        ...(type !== 'Semua' ? { type } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' as const } },
                { address: { contains: query, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
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
  } catch (error) {
    console.error('Gagal mengambil data billboard:', error);
    return [];
  }
}

// MENANGKAP URL SEARCH PARAM
type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams: searchParamsProp }: Props) {
  const searchParams = await searchParamsProp;

  const query = (searchParams.q as string) || '';
  const type = (searchParams.type as string) || 'Semua';

  // Penyaringan kini terjadi di database, bukan setelah data sampai.
  const filteredBillboards = (await getBillboards(query, type)).map((b) => ({
    ...b,
    price: uangUntukClient(b.price),
  }));

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
             </div>
        </div>
        <ChatWidget />
      </div>
    </main>
  );
}