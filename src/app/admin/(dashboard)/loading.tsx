// Keadaan memuat untuk area admin.
//
// Halaman-halaman di dashboard ini semuanya `dynamic = 'force-dynamic'` dan
// melakukan beberapa agregasi database sekaligus. Tanpa berkas ini, navigasi
// antar-halaman admin tidak memberi tanda apa pun: layar lama bertahan diam,
// dan admin yang tidak yakin kliknya terbaca akan mengkliknya lagi.
//
// Server Component tanpa JavaScript — hanya animasi CSS.

export default function AdminLoading() {
    return (
        <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
            <div className="space-y-2">
                <div className="h-6 w-56 bg-gray-200 rounded" />
                <div className="h-3 w-72 bg-gray-100 rounded" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[0, 1, 2, 3, 4, 5].map((i) => (
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

            <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-4">
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-4 bg-gray-100 rounded" />
                ))}
            </div>

            <span className="sr-only">Memuat data…</span>
        </div>
    );
}
