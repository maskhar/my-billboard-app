// Keadaan memuat halaman pelacakan pesanan.
//
// Berlaku untuk `/dashboard/order/[id]` DAN `/dashboard/order/[id]/payment`:
// keduanya memakai chrome yang sama (`Navbar` lalu `max-w-5xl mx-auto px-4
// pt-24`), jadi satu kerangka di segmen induk melayani keduanya. Yang kedua
// adalah halaman bayar — tempat pembeli menunggu kunci sesi Xendit — dan di
// sanalah layar diam paling mahal: pembeli yang tidak melihat tanda apa pun
// memuat ulang halaman, dan pemuatan ulang di tengah pembuatan sesi adalah
// bagaimana satu pesanan berakhir dengan dua sesi pembayaran.
//
// Kerangka ini TIDAK menggambar kotak nominal apa pun. Angka uang yang tampil
// sebagai nol selama pemuatan tidak bisa dibedakan dari tagihan yang sudah lunas
// — dan keputusan pembeli untuk membayar atau tidak bergantung pada angka itu.
// Yang digambar hanya bentuk kartunya.
//
// Alasan batang navigasi statis, `<main>`, dan ketiadaan JavaScript sama dengan
// `src/app/billboard/[slug]/loading.tsx`.

export default function OrderLoading() {
  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <div className="fixed top-0 w-full h-16 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm" />

      <main
        className="max-w-5xl mx-auto px-4 pt-24 animate-pulse"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-4 w-48 bg-gray-100 rounded mb-6" />

        <div className="bg-white p-8 rounded-3xl border border-gray-100">
          <div className="flex justify-between items-start border-b border-gray-100 pb-6 mb-8 gap-4">
            <div className="space-y-2">
              <div className="h-7 w-56 bg-gray-200 rounded" />
              <div className="h-3 w-40 bg-gray-100 rounded" />
            </div>
            <div className="h-9 w-40 bg-gray-100 rounded-lg" />
          </div>

          {/* Garis waktu status. */}
          <div className="space-y-6 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 w-44 bg-gray-200 rounded" />
                  <div className="h-3 w-64 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>

          <div className="h-px w-full bg-gray-100 mb-8" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-2.5 w-24 bg-gray-100 rounded" />
                <div className="h-4 w-36 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>

        <span className="sr-only">Memuat rincian pesanan…</span>
      </main>
    </div>
  );
}
