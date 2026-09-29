// Keadaan memuat area dashboard pembeli.
//
// Berlaku untuk `/dashboard` DAN `/dashboard/settings`: `layout.tsx` di segmen
// ini hanya menyetel metadata dan mengembalikan `children`, jadi tidak ada shell
// yang bisa dipakai bersama — kerangka ini yang menggambar chrome-nya sendiri,
// mengikuti `DashboardLayout.tsx` (`pt-20 pb-10 md:py-24` di dalam `max-w-7xl`).
// `/dashboard/order/[id]` punya kerangkanya sendiri yang lebih dekat dengan
// bentuk halamannya.
//
// `DashboardWrapper` menjalankan beberapa agregasi sekaligus — pesanan aktif,
// riwayat, dan total belanja — sebelum satu baris pun bisa dirender.
//
// KERANGKA, BUKAN ANGKA NOL
// -------------------------
// Semua kotak di sini kosong; tidak ada satu pun yang menuliskan "0" atau "Rp
// 0". Kartu ringkasan di halaman ini menampilkan total belanja, dan nol yang
// tampil selama pemuatan tidak bisa dibedakan dari nol yang benar — pembeli yang
// melihatnya mengira riwayat belanjanya hilang. Alasan yang sama ditulis di
// `src/app/admin/(dashboard)/error.tsx`.
//
// Alasan batang navigasi statis, `<main>`, dan ketiadaan JavaScript sama dengan
// `src/app/billboard/[slug]/loading.tsx`.

export default function DashboardLoading() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="fixed top-0 w-full h-16 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm" />

      <main
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-10 md:py-24 animate-pulse"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="space-y-2 mb-8">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-3 w-80 bg-gray-100 rounded" />
        </div>

        {/* Kartu ringkasan. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 w-20 bg-gray-100 rounded" />
                <div className="h-4 w-28 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Tab aktif/riwayat lalu daftar kartu pesanan. */}
        <div className="flex gap-3 mb-6">
          <div className="h-10 w-32 bg-gray-200 rounded-xl" />
          <div className="h-10 w-32 bg-gray-100 rounded-xl" />
        </div>

        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4"
            >
              <div className="flex justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-56 bg-gray-200 rounded" />
                  <div className="h-3 w-40 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-24 bg-gray-100 rounded-full" />
              </div>
              <div className="h-px w-full bg-gray-100" />
              <div className="flex justify-between gap-4">
                <div className="h-3 w-32 bg-gray-100 rounded" />
                <div className="h-9 w-28 bg-gray-200 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        <span className="sr-only">Memuat pesanan Anda…</span>
      </main>
    </div>
  );
}
