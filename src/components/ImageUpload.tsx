'use client';

import { useState, useEffect } from 'react';
import { CldUploadWidget, type CloudinaryUploadWidgetResults } from 'next-cloudinary';
// `Image as ImageIcon` dibuang dari impor: ia tidak dirender di satu tempat pun
// di berkas ini.
import { Trash, Loader2, UploadCloud, Server, Cloud } from 'lucide-react';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { useToast } from '@/components/ui/Toast';

interface ImageUploadProps {
    value: string;
    onChange: (src: string) => void;
    /**
     * Apa yang sedang diunggah — "Cover Image", "Foto Lokasi".
     *
     * Prop ini DITERIMA tapi tidak dirender di satu tempat pun, dan dua
     * pemanggil sudah mengirimnya (`billboards/form` dan `orders/[id]`).
     * Artinya dua admin memberi nama dua kotak unggah yang berbeda dan
     * keduanya tampil tanpa nama: kotak di halaman pesanan hanya berbunyi
     * "Klik atau seret file ke sini", tanpa satu pun tanda bahwa yang diminta
     * adalah FOTO LOKASI PEMASANGAN. Sekarang dipakai di kedua cabang render.
     */
    label?: string;
}

export default function ImageUpload({ value, onChange, label = "Upload Gambar" }: ImageUploadProps) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    
    // STATE PILIHAN MODE: 'LOCAL' atau 'CLOUD'
    const [storageMode, setStorageMode] = useState<'LOCAL' | 'CLOUD'>('LOCAL');

    // Hindari hydration mismatch
    useEffect(() => { setMounted(true); }, []);

    // 1. LOGIKA CLOUD (CLOUDINARY)
    //
    // `result: any` dulu tertulis di sini, dan `result.info.secure_url`
    // dibaca langsung. Tipe sungguhan dari pustakanya berbunyi
    // `info?: string | CloudinaryUploadWidgetInfo` — jadi `info` boleh TEKS dan
    // boleh tidak ada. Pada bentuk itu `.secure_url` bernilai `undefined`
    // (`'teks'.secure_url` tidak melempar), sehingga `onChange(undefined)`
    // MENGOSONGKAN kolom gambar yang tadi sudah terisi — persis setelah admin
    // melihat widget Cloudinary melaporkan unggahannya berhasil.
    const onCloudUpload = (result: CloudinaryUploadWidgetResults) => {
        const info = result.info;
        if (typeof info !== 'object' || info === null) {
            toast.galat('Unggahan Cloudinary tidak memulangkan tautan gambar. Coba lagi.');
            return;
        }
        const tautan = info.secure_url;
        if (typeof tautan !== 'string' || tautan.trim() === '') {
            toast.galat('Unggahan Cloudinary tidak memulangkan tautan gambar. Coba lagi.');
            return;
        }
        onChange(tautan);
    };

    // 2. LOGIKA LOCAL (API SENDIRI)
    //
    // Empat cacat ditambal di sini sekaligus:
    //
    //   1. `data.error` dibacakan sebagai pesan penolakan. `/api/upload`
    //      memulangkan `{ message }` pada SETIAP penolakannya — 401, 400 format
    //      salah, 400 isi tidak cocok, 403, 429, 500 — jadi admin selalu
    //      membaca "Gagal Upload Lokal: undefined" dan tidak pernah tahu
    //      sebabnya. "Login dulu" dan "Format harus Gambar" menuntut tindakan
    //      yang sama sekali berbeda.
    //   2. `await res.json()` tanpa penjaga. Balasan 500 berbadan HTML
    //      membuatnya melempar, lemparannya mendarat di `catch` di bawah, dan
    //      pesan server yang sebenarnya hilang di balik "Error sistem upload".
    //   3. `data.url` diteruskan tanpa diperiksa. Respons 200 tanpa `url`
    //      menyetel kolom gambar menjadi `undefined`, jadi form yang tadi punya
    //      gambar menjadi kosong SETELAH unggahan yang berhasil.
    //   4. Kotak berkas tidak pernah dikosongkan. `<input type="file">` tidak
    //      memicu `change` bila nilainya tidak berubah, jadi setelah gagal,
    //      memilih berkas yang sama tidak melakukan apa pun sama sekali.
    //
    // Batas ukurannya juga disamakan dengan `MAX_BYTES` di route (10MB). Dua
    // angka yang berbeda berarti berkas 7MB ditolak di sini dengan alasan
    // "File max 5MB" padahal server menerimanya.
    const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const kotak = e.currentTarget;
        const file = kotak.files?.[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            kotak.value = '';
            toast.galat('Berkas terlalu besar. Maksimal 10 MB.');
            return;
        }

        setLoading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const jawaban = await bacaJawaban(res);

            if (!res.ok) {
                toast.galat('Unggahan gagal: ' + alasanPenolakan(res, jawaban));
                return;
            }
            if (!jawaban.url) {
                toast.galat('Berkas terunggah, tapi server tidak memulangkan tautannya. Coba unggah ulang.');
                return;
            }
            onChange(jawaban.url); // Simpan path lokal
        } catch (galat) {
            console.error('Gagal mengunggah gambar ke server lokal:', galat);
            toast.galat('Server tidak dapat dihubungi. Berkas belum terunggah.');
        } finally {
            // Di `finally`: setiap `return` lebih awal di atas melewati baris
            // ini bila ia diletakkan di akhir fungsi, dan area unggah
            // tertinggal berkata "Sedang Mengompres..." selamanya.
            kotak.value = '';
            setLoading(false);
        }
    };

        if (!mounted) return null;

    // JIKA TIDAK ADA GAMBAR (TAMPILAN UPLOAD)
    if (!value) {
        return (
            <div className="w-full p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">{label}</p>
                {/* A. SWITCHER MODE (TAB) */}
                <div className="flex bg-gray-100 p-1 rounded-lg mb-3">
                    <button 
                        type="button"
                        onClick={() => setStorageMode('LOCAL')}
                        className={`flex-1 py-2 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition ${storageMode === 'LOCAL' ? 'bg-white shadow text-utero' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                        <Server size={14}/> Server Lokal (Compress)
                    </button>
                    <button 
                        type="button"
                        onClick={() => setStorageMode('CLOUD')}
                        className={`flex-1 py-2 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition ${storageMode === 'CLOUD' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                        <Cloud size={14}/> CDN (Cloudinary)
                    </button>
                </div>
    
                {/* B. AREA EKSEKUSI SESUAI MODE */}
                <div className="relative w-full">
                    {/* --- MODE LOKAL --- */}
                    {storageMode === 'LOCAL' && (
                        <div className={`relative w-full aspect-video flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 p-4 rounded-xl text-center text-gray-500 hover:border-utero hover:bg-red-50/50 hover:text-utero transition cursor-pointer ${loading ? 'opacity-50' : ''}`}>
                            <input 
                                type="file" accept="image/*"
                                onChange={handleLocalUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                disabled={loading}
                            />
                            {loading ? <Loader2 size={32} className="animate-spin"/> : <UploadCloud size={32}/>}
                            <p className="font-bold text-sm mt-2">
                                {loading ? "Sedang Mengompres..." : "Klik atau seret file ke sini"}
                            </p>
                            {/* "Max 5MB" dulu tertulis di sini padahal `MAX_BYTES`
                                di route bernilai 10MB — admin membuang berkas 7MB
                                yang sebenarnya diterima server. */}
                            <p className="text-xs text-gray-400">Max 10MB. Format WebP Otomatis.</p>
                        </div>
                    )}
    
                    {/* --- MODE CLOUD --- */}
                    {storageMode === 'CLOUD' && (
                        <CldUploadWidget 
                            uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_PRESET}
                            options={{ maxFiles: 1, resourceType: "image" }}
                            onSuccess={onCloudUpload}
                        >
                            {({ open }) => (
                                <button 
                                    type="button" 
                                    onClick={() => open?.()}
                                    className="w-full aspect-video flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 p-4 rounded-xl text-center text-blue-500 hover:border-blue-500 hover:bg-blue-50 transition"
                                >
                                    <Cloud size={32}/>
                                    <span className="font-bold text-sm mt-2">Buka Widget Cloudinary</span>
                                    <span className="text-xs text-blue-400">Ukuran tak terbatas. Optimalisasi otomatis.</span>
                                </button>
                            )}
                        </CldUploadWidget>
                    )}
                </div>
            </div>
        );
    }

    // JIKA GAMBAR SUDAH ADA (TAMPILAN PREVIEW)
    return (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-gray-200 group bg-gray-100 flex items-center justify-center">
            <button 
                type="button" 
                onClick={() => onChange("")} 
                className="absolute top-2 right-2 z-10 bg-red-600/80 backdrop-blur-sm text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 hover:scale-110 transition-all duration-200"
                aria-label={`Hapus ${label}`}
            >
                <Trash size={16}/>
            </button>
            {/*
              `<img>` biasa, bukan `next/image`: `value` di sini bisa berupa
              path lokal (`/uploads/...`), URL Cloudinary, atau URL yang
              ditempel admin sendiri — host mana pun. `remotePatterns` di
              next.config.ts hanya memuat tiga, dan `next/image` melempar saat
              dijalankan untuk sumber di luar daftar itu: pratinjau yang gagal
              akan menjatuhkan seluruh form.

              `alt="Preview"` dulu tertulis di sini — kata yang tidak
              memberi tahu apa pun. Sekarang menyebut apa yang diunggah,
              dan `label` pula yang dipakai tombol hapus di atasnya.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={`Pratinjau ${label}`} className="h-full w-full object-contain" />
        </div>
    );
}

// Hapus export default ganda
// export default ImageUpload;