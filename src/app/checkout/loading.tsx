// Keadaan memuat halaman checkout.
//
// Halaman ini membaca sesi, billboard, dan profil pengguna sebelum merender.
// Ini juga langkah PERTAMA alur pembayaran: pembeli baru saja menekan "Sewa
// Sekarang" dan sedang memutuskan apakah akan meneruskan. Layar lama yang
// bertahan diam di titik itu terbaca sebagai tombol yang tidak berfungsi, dan
// pembeli yang mengklik dua kali membuka dua kali alur yang sama.
//
// Alasan batang navigasi statis, `<main>`, dan ketiadaan JavaScript sama dengan
// `src/app/billboard/[slug]/loading.tsx` — penjelasan lengkapnya ada di sana.

export default function CheckoutLoading() {
  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <div className="fixed top-0 w-full h-16 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm" />

      <main
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 animate-pulse"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-7 w-72 bg-gray-200 rounded mb-8" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulir: data pemesan lalu rentang tanggal. */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-5">
              <div className="h-5 w-40 bg-gray-200 rounded" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-28 bg-gray-100 rounded" />
                  <div className="h-11 w-full bg-gray-100 rounded-lg" />
                </div>
              ))}
            </div>
            <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-5">
              <div className="h-5 w-48 bg-gray-200 rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="h-11 bg-gray-100 rounded-lg" />
                <div className="h-11 bg-gray-100 rounded-lg" />
              </div>
            </div>
          </div>

          {/* Ringkasan biaya. */}
          <div className="bg-white p-8 rounded-3xl border border-gray-100 space-y-4 h-fit">
            <div className="h-5 w-36 bg-gray-200 rounded" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between gap-4">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
            ))}
            <div className="h-px w-full bg-gray-100" />
            <div className="h-7 w-44 bg-gray-200 rounded" />
            <div className="h-12 w-full bg-gray-200 rounded-xl" />
          </div>
        </div>

        <span className="sr-only">Memuat rincian pesanan…</span>
      </main>
    </div>
  );
}
