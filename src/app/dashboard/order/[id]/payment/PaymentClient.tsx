'use client';

// src/app/dashboard/order/[id]/payment/PaymentClient.tsx
//
// Satu-satunya tempat di aplikasi yang memegang `componentsSdkKey`. Nilai itu
// datang dari API sesudah server mencatat providerSessionId, lalu hidup hanya di
// memori React sampai komponen dihancurkan. Jangan pindahkan ke URL, atribut DOM,
// storage browser, log, atau prop dari Server Component.

import { useEffect, useRef, useState } from 'react';
import type {
  XenditComponents,
  XenditFatalErrorEvent,
  XenditSubmissionEndEvent,
} from 'xendit-components-web';
import { AlertCircle, CheckCircle2, Clock3, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { rupiah } from '@/lib/money';

/**
 * Nilai `PaymentTujuan` ditulis ulang sebagai union teks, bukan diimpor dari
 * `@prisma/client`. Enum Prisma hanya ada pada client yang dibangkitkan di
 * server; mengimpornya di komponen browser menarik seluruh runtime Prisma ke
 * bundle dan menggagalkan build.
 */
type TujuanTagihan = 'DP' | 'FULL' | 'PELUNASAN' | 'TAMBAHAN';

const TUJUAN_DIKENAL: readonly TujuanTagihan[] = ['DP', 'FULL', 'PELUNASAN', 'TAMBAHAN'];

type SesiUntukBrowser = {
  paymentId: string;
  tujuan: TujuanTagihan;
  jumlah: number;
  /** Hanya hidup di state memori komponen ini. */
  componentsSdkKey: string;
  expiresAt: string;
};

type JawabanGagal = {
  message?: string;
  kode?: string;
};

type Props = {
  bookingId: string;
  tagihan: {
    tujuan: TujuanTagihan;
    jumlah: number;
  };
};

type Keadaan =
  | 'memuat'
  | 'siap'
  | 'memproses'
  | 'menunggu'
  | 'selesai'
  | 'kedaluwarsa'
  | 'gagal';

type PermintaanSesi = Promise<
  | { ok: true; data: SesiUntukBrowser }
  | { ok: false; error: JawabanGagal }
>;

function labelTujuan(tujuan: TujuanTagihan): string {
  if (tujuan === 'DP') return 'DP pesanan';
  if (tujuan === 'PELUNASAN') return 'Pelunasan pesanan';
  if (tujuan === 'TAMBAHAN') return 'Biaya tambahan';
  return 'Pembayaran penuh';
}

function pesanAmanDariJawaban(error: JawabanGagal): string {
  // Pesan API diketahui ditulis untuk pembeli. Namun jangan memakai pesan error
  // mentah dari SDK karena dapat memuat detail teknis atau nama penyedia.
  if (error.kode === 'PROFIL_BELUM_LENGKAP') return error.message ?? 'Lengkapi data akun sebelum membayar.';
  if (error.kode === 'TENGGAT_LEWAT' || error.kode === 'TENGGAT_TERLALU_DEKAT') {
    return error.message ?? 'Tenggat pembayaran pesanan ini sudah lewat.';
  }
  if (error.kode === 'SEDANG_DISIAPKAN') return error.message ?? 'Pembayaran sedang disiapkan. Tunggu sebentar lalu coba lagi.';
  return error.message ?? 'Pembayaran belum dapat dibuka. Coba lagi sebentar.';
}

async function mintaSesi(bookingId: string): PermintaanSesi {
  try {
    const response = await fetch(`/api/booking/${encodeURIComponent(bookingId)}/payment-session`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
    });

    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: body && typeof body === 'object' ? (body as JawabanGagal) : {},
      };
    }

    // Jangan mempercayai bentuk respons hanya karena berasal dari origin sendiri;
    // update UI tanpa kunci yang benar akan membuat SDK menyusun galat teknis.
    if (!body || typeof body !== 'object') {
      return { ok: false, error: {} };
    }

    const sesi = body as Partial<SesiUntukBrowser>;
    const tenggat = typeof sesi.expiresAt === 'string' ? Date.parse(sesi.expiresAt) : NaN;
    if (
      typeof sesi.paymentId !== 'string' ||
      !sesi.paymentId ||
      typeof sesi.componentsSdkKey !== 'string' ||
      !sesi.componentsSdkKey ||
      typeof sesi.expiresAt !== 'string' ||
      Number.isNaN(tenggat) ||
      tenggat <= Date.now() ||
      typeof sesi.jumlah !== 'number' ||
      !Number.isFinite(sesi.jumlah) ||
      sesi.jumlah <= 0 ||
      typeof sesi.tujuan !== 'string' ||
      !TUJUAN_DIKENAL.includes(sesi.tujuan as TujuanTagihan)
    ) {
      return { ok: false, error: {} };
    }

    return { ok: true, data: sesi as SesiUntukBrowser };
  } catch {
    return { ok: false, error: {} };
  }
}

export default function PaymentClient({ bookingId, tagihan }: Props) {
  const router = useRouter();
  const [permintaanKe, setPermintaanKe] = useState(0);
  const [sesi, setSesi] = useState<SesiUntukBrowser | null>(null);
  const [keadaan, setKeadaan] = useState<Keadaan>('memuat');
  const [pesan, setPesan] = useState('Menyiapkan pilihan pembayaran aman.');
  const [siapKirim, setSiapKirim] = useState(false);

  // React Strict Mode menjalankan effect dua kali saat development. Promise ini
  // dibagi kedua effect agar hanya ada SATU POST endpoint untuk satu halaman.
  // Tidak di-abort pada cleanup: abort dari effect pertama akan membatalkan
  // request sah yang sedang dipakai effect kedua.
  const permintaanRef = useRef<{ nomor: number; promise: PermintaanSesi } | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  const aksiRef = useRef<HTMLDivElement>(null);
  const instruksiRef = useRef<HTMLDivElement>(null);
  const komponenRef = useRef<XenditComponents | null>(null);

  useEffect(() => {
    const tercatat = permintaanRef.current;
    const promise = tercatat?.nomor === permintaanKe
      ? tercatat.promise
      : mintaSesi(bookingId);

    if (!tercatat || tercatat.nomor !== permintaanKe) {
      permintaanRef.current = { nomor: permintaanKe, promise };
    }

    let aktif = true;
    void promise.then((hasil) => {
      if (!aktif) return;

      if (!hasil.ok) {
        setSesi(null);
        setSiapKirim(false);
        setKeadaan('gagal');
        setPesan(pesanAmanDariJawaban(hasil.error));
        return;
      }

      setSesi(hasil.data);
      setKeadaan('memuat');
      setPesan('Memuat pilihan pembayaran.');
    });

    return () => {
      aktif = false;
    };
  }, [bookingId, permintaanKe]);

  useEffect(() => {
    if (!sesi || !pickerRef.current || !aksiRef.current || !instruksiRef.current) return;

    let aktif = true;
    let instance: XenditComponents | null = null;
    let picker: HTMLElement | null = null;
    let wadahAksi: HTMLElement | null = null;
    let wadahInstruksi: HTMLElement | null = null;

    const onInit = () => {
      if (!aktif) return;
      setKeadaan('siap');
      setPesan('Pilih metode pembayaran, lalu lanjutkan.');
    };
    const onSiap = () => {
      if (!aktif) return;
      setSiapKirim(true);
      setKeadaan('siap');
      setPesan('Data pembayaran siap dikirim.');
    };
    const onBelumSiap = () => {
      if (!aktif) return;
      setSiapKirim(false);
    };
    const onMulai = () => {
      if (!aktif) return;
      setSiapKirim(false);
      setKeadaan('memproses');
      setPesan('Memproses pilihan pembayaran Anda.');
    };
    const onSelesaiKirim = (event: XenditSubmissionEndEvent) => {
      if (!aktif) return;
      setSiapKirim(false);
      if (event.userErrorMessage?.length) {
        setKeadaan('siap');
        setPesan('Pembayaran belum dapat diproses. Periksa data atau pilih metode lain.');
      }
    };
    // Submission yang dilanjutkan sesudah aksi (mis. 3DS atau kembali dari
    // halaman channel). Statusnya sama dengan `submission-begin`: pembeli tidak
    // boleh menekan kirim lagi selama SDK masih bekerja.
    const onLanjutKirim = () => {
      if (!aktif) return;
      setSiapKirim(false);
      setKeadaan('memproses');
      setPesan('Melanjutkan proses pembayaran Anda.');
    };
    const onMulaiAksi = () => {
      if (!aktif) return;
      setSiapKirim(false);
      setKeadaan('memproses');
      setPesan('Ikuti langkah verifikasi yang tampil untuk menyelesaikan pembayaran.');
    };
    const onSelesaiAksi = () => {
      if (!aktif) return;
      // `action-end` juga terjadi saat pembeli membatalkan verifikasi. Tidak ada
      // kesimpulan yang boleh diambil di sini; event sesi berikutnya yang
      // menentukan keadaan sebenarnya.
      setPesan('Memeriksa hasil verifikasi pembayaran.');
    };
    const onPending = () => {
      if (!aktif) return;
      setSiapKirim(false);
      setKeadaan('menunggu');
      setPesan('Instruksi pembayaran sudah dibuat. Selesaikan pembayaran sesuai instruksi yang tampil.');
    };
    // Keluar dari keadaan pending. SDK akan menyusulkan `session-complete` atau
    // `session-expired-or-canceled` bila sesi memang sudah berakhir, jadi di sini
    // hanya UI transisi — bukan kesimpulan tentang uang.
    const onTidakPending = () => {
      if (!aktif) return;
      setKeadaan('memproses');
      setPesan('Memeriksa status pembayaran Anda.');
    };
    const onLengkap = () => {
      if (!aktif) return;
      setSiapKirim(false);
      // Event browser hanya UX. Payment tetap PENDING sampai webhook server
      // memverifikasi dana dan memperbarui ledger/status secara otoritatif.
      setKeadaan('selesai');
      setPesan('Pembayaran diterima, menunggu konfirmasi. Status pesanan akan diperbarui otomatis.');
      router.refresh();
    };
    const onKedaluwarsa = () => {
      if (!aktif) return;
      setSiapKirim(false);
      setKeadaan('kedaluwarsa');
      setPesan('Sesi pembayaran sudah berakhir. Buat sesi baru untuk melanjutkan.');
    };
    const onFatal = (_event: XenditFatalErrorEvent) => {
      if (!aktif) return;
      setSiapKirim(false);
      setKeadaan('gagal');
      // Jangan kirim detail SDK ke layar atau console; detail itu bisa memuat
      // data channel dan tidak membantu pembeli memperbaiki masalahnya.
      setPesan('Pilihan pembayaran tidak dapat dimuat. Coba buat sesi baru.');
    };

    void import('xendit-components-web')
      .then(({ XenditComponents: Components }) => {
        if (!aktif || !pickerRef.current || !aksiRef.current || !instruksiRef.current) return;

        instance = new Components({ componentsSdkKey: sesi.componentsSdkKey });
        komponenRef.current = instance;

        // Daftarkan listener sebelum komponen dibuat. Pembuatan elemen dapat
        // memulai inisialisasi SDK seketika; listener yang dipasang sesudahnya
        // bisa kehilangan `init` atau state sesi yang sudah aktif.
        instance.addEventListener('init', onInit);
        instance.addEventListener('submission-ready', onSiap);
        instance.addEventListener('submission-not-ready', onBelumSiap);
        instance.addEventListener('submission-begin', onMulai);
        instance.addEventListener('submission-resume', onLanjutKirim);
        instance.addEventListener('submission-end', onSelesaiKirim);
        instance.addEventListener('action-begin', onMulaiAksi);
        instance.addEventListener('action-end', onSelesaiAksi);
        instance.addEventListener('session-pending', onPending);
        instance.addEventListener('session-not-pending', onTidakPending);
        instance.addEventListener('session-complete', onLengkap);
        instance.addEventListener('session-expired-or-canceled', onKedaluwarsa);
        instance.addEventListener('fatal-error', onFatal);

        picker = instance.createChannelPickerComponent();
        wadahAksi = instance.createActionContainerComponent({ withCard: false });
        wadahInstruksi = instance.createActionInstructionsComponent();

        pickerRef.current.replaceChildren(picker);
        aksiRef.current.replaceChildren(wadahAksi);
        instruksiRef.current.replaceChildren(wadahInstruksi);
      })
      .catch(() => {
        if (!aktif) return;
        setKeadaan('gagal');
        setPesan('Pilihan pembayaran tidak dapat dimuat. Coba buat sesi baru.');
      });

    return () => {
      aktif = false;
      const komponen = instance;
      if (komponen) {
        komponen.removeEventListener('init', onInit);
        komponen.removeEventListener('submission-ready', onSiap);
        komponen.removeEventListener('submission-not-ready', onBelumSiap);
        komponen.removeEventListener('submission-begin', onMulai);
        komponen.removeEventListener('submission-resume', onLanjutKirim);
        komponen.removeEventListener('submission-end', onSelesaiKirim);
        komponen.removeEventListener('action-begin', onMulaiAksi);
        komponen.removeEventListener('action-end', onSelesaiAksi);
        komponen.removeEventListener('session-pending', onPending);
        komponen.removeEventListener('session-not-pending', onTidakPending);
        komponen.removeEventListener('session-complete', onLengkap);
        komponen.removeEventListener('session-expired-or-canceled', onKedaluwarsa);
        komponen.removeEventListener('fatal-error', onFatal);

        for (const elemen of [picker, wadahAksi, wadahInstruksi]) {
          if (elemen) {
            try {
              komponen.destroyComponent(elemen);
            } catch {
              // Komponen SDK bisa sudah hilang saat halaman berpindah. Tidak ada
              // informasi pembeli yang aman atau berguna untuk dicatat di sini.
            }
          }
        }
      }
      if (komponenRef.current === komponen) komponenRef.current = null;
      pickerRef.current?.replaceChildren();
      aksiRef.current?.replaceChildren();
      instruksiRef.current?.replaceChildren();
    };
  }, [router, sesi]);

  const buatSesiBaru = () => {
    // Sesi lama tidak punya kunci atau state yang boleh dipakai ulang oleh UI.
    // Endpoint akan memakai sesi aktif yang sama jika memang masih aman, atau
    // menutupnya dan membuka tagihan pengganti bila sisi server menyatakan mati.
    setSesi(null);
    setSiapKirim(false);
    setKeadaan('memuat');
    setPesan('Menyiapkan pilihan pembayaran aman.');
    setPermintaanKe((nomor) => nomor + 1);
  };

  const kirimPembayaran = () => {
    if (!siapKirim || !komponenRef.current) return;
    komponenRef.current.submit();
  };

  const sedangMemuat = keadaan === 'memuat';
  const tidakBisaKirim = !siapKirim || sedangMemuat || keadaan === 'memproses' || keadaan === 'menunggu' || keadaan === 'selesai' || keadaan === 'kedaluwarsa' || keadaan === 'gagal';
  const perluSesiBaru = keadaan === 'gagal' || keadaan === 'kedaluwarsa';
  // Halaman server hanya membaca tagihan saat render pertama. Bila endpoint
  // mengganti sesi/tagihan yang benar-benar mati, respons endpoint adalah fakta
  // terbaru yang terikat ke komponen SDK; jangan terus tampilkan ringkasan lama.
  const tagihanTampil = sesi
    ? { tujuan: sesi.tujuan, jumlah: sesi.jumlah }
    : tagihan;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem] gap-8">
      <section aria-live="polite" className="min-w-0">
        <div className="flex items-start gap-3 mb-5">
          {sedangMemuat || keadaan === 'memproses' ? (
            <Loader2 className="text-utero shrink-0 animate-spin mt-0.5" size={19} />
          ) : keadaan === 'selesai' ? (
            <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={19} />
          ) : keadaan === 'menunggu' ? (
            <Clock3 className="text-amber-600 shrink-0 mt-0.5" size={19} />
          ) : (
            <AlertCircle className={perluSesiBaru ? 'text-red-600 shrink-0 mt-0.5' : 'text-gray-500 shrink-0 mt-0.5'} size={19} />
          )}
          <p className="text-sm text-gray-600 leading-relaxed">{pesan}</p>
        </div>

        <div ref={pickerRef} className="min-h-24" />
        <div ref={aksiRef} className="mt-5 min-h-0" />
        <div ref={instruksiRef} className="mt-5 min-h-0" />

        {perluSesiBaru ? (
          <button
            type="button"
            onClick={buatSesiBaru}
            className="inline-flex items-center justify-center gap-2 w-full mt-6 px-5 py-3 bg-utero text-white text-sm font-bold rounded-xl hover:opacity-90 transition disabled:opacity-60"
          >
            <RefreshCw size={16} /> Buat Sesi Pembayaran Baru
          </button>
        ) : (
          <button
            type="button"
            onClick={kirimPembayaran}
            disabled={tidakBisaKirim}
            className="inline-flex items-center justify-center gap-2 w-full mt-6 px-5 py-3 bg-utero text-white text-sm font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {keadaan === 'memproses' ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
            {keadaan === 'memproses' ? 'Memproses Pembayaran' : 'Lanjutkan Pembayaran'}
          </button>
        )}
      </section>

      <aside className="bg-gray-50 rounded-2xl p-5 border border-gray-200 h-fit">
        <p className="text-xs font-bold text-gray-500 mb-1">{labelTujuan(tagihanTampil.tujuan)}</p>
        <p className="text-2xl font-bold text-utero mb-4">{rupiah(tagihanTampil.jumlah)}</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Nominal ditentukan saat pesanan dibuat. Pilihan metode pembayaran tidak
          mengubah jumlah tagihan ini.
        </p>
      </aside>
    </div>
  );
}
