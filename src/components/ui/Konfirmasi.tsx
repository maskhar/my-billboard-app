'use client';

// src/components/ui/Konfirmasi.tsx
//
// Pengganti `confirm()` (9 pemanggilan) dan `prompt()` (3 pemanggilan).
//
// Kedua fungsi bawaan itu BERHENTI di tempat dan memulangkan jawabannya sebagai
// nilai kembali. Tidak ada cara membuat ulang perilaku itu di React, dan itu
// sebabnya API di sini memulangkan `Promise`: pemanggilnya harus `await`.
// Konsekuensinya ditulis di sini supaya tidak ditemukan sebagai bug nanti —
// setiap pemanggil yang dulu berbunyi
//
//     const handleX = () => { if (!confirm('Yakin?')) return; kirim(); }
//
// harus menjadi
//
//     const handleX = async () => { if (!(await tanya({...}))) return; kirim(); }
//
// dan `handleX` yang dipasang di `onClick` WAJIB menjadi `async`. Bila tanda
// `await` terlupa, `Promise` selalu truthy dan konfirmasinya lolos tanpa pernah
// ditekan siapa pun — tindakan destruktif berjalan seketika. Karena itu ada tes
// di `tests/xendit.test.cjs` yang menolak `tanya(` tanpa `await` di depannya.
//
// Yang `confirm()` bawaan tidak punya dan ini punya:
//   · tindakan destruktif bisa diberi tombol MERAH dan label yang menyebut
//     tindakannya ("Batalkan Pesanan"), bukan "OK" untuk segalanya;
//   · teksnya bisa memuat hierarki — peringatan uang dibedakan dari pertanyaan;
//   · Escape dan klik di luar membatalkan, dan fokus dikembalikan ke tombol
//     pemanggil sesudahnya (ditangani `Dialog` dari @headlessui/react);
//   · halaman tidak membeku, jadi socket live-chat admin tetap menerima pesan
//     selama dialognya terbuka.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

type Nada = 'bahaya' | 'biasa';

type PermintaanKonfirmasi = {
  judul: string;
  pesan: string;
  /** Label tombol setuju. Sebutkan TINDAKANNYA, bukan "OK". */
  labelSetuju?: string;
  labelTolak?: string;
  nada?: Nada;
  /**
   * Bila diisi, dialognya meminta teks (pengganti `prompt()`), dan hasilnya
   * berupa teks itu — bukan `true`. Kosong/hanya spasi diperlakukan sebagai
   * penolakan, sama seperti `prompt()` yang dibatalkan.
   */
  isian?: {
    label: string;
    placeholder?: string;
    /** `true` untuk alasan panjang; `prompt()` bawaan tidak bisa melakukan ini. */
    panjang?: boolean;
    wajib?: boolean;
  };
};

type Tertunda = {
  permintaan: PermintaanKonfirmasi;
  selesaikan: (jawaban: string | boolean | null) => void;
};

type IsiKonteks = {
  tanya: (permintaan: PermintaanKonfirmasi) => Promise<string | boolean | null>;
};

const KonteksKonfirmasi = createContext<IsiKonteks | null>(null);

export function KonfirmasiProvider({ children }: { children: React.ReactNode }) {
  const [tertunda, setTertunda] = useState<Tertunda | null>(null);
  const [isi, setIsi] = useState('');
  // Dipegang di ref selain di state supaya penutupan lewat Escape/klik-luar —
  // yang tidak lewat tombol — tetap MENYELESAIKAN promise-nya. Promise yang
  // tidak pernah selesai membuat `await` menggantung selamanya, dan tombol
  // pemanggil tertinggal dalam keadaan "Memproses..." tanpa sebab.
  const tertundaRef = useRef<Tertunda | null>(null);

  const tanya = useCallback((permintaan: PermintaanKonfirmasi) => {
    // Satu dialog pada satu waktu. Permintaan kedua yang datang saat dialog
    // masih terbuka ditolak, BUKAN ditumpuk atau diantrikan: dialog kedua yang
    // menimpa yang pertama membuat pengguna menyetujui pertanyaan yang tidak
    // pernah ia baca.
    if (tertundaRef.current) return Promise.resolve<string | boolean | null>(null);

    return new Promise<string | boolean | null>((selesaikan) => {
      const baru: Tertunda = { permintaan, selesaikan };
      tertundaRef.current = baru;
      setIsi('');
      setTertunda(baru);
    });
  }, []);

  const jawab = useCallback((jawaban: string | boolean | null) => {
    const sekarang = tertundaRef.current;
    tertundaRef.current = null;
    setTertunda(null);
    setIsi('');
    sekarang?.selesaikan(jawaban);
  }, []);

  const nilai = useMemo(() => ({ tanya }), [tanya]);

  const permintaan = tertunda?.permintaan;
  const bahaya = permintaan?.nada === 'bahaya';
  const isian = permintaan?.isian;
  // `wajib` default `true` untuk isian: `prompt()` yang diganti semuanya
  // memeriksa `if (!reason) return`, jadi teks kosong memang penolakan.
  const wajib = isian ? isian.wajib !== false : false;
  const bolehSetuju = !isian || !wajib || isi.trim() !== '';

  return (
    <KonteksKonfirmasi.Provider value={nilai}>
      {children}
      <Dialog
        open={tertunda !== null}
        // Escape dan klik di luar mendarat di sini, dan keduanya berarti TOLAK —
        // sama seperti menekan Cancel di `confirm()`.
        onClose={() => jawab(isian ? null : false)}
        className="relative z-[100001]"
      >
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
          aria-hidden="true"
        />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
            <div className="flex items-start gap-3">
              {bahaya ? (
                <AlertTriangle size={22} className="mt-0.5 shrink-0 text-red-600" />
              ) : (
                <HelpCircle size={22} className="mt-0.5 shrink-0 text-gray-400" />
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-bold text-gray-900">
                  {permintaan?.judul ?? ''}
                </DialogTitle>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-gray-600">
                  {permintaan?.pesan ?? ''}
                </p>
              </div>
            </div>

            {isian && (
              <div className="mt-4">
                <label
                  htmlFor="konfirmasi-isian"
                  className="mb-1.5 block text-xs font-bold text-gray-700"
                >
                  {isian.label}
                </label>
                {isian.panjang ? (
                  <textarea
                    id="konfirmasi-isian"
                    autoFocus
                    rows={3}
                    value={isi}
                    onChange={(e) => setIsi(e.target.value)}
                    placeholder={isian.placeholder}
                    className="w-full resize-y rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-utero focus:ring-1 focus:ring-utero"
                  />
                ) : (
                  <input
                    id="konfirmasi-isian"
                    autoFocus
                    type="text"
                    value={isi}
                    onChange={(e) => setIsi(e.target.value)}
                    placeholder={isian.placeholder}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-utero focus:ring-1 focus:ring-utero"
                  />
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => jawab(isian ? null : false)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
              >
                {permintaan?.labelTolak ?? 'Batal'}
              </button>
              <button
                type="button"
                disabled={!bolehSetuju}
                onClick={() => jawab(isian ? isi.trim() : true)}
                className={`rounded-lg px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  bahaya ? 'bg-red-600 hover:bg-red-700' : 'bg-utero hover:opacity-90'
                }`}
              >
                {permintaan?.labelSetuju ?? 'Lanjutkan'}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </KonteksKonfirmasi.Provider>
  );
}

/**
 * `const setuju = await konfirmasi({ judul, pesan })` — pengganti `confirm()`.
 * Memulangkan `true`/`false`.
 *
 * Dengan `isian`, ia menjadi pengganti `prompt()` dan memulangkan teks yang
 * diisi, atau `null` bila dibatalkan atau dibiarkan kosong.
 *
 * WAJIB di-`await`. Tanpa `await`, `Promise` selalu truthy.
 */
export function useKonfirmasi() {
  const konteks = useContext(KonteksKonfirmasi);
  if (!konteks) {
    throw new Error('useKonfirmasi dipakai di luar KonfirmasiProvider. Pasang di Providers.tsx.');
  }
  return konteks.tanya;
}
