// src/components/admin/RevenueSection.tsx
'use client';

// `useEffect` dibuang dari impor: data awal datang sebagai prop dari server dan
// setiap pemuatan berikutnya dipicu klik filter, jadi tidak ada satu pun effect
// di berkas ini.
import { useState, useTransition } from 'react';
import { getRevenueData, type LaporanOmzet } from '@/app/admin/(dashboard)/actions';
import RevenueChart from './RevenueChart';
import { rupiah } from '@/lib/money';
import { tanggalRingkas } from '@/lib/tanggal';
import { PRESET_RENTANG, type KunciPreset } from '@/lib/rentang-tanggal';
import { AlertTriangle, Loader2 } from 'lucide-react';

// `ChartData` dulu ditulis ulang di sini, salinan kedua dari bentuk yang sama
// di `actions.ts`. Sekarang seluruh hasilnya diimpor dari sumbernya sebagai
// `LaporanOmzet`: kolom yang ditambahkan di satu tempat tidak lagi bisa luput di
// tempat lain.

// DAFTAR TOMBOL DITURUNKAN DARI `PRESET_RENTANG`, TIDAK DITULIS ULANG
// -------------------------------------------------------------------
// Berkas ini dulu memuat `filterOptions` beserta labelnya sendiri, dan
// `actions.ts` memuat union periodenya sendiri. Dua daftar untuk satu himpunan
// pilihan: preset yang ditambahkan di server tidak muncul sebagai tombol, dan
// tombol yang labelnya diubah di sini tidak mengubah rentang yang dihitung.
// Sekarang keduanya membaca satu definisi, dan `Object.entries` di bawah
// menjamin setiap preset punya tombolnya.
const PILIHAN = Object.entries(PRESET_RENTANG) as [
  KunciPreset,
  { label: string },
][];

/**
 * KENAPA RENTANG INI TIDAK DIBAWA DI URL
 * --------------------------------------
 * Bentuk yang biasa dipakai di panel ini — dan yang dipakai keempat daftar admin
 * — adalah menaruh saringan di `searchParams` supaya bisa di-bookmark. Di sini
 * itu justru pilihan yang lebih buruk: halaman dashboard menjalankan enam
 * agregat, satu `groupBy` tugas, dan `findMany` lima pesanan terakhir. Rentang
 * di URL berarti SELURUHNYA dihitung ulang setiap kali seseorang menekan "3
 * Bulan", padahal tidak satu pun dari angka itu ikut berubah — hanya satu grafik
 * yang berubah.
 *
 * Yang dibayar bila rentangnya tidak di URL hanyalah kemampuan mem-bookmark satu
 * grafik. Yang dibayar bila ia di URL adalah delapan kueri tambahan pada setiap
 * klik, di halaman yang paling sering dibuka admin.
 */
export default function RevenueSection({ initialData }: { initialData: LaporanOmzet }) {
  const [laporan, setLaporan] = useState<LaporanOmzet>(initialData);
  const [isPending, startTransition] = useTransition();

  // Medan tanggal dipegang terpisah dari `laporan`, dan itu bukan state ganda:
  // yang di medan adalah apa yang SEDANG DIKETIK admin, yang di `laporan` adalah
  // rentang yang sudah dijawab server. Keduanya memang berbeda selama admin
  // belum menekan "Terapkan" — dan menyatukannya berarti medan tanggal melompat
  // sendiri saat server menukar urutan yang terbalik, di tengah pengetikan.
  const [dari, setDari] = useState(initialData.dari ?? '');
  const [sampai, setSampai] = useState(initialData.sampai ?? '');

  function minta(permintaan: { preset?: string; dari?: string; sampai?: string }) {
    startTransition(async () => {
      const hasil = await getRevenueData(permintaan);
      setLaporan(hasil);
      // Medan diselaraskan dengan rentang yang BENAR-BENAR dipakai. Inilah yang
      // membuat penukaran urutan terlihat: admin yang mengetik 31 Jan – 1 Jan
      // melihat medannya berpindah tempat, bukan hanya membaca peringatan.
      setDari(hasil.dari ?? '');
      setSampai(hasil.sampai ?? '');
    });
  }

  const pilihPreset = (preset: KunciPreset) => minta({ preset });

  const terapkanTanggal = (e: React.FormEvent) => {
    e.preventDefault();
    minta({ dari, sampai });
  };

  // Judulnya menyebut rentang yang dipakai KUERI, bukan isi medan formulir.
  // Judul yang disusun dari medannya sendiri tetap menulis "1 Jan – 31 Jan" di
  // atas grafik enam bulan ketika tanggalnya ditolak — dan angka yang terbaca
  // lalu dikutip sebagai angka Januari.
  const keterangan =
    laporan.dari && laporan.sampai
      ? `${tanggalRingkas(laporan.dari)} – ${tanggalRingkas(laporan.sampai)}`
      : 'Seluruh waktu';

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-bold text-gray-800">Tren Uang Masuk</h3>
          {/* Keterangan ini dulu berbunyi "Omzet berdasarkan tanggal pembayaran
              dikonfirmasi" — padahal yang dijumlahkan adalah nilai kontrak
              pesanan, bukan uang yang diterima. Sekarang isinya memang uang,
              dan refund yang sudah ditransfer menguranginya. */}
          <p className="text-sm text-gray-500">
            Pembayaran yang diterima per tanggal terima, dikurangi refund yang sudah ditransfer.
          </p>
          <p className="mt-1 text-sm text-gray-700">
            <span className="font-semibold">{keterangan}</span>
            <span className="text-gray-400"> · per {laporan.satuan} · bersih </span>
            <span className="font-semibold">{rupiah(laporan.totalBersih)}</span>
          </p>
        </div>

        {/* `flex-wrap` bukan hiasan: enam tombol preset ditambah dua medan
            tanggal tidak muat pada satu baris di lebar panel mana pun yang
            sidebar-nya terbuka, dan tanpa membungkus, tombol terakhir keluar
            dari kartunya. */}
        <div className="flex flex-wrap items-center gap-1 bg-gray-100 p-1 rounded-lg">
          {PILIHAN.map(([kunci, def]) => (
            <button
              key={kunci}
              type="button"
              onClick={() => pilihPreset(kunci)}
              disabled={isPending}
              // `aria-pressed`, bukan hanya warna. Tombol terpilih dibedakan
              // lewat latar putih dan warna teks; pembaca layar tidak melihat
              // keduanya, jadi tanpa ini seluruh enam tombol terbaca sama.
              aria-pressed={laporan.preset === kunci}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-colors duration-200 ${
                laporan.preset === kunci
                  ? 'bg-white text-utero shadow'
                  : 'text-gray-500 hover:bg-gray-200'
              } disabled:opacity-50`}
            >
              {def.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rentang bebas. Formulir, bukan dua `onChange`: tanggal yang dikirim
          pada setiap ketukan berarti satu kueri per digit, dan rentang setengah
          diketik (`2026-0`) yang ditolak server membuat grafik berkedip balik ke
          preset di tengah pengetikan. */}
      <form
        onSubmit={terapkanTanggal}
        className="flex flex-wrap items-end gap-3 mb-5 pb-5 border-b border-gray-100"
      >
        <div>
          <label htmlFor="omzet-dari" className="block text-xs font-semibold text-gray-600 mb-1">
            Dari
          </label>
          <input
            id="omzet-dari"
            type="date"
            value={dari}
            onChange={(e) => setDari(e.target.value)}
            disabled={isPending}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-utero/40 focus:border-utero disabled:opacity-50"
          />
        </div>
        <div>
          <label htmlFor="omzet-sampai" className="block text-xs font-semibold text-gray-600 mb-1">
            Sampai
          </label>
          <input
            id="omzet-sampai"
            type="date"
            value={sampai}
            onChange={(e) => setSampai(e.target.value)}
            disabled={isPending}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-utero/40 focus:border-utero disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          // Dinonaktifkan sampai KEDUANYA terisi. Satu tanggal tanpa
          // pasangannya ditolak server (lihat `bacaRentang`), dan tombol yang
          // bisa ditekan lalu tidak melakukan apa pun kecuali memunculkan
          // peringatan adalah tombol yang mengajari admin mengabaikan
          // peringatan.
          disabled={isPending || dari === '' || sampai === ''}
          className="px-4 py-2 text-sm font-bold text-white bg-utero rounded-lg hover:bg-utero/90 disabled:opacity-50"
        >
          Terapkan
        </button>
      </form>

      {/* Koreksi server DIKATAKAN, tidak diam-diam diberlakukan. Rentang yang
          diperbaiki tanpa suara membuat admin membaca angka dari rentang yang
          bukan yang ia minta — cacat yang sama bentuknya dengan kotak cari yang
          menjawab "tidak ada" atas baris yang sebenarnya ada.

          `role="status"`, bukan `role="alert"`: isinya bukan galat dan tidak
          menuntut tindakan, dan `alert` memotong bacaan pembaca layar yang
          sedang berjalan. */}
      {(laporan.ditukar || laporan.ditolak) && (
        <div
          role="status"
          className="flex items-start gap-2 mb-4 px-3 py-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {laporan.ditukar
              ? 'Tanggal akhir lebih awal dari tanggal mulai, jadi keduanya ditukar.'
              : 'Tanggal yang diminta tidak lengkap atau tidak ada di kalender, jadi rentang di bawah yang dipakai.'}
          </span>
        </div>
      )}

      {isPending ? (
        <div className="h-[350px] flex justify-center items-center">
          <Loader2 className="animate-spin text-gray-300" size={40} />
        </div>
      ) : laporan.data.length === 0 ? (
        // Rentang kosong diberi kalimat, bukan grafik kosong. `BarChart` tanpa
        // satu pun titik merender sumbu tanpa label dan bidang putih — bentuk
        // yang tidak bisa dibedakan dari grafik yang gagal dimuat.
        <div className="h-[350px] flex flex-col justify-center items-center text-center">
          <p className="font-semibold text-gray-700">Tidak ada uang masuk pada rentang ini.</p>
          <p className="mt-1 text-sm text-gray-500">
            Coba rentang yang lebih panjang, atau pilih salah satu preset di atas.
          </p>
        </div>
      ) : (
        <RevenueChart data={laporan.data} />
      )}
    </div>
  );
}
