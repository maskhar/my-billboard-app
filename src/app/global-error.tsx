'use client';

// Jaring terakhir: galat yang terjadi DI DALAM `layout.tsx` sendiri.
//
// `error.tsx` dirender di dalam layout, jadi ia tidak bisa menangkap galat yang
// membuat layout itu gagal — termasuk galat di `Providers`. Tanpa berkas ini
// kasus tersebut berakhir sebagai halaman putih kosong tanpa satu pun tulisan.
//
// Karena menggantikan seluruh dokumen, komponen ini WAJIB merender `<html>` dan
// `<body>` sendiri. Ia juga tidak boleh bergantung pada apa pun dari layout yang
// baru saja gagal: tidak ada `Providers`, tidak ada `Navbar`, dan gayanya
// ditulis inline supaya tetap terbaca walau CSS global ikut gagal dimuat.

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="id">
            <body
                style={{
                    margin: 0,
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f9fafb',
                    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
                    padding: '24px',
                }}
            >
                <div
                    style={{
                        maxWidth: '32rem',
                        width: '100%',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '16px',
                        padding: '32px',
                    }}
                >
                    <h1 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>
                        Aplikasi gagal dimuat
                    </h1>
                    <p
                        style={{
                            fontSize: '14px',
                            color: '#4b5563',
                            lineHeight: 1.6,
                            marginTop: '12px',
                        }}
                    >
                        Gangguan terjadi di sisi kami. Data Anda tidak berubah. Coba muat ulang
                        halaman; bila masih gagal, hubungi kami dan sebutkan kode di bawah.
                    </p>

                    {error.digest && (
                        <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '16px' }}>
                            Kode kejadian:{' '}
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#374151' }}>
                                {error.digest}
                            </span>
                        </p>
                    )}

                    <button
                        onClick={reset}
                        style={{
                            marginTop: '24px',
                            backgroundColor: '#111827',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: 'pointer',
                        }}
                    >
                        Coba lagi
                    </button>
                </div>
            </body>
        </html>
    );
}
