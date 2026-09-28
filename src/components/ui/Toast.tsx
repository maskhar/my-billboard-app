'use client';

// src/components/ui/Toast.tsx
//
// Pengganti `alert()` — 82 pemanggilan tersebar di 14 berkas.
//
// `alert()` punya empat masalah yang tidak bisa ditambal, hanya diganti:
//
//   1. IA MEMBEKUKAN SELURUH TAB. Bukan hanya komponennya: timer berhenti,
//      socket chat berhenti memproses pesan masuk, dan `router.refresh()` yang
//      sedang jalan menggantung sampai seseorang menekan OK. Pada halaman admin
//      yang memegang koneksi live-chat, satu `alert` yang tidak ditutup berarti
//      pesan pelanggan berhenti masuk tanpa satu pun tanda.
//   2. TEKSNYA TIDAK BISA DIBACA MESIN BANTU dengan benar, dan tidak bisa
//      diberi gaya. Pesan galat panjang muncul sebagai satu blok teks sistem
//      tanpa hierarki, di kotak yang di beberapa peramban memuat nama host
//      ("localhost:4000 says:") di atasnya.
//   3. IA MENUMPUK. Dua `alert` berturut-turut memaksa dua kali penekanan, dan
//      pada beberapa peramban yang kedua muncul dengan centang "jangan
//      tampilkan dialog lagi dari situs ini" — yang bila dicentang MEMATIKAN
//      seluruh jalur pemberitahuan aplikasi ini secara permanen.
//   4. `alert(objek)` mencetak "[object Object]".
//
// Yang dipertahankan dari `alert`: pesannya tetap muncul di atas segalanya, dan
// pesan GALAT tidak hilang sendiri. Yang berubah: halaman tetap hidup.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type NadaToast = 'sukses' | 'galat' | 'info';

type Toast = {
  id: number;
  nada: NadaToast;
  pesan: string;
};

// Sukses dan info menghilang sendiri; GALAT TIDAK.
//
// Pesan galat adalah satu-satunya yang menuntut tindakan pembaca ("Nominal
// melebihi sisa tagihan", "Email sudah terpakai"), dan pesan yang menghilang
// sendiri dalam empat detik adalah pesan yang dibaca separuh lalu ditebak.
// Galat ditutup oleh pembacanya, bukan oleh timer.
const UMUR_TOAST_MS: Record<NadaToast, number | null> = {
  sukses: 4500,
  info: 6000,
  galat: null,
};

// Batas antrian. Tanpa ini, satu perulangan yang memberitahu per-baris (mis.
// unggah sembilan gambar galeri yang semuanya gagal) menutupi seluruh layar
// dengan kartu dan tombolnya sendiri tidak bisa dijangkau lagi.
const MAKS_TOAST = 4;

type IsiKonteks = {
  tampilkan: (nada: NadaToast, pesan: string) => void;
};

const KonteksToast = createContext<IsiKonteks | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [daftar, setDaftar] = useState<Toast[]>([]);
  // Id naik monoton, bukan `Date.now()`: dua toast yang lahir di milidetik yang
  // sama akan berbagi key React, dan React menyatukannya menjadi satu kartu.
  const idBerikut = useRef(0);
  // Timer disimpan supaya `useEffect` pembersih bisa membatalkan semuanya saat
  // provider dilepas. Timer yang hidup setelah unmount memanggil `setDaftar`
  // pada komponen yang sudah mati.
  const timer = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const tutup = useCallback((id: number) => {
    const jam = timer.current.get(id);
    if (jam) {
      clearTimeout(jam);
      timer.current.delete(id);
    }
    setDaftar((sebelum) => sebelum.filter((t) => t.id !== id));
  }, []);

  const tampilkan = useCallback((nada: NadaToast, pesan: string) => {
    const id = (idBerikut.current += 1);
    setDaftar((sebelum) => {
      const berikut = [...sebelum, { id, nada, pesan }];
      // Yang dibuang adalah yang TERTUA. Pesan terbaru hampir selalu yang
      // paling relevan dengan apa yang baru saja ditekan pengguna.
      return berikut.length > MAKS_TOAST ? berikut.slice(berikut.length - MAKS_TOAST) : berikut;
    });

    const umur = UMUR_TOAST_MS[nada];
    if (umur !== null) {
      timer.current.set(
        id,
        setTimeout(() => {
          timer.current.delete(id);
          setDaftar((sebelum) => sebelum.filter((t) => t.id !== id));
        }, umur)
      );
    }
  }, []);

  useEffect(() => {
    const jamJam = timer.current;
    return () => {
      for (const jam of jamJam.values()) clearTimeout(jam);
      jamJam.clear();
    };
  }, []);

  const nilai = useMemo(() => ({ tampilkan }), [tampilkan]);

  return (
    <KonteksToast.Provider value={nilai}>
      {children}
      {/*
        Dua wilayah `aria-live` TERPISAH, bukan satu.
        ·
        `assertive` memotong apa pun yang sedang dibacakan pembaca layar;
        `polite` menunggu jeda. Pesan galat berhak memotong — pengguna baru saja
        menekan sesuatu dan perlu tahu itu tidak terjadi. Pemberitahuan sukses
        tidak berhak, dan menaruh keduanya di satu wilayah memaksa memilih salah
        satu untuk semuanya.
      */}
      <div
        aria-live="assertive"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100000] flex flex-col items-center gap-2 px-4 pt-4 sm:items-end sm:pr-6"
      >
        {daftar
          .filter((t) => t.nada === 'galat')
          .map((t) => (
            <KartuToast key={t.id} toast={t} onTutup={() => tutup(t.id)} />
          ))}
      </div>
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100000] flex flex-col items-center gap-2 px-4 pb-4 sm:items-end sm:pr-6"
      >
        {daftar
          .filter((t) => t.nada !== 'galat')
          .map((t) => (
            <KartuToast key={t.id} toast={t} onTutup={() => tutup(t.id)} />
          ))}
      </div>
    </KonteksToast.Provider>
  );
}

const GAYA: Record<NadaToast, { wadah: string; ikon: React.ReactNode; judul: string }> = {
  sukses: {
    wadah: 'bg-white border-green-200',
    ikon: <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />,
    judul: 'Berhasil',
  },
  galat: {
    wadah: 'bg-white border-red-200',
    ikon: <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />,
    judul: 'Gagal',
  },
  info: {
    wadah: 'bg-white border-gray-200',
    ikon: <Info size={18} className="text-gray-500 shrink-0 mt-0.5" />,
    judul: 'Pemberitahuan',
  },
};

function KartuToast({ toast, onTutup }: { toast: Toast; onTutup: () => void }) {
  const gaya = GAYA[toast.nada];
  return (
    <div
      // `role="alert"` hanya untuk galat. Pada nada lain ia akan memaksa
      // pembacaan segera untuk pesan yang tidak menuntut apa pun.
      role={toast.nada === 'galat' ? 'alert' : 'status'}
      className={`pointer-events-auto w-full max-w-sm rounded-xl border shadow-lg ${gaya.wadah} animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none`}
    >
      <div className="flex items-start gap-3 p-4">
        {gaya.ikon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-gray-500">{gaya.judul}</p>
          {/*
            `whitespace-pre-line` mempertahankan `\n` dari pesan yang diwarisi
            dari `alert`: beberapa di antaranya memang ditulis berbaris-baris.
            `break-words` menahan pesan galat server yang memuat satu kata
            sangat panjang (nama berkas, URL) agar tidak melebar keluar kartu.
          */}
          <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed text-gray-800">
            {toast.pesan}
          </p>
        </div>
        <button
          type="button"
          onClick={onTutup}
          aria-label="Tutup pemberitahuan"
          className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Pemanggil memakai `toast.sukses(...)` / `toast.galat(...)` / `toast.info(...)`.
 *
 * Melempar bila dipakai di luar `ToastProvider`. Itu disengaja: mengembalikan
 * fungsi kosong yang diam-diam tidak melakukan apa pun berarti sebuah
 * pemberitahuan galat lenyap tanpa jejak, dan itu justru keadaan yang paling
 * perlu terlihat. Provider-nya dipasang di `Providers.tsx` (layout akar), jadi
 * setiap Client Component di aplikasi ini sudah berada di dalamnya.
 */
export function useToast() {
  const konteks = useContext(KonteksToast);
  if (!konteks) {
    throw new Error('useToast dipakai di luar ToastProvider. Pasang di Providers.tsx.');
  }
  const { tampilkan } = konteks;
  return useMemo(
    () => ({
      sukses: (pesan: string) => tampilkan('sukses', pesan),
      galat: (pesan: string) => tampilkan('galat', pesan),
      info: (pesan: string) => tampilkan('info', pesan),
    }),
    [tampilkan]
  );
}
