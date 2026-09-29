// Keadaan memuat halaman produk billboard.
//
// Halaman ini `dynamic = 'force-dynamic'` (lihat `page.tsx:13`) dan melakukan
// tiga pembacaan database sebelum satu piksel pun bisa dirender. Tanpa berkas
// ini Next.js menahan layar SEBELUMNYA sampai semuanya selesai: pengunjung yang
// mengklik sebuah titik di peta melihat peta itu diam, tidak tahu kliknya
// terbaca, lalu mengklik titik lain. Halaman inilah yang dituju iklan dan hasil
// pencarian — layar diam di sini adalah pengunjung yang hilang.
//
// BUKAN `Navbar` YANG DIPAKAI DI SINI
// ----------------------------------
// `Navbar` adalah Client Component yang memanggil `useSession()`. Memasangnya
// di keadaan memuat berarti mengirim JavaScript dan menunggu sesi hanya untuk
// menggambar kerangka. Yang dipasang adalah batang statis setinggi `h-16` —
// sama dengan tinggi navigasi aslinya — supaya isi di bawahnya tidak melompat
// saat halaman sebenarnya menggantikan kerangka ini. Navigasi asli muncul
// bersama halamannya.
//
// `<main>` tetap ada: berkas ini MENGGANTI `page.tsx` selama pemuatan, jadi
// tanpa `<main>` di sini pembaca layar kehilangan landmark utamanya justru pada
// saat halaman paling butuh diumumkan. Hanya satu `<main>` yang pernah dirender
// — kerangka ini dan halaman aslinya tidak pernah tampil bersamaan.
//
// Server Component tanpa JavaScript — hanya animasi CSS.

export default function BillboardLoading() {
  return (
    <div className="bg-gray-50 min-h-screen font-sans pb-20">
      {/* Pengganti batang navigasi: menahan tinggi, tidak memuat logika. */}
      <div className="fixed top-0 w-full h-16 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm" />

      <main className="animate-pulse" aria-busy="true" aria-live="polite">
        {/* Hero: ukuran dan `mt-16` mengikuti hero aslinya persis, supaya
            pergantian kerangka ke halaman tidak menggeser apa pun. */}
        <div className="relative mt-16 w-full h-[50vh] lg:h-[60vh] bg-gray-200" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Kolom kiri: galeri, lokasi, spesifikasi. */}
            <div className="lg:col-span-2 space-y-10">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white p-8 rounded-3xl border border-gray-100 space-y-4"
                >
                  <div className="h-5 w-48 bg-gray-200 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-5/6 bg-gray-100 rounded" />
                  <div className="h-3 w-2/3 bg-gray-100 rounded" />
                </div>
              ))}
            </div>

            {/* Kolom kanan: kartu harga dan kalender ketersediaan. */}
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-4">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-8 w-40 bg-gray-200 rounded" />
                <div className="h-11 w-full bg-gray-200 rounded-xl" />
              </div>
              <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-3">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 28 }, (_, i) => (
                    <div key={i} className="h-7 bg-gray-100 rounded" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <span className="sr-only">Memuat data titik billboard…</span>
      </main>
    </div>
  );
}
