'use client';

import { useState, useEffect } from 'react';
import { CldUploadWidget } from 'next-cloudinary';
import { Image as ImageIcon, Trash, Loader2, UploadCloud, Server, Cloud } from 'lucide-react';

interface ImageUploadProps {
    value: string;
    onChange: (src: string) => void;
    label?: string;
}

export default function ImageUpload({ value, onChange, label = "Upload Gambar" }: ImageUploadProps) {
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    
    // STATE PILIHAN MODE: 'LOCAL' atau 'CLOUD'
    const [storageMode, setStorageMode] = useState<'LOCAL' | 'CLOUD'>('LOCAL');

    // Hindari hydration mismatch
    useEffect(() => { setMounted(true); }, []);

    // 1. LOGIKA CLOUD (CLOUDINARY)
    const onCloudUpload = (result: any) => {
        onChange(result.info.secure_url);
    };

    // 2. LOGIKA LOCAL (API SENDIRI)
    const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // Limit 5MB di Client sebelum dikirim
        if (file.size > 5 * 1024 * 1024) return alert("File max 5MB");

        setLoading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await res.json();
            
            if (res.ok) {
                onChange(data.url); // Simpan path lokal
            } else {
                alert("Gagal Upload Lokal: " + data.error);
            }
        } catch (err) { alert("Error sistem upload"); } 
        finally { setLoading(false); }
    };

        if (!mounted) return null;

    // JIKA TIDAK ADA GAMBAR (TAMPILAN UPLOAD)
    if (!value) {
        return (
            <div className="w-full p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
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
                            <p className="text-xs text-gray-400">Max 5MB. Format WebP Otomatis.</p>
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
                aria-label="Remove image"
            >
                <Trash size={16}/>
            </button>
            <img src={value} alt="Preview" className="h-full w-full object-contain" />
        </div>
    );
}

// Hapus export default ganda
// export default ImageUpload;