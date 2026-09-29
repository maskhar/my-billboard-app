// Keadaan memuat halaman invoice.
//
// Bentuknya berbeda dari kerangka lain di aplikasi ini, dan sengaja: halaman
// invoice TIDAK memakai `Navbar`. Chrome-nya adalah halaman kelabu
// (`bg-gray-100 min-h-screen py-10`) dengan satu lembar putih selebar A4
// (`max-w-[21cm]`) di tengahnya. Kerangka yang memasang batang navigasi di sini
// akan menggeser seluruh lembar saat halaman aslinya menggantikannya.
//
// `print:` sengaja TIDAK diikutkan. Berkas ini tidak pernah menjadi yang
// dicetak: kalau pengguna menekan Ctrl+P, yang tercetak adalah halaman aslinya
// yang sudah selesai dimuat. Menyalin varian cetak ke kerangka hanya menambah
// aturan yang tidak pernah berlaku.
//
// TIDAK ADA SATU PUN NOMINAL DI KERANGKA INI
// ------------------------------------------
// Ini dokumen tagihan. Kotak kelabu yang kebetulan terbaca sebagai "Rp 0" pada
// invoice adalah kesalahan yang paling mahal di seluruh aplikasi — jadi yang
// digambar hanya bentuk barisnya, tanpa angka, tanpa "0", tanpa "—".
//
// `<main>` mengikuti halaman aslinya: lembar invoice itulah wilayah utamanya, dan
// karena tidak ada `Navbar`, tidak ada tautan lewati — landmark ini satu-satunya
// pegangan pembaca layar di sini.
//
// Server Component tanpa JavaScript — hanya animasi CSS.

export default function InvoiceLoading() {
  return (
    <div className="bg-gray-100 min-h-screen py-10 font-sans">
      <main
        className="max-w-[21cm] mx-auto bg-white shadow-lg p-12 rounded-xl animate-pulse"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Kepala: identitas penerbit di kiri, nomor invoice di kanan. */}
        <div className="flex justify-between items-start gap-8 pb-8 border-b border-gray-100">
          <div className="space-y-3">
            <div className="h-6 w-44 bg-gray-200 rounded" />
            <div className="h-3 w-56 bg-gray-100 rounded" />
            <div className="h-3 w-40 bg-gray-100 rounded" />
          </div>
          <div className="space-y-3 text-right">
            <div className="h-7 w-32 bg-gray-200 rounded ml-auto" />
            <div className="h-3 w-40 bg-gray-100 rounded ml-auto" />
            <div className="h-3 w-28 bg-gray-100 rounded ml-auto" />
          </div>
        </div>

        {/* Ditagihkan kepada. */}
        <div className="grid grid-cols-2 gap-8 py-8">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-2.5 w-28 bg-gray-100 rounded" />
              <div className="h-4 w-44 bg-gray-200 rounded" />
              <div className="h-3 w-52 bg-gray-100 rounded" />
            </div>
          ))}
        </div>

        {/* Baris rincian. Kolom kanan dibiarkan kosong — tidak ada angka. */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="h-10 bg-gray-100" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-6 px-6 py-5 border-t border-gray-100"
            >
              <div className="h-3.5 flex-1 max-w-xs bg-gray-100 rounded" />
              <div className="h-3.5 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>

        {/* Rekapitulasi. */}
        <div className="flex justify-end pt-8">
          <div className="w-full max-w-xs space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex justify-between gap-6">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
            ))}
            <div className="h-px w-full bg-gray-200" />
            <div className="flex justify-between gap-6">
              <div className="h-5 w-24 bg-gray-200 rounded" />
              <div className="h-5 w-28 bg-gray-200 rounded" />
            </div>
          </div>
        </div>

        <span className="sr-only">Memuat invoice…</span>
      </main>
    </div>
  );
}
