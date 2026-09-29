// src/components/admin/GridKalender.tsx
//
// Timeline satu bulan: satu baris per titik, satu batang per pesanan.
//
// BUKAN Client Component. Seluruh keadaan ada di URL (`?bulan=`, `?q=`), jadi
// tidak ada satu pun hook di sini — dan karena itu ia tidak menambah satu byte
// pun ke bundel browser. Alasannya sama seperti `NavigasiHalaman.tsx`.
//
// KENAPA GRID CSS DAN BUKAN `react-calendar`
// ------------------------------------------
// `react-calendar` sudah dipakai di `src/components/AvailabilityCalendar.tsx`
// untuk halaman publik, dan ia tepat di sana: satu titik, satu bulan, pembeli
// memilih satu tanggal. Yang dibutuhkan admin adalah bentuk yang berbeda — 30
// titik sekaligus, dengan panjang sewa yang terlihat sebagai panjang. Petak
// tanggal tidak bisa menunjukkan "pesanan ini 3 bulan"; batang bisa.
//
// Kolomnya `grid-template-columns: repeat(N, minmax(0,1fr))` dengan N = jumlah
// hari bulan itu (28–31), bukan 31 tetap. Kolom tetap membuat Februari punya
// tiga kolom kosong di ujung kanan yang tidak berarti apa-apa — dan batang yang
// berakhir 28 Februari tampak berhenti sebelum akhir bulan.
//
// KENAPA LEBAR MINIMUM DIPAKU
// ---------------------------
// `min-w-[900px]` di dalam `overflow-x-auto`: 31 kolom pada lebar ponsel adalah
// 12px per hari, dan batang satu hari pada lebar itu tidak bisa diklik maupun
// dibaca. Menggulung ke samping adalah jawaban yang jujur; menyusutkan kolom
// menghasilkan kalender yang tampak utuh tapi tidak bisa dipakai.

import Link from 'next/link';
import {
  type HariKalender,
  type SegmenKalender,
  jumlahJalur,
} from '@/lib/kalender-ketersediaan';
import { labelStatusPesanan, warnaStatusPesanan } from '@/lib/label-status';
import { tanggalRingkas } from '@/lib/tanggal';

/** Satu titik beserta batang pesanannya di bulan yang dilihat. */
export type BarisKalender = {
  billboardId: string;
  judul: string;
  sku: string | null;
  /** `Available` / `Booked` — status inventori, bukan status pesanan. */
  status: string;
  segmen: SegmenKalender[];
};

/** Tinggi satu jalur batang, dalam piksel. Dipakai grid dan batangnya sekaligus. */
const TINGGI_JALUR = 26;

export default function GridKalender({
  hari,
  baris,
}: {
  hari: HariKalender[];
  baris: BarisKalender[];
}) {
  // Lebar kolom nama titik dipaku supaya kolom tanggalnya berbaris tepat di
  // bawah kepalanya. Tanpa lebar tetap, kepala dan isi adalah dua grid yang
  // lebar kolom pertamanya dihitung dari isi masing-masing — dan keduanya
  // bergeser satu terhadap yang lain pada baris dengan judul terpanjang.
  const kolom = {
    gridTemplateColumns: `14rem repeat(${hari.length}, minmax(0, 1fr))`,
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        {/* Kepala tanggal. `sticky top-0` supaya nomor harinya tetap terbaca
            saat admin menggulung 30 baris titik ke bawah — tanpa itu batang di
            baris ke-20 adalah persegi panjang tanpa tanggal. */}
        <div
          className="sticky top-0 z-10 grid border-b border-gray-200 bg-gray-50"
          style={kolom}
        >
          <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">
            Titik
          </div>
          {hari.map((h) => (
            <div
              key={h.kunci}
              className={[
                'border-l border-gray-100 py-2 text-center text-[10px] leading-tight',
                h.hariIni
                  ? 'bg-utero/10 font-bold text-utero'
                  : h.akhirPekan
                    ? 'bg-gray-100 text-gray-400'
                    : 'text-gray-500',
              ].join(' ')}
            >
              {/* Inisial hari di atas nomornya: yang dicari admin saat melihat
                  kalender proyek adalah "akhir pekan yang mana", dan nomor
                  tanggal sendirian tidak menjawabnya. */}
              <div aria-hidden="true">{h.inisial}</div>
              <div className="font-bold">{h.tanggal}</div>
            </div>
          ))}
        </div>

        {baris.map((b) => {
          const jalur = jumlahJalur(b.segmen);

          return (
            <div
              key={b.billboardId}
              className="grid border-b border-gray-100 hover:bg-gray-50/60"
              style={{ ...kolom, minHeight: jalur * TINGGI_JALUR + 12 }}
            >
              <div className="px-4 py-2">
                <Link
                  href={`/admin/billboards/form?id=${b.billboardId}`}
                  className="line-clamp-1 text-xs font-bold text-gray-800 hover:text-utero"
                >
                  {b.judul}
                </Link>
                <div className="font-mono text-[10px] text-gray-400">{b.sku || '-'}</div>
              </div>

              {/* Sel latar per hari, digambar SEBELUM batangnya. Keduanya
                  menempati kolom grid yang sama — sel di baris implisit
                  pertama, batang ditumpuk di atasnya lewat `gridRow: 1`. */}
              {hari.map((h) => (
                <div
                  key={h.kunci}
                  aria-hidden="true"
                  className={[
                    'border-l border-gray-100',
                    h.hariIni
                      ? 'bg-utero/5'
                      : h.akhirPekan
                        ? 'bg-gray-50'
                        : '',
                  ].join(' ')}
                  style={{ gridColumn: h.tanggal + 1, gridRow: 1 }}
                />
              ))}

              {b.segmen.map((s) => (
                <Link
                  key={s.bookingId}
                  href={`/admin/orders/${s.bookingId}`}
                  // `title` memuat rentang ASLINYA, bukan yang sudah dipotong
                  // batas bulan. Batang yang mulai di kolom 1 karena pesanannya
                  // berjalan sejak bulan lalu akan terbaca sebagai "mulai
                  // tanggal 1" — dan itu tanggal yang salah untuk dibacakan ke
                  // pembeli lewat telepon.
                  title={`${labelStatusPesanan(s.status)} · ${tanggalRingkas(
                    s.kunciMulaiAsli
                  )} – ${tanggalRingkas(s.kunciSampaiAsli)}${
                    s.namaPenyewa ? ` · ${s.namaPenyewa}` : ''
                  }`}
                  className={[
                    'flex items-center overflow-hidden whitespace-nowrap px-2 text-[10px] font-bold',
                    // Sudut dibulatkan hanya di ujung yang benar-benar ujung
                    // pesanannya. Batang yang berlanjut ke bulan berikutnya
                    // dengan sudut membulat di kanan terbaca sebagai pesanan
                    // yang BERAKHIR di hari terakhir bulan itu.
                    s.mulaiSebelumBulan ? '' : 'rounded-l',
                    s.sampaiSetelahBulan ? '' : 'rounded-r',
                    warnaStatusPesanan(s.status),
                  ].join(' ')}
                  style={{
                    gridColumn: `${s.kolomMulai + 1} / ${s.kolomSampai + 2}`,
                    gridRow: 1,
                    marginTop: s.jalur * TINGGI_JALUR + 6,
                    marginBottom: 6,
                    height: TINGGI_JALUR - 6,
                    alignSelf: 'start',
                  }}
                >
                  {/* Panah hanya di sisi yang memang terpotong. Tanpa penanda
                      ini, pesanan 3 bulan tampak sebagai tiga pesanan sebulan
                      pada tiga halaman kalender yang berbeda. */}
                  {s.mulaiSebelumBulan && <span aria-hidden="true" className="mr-1">‹</span>}
                  <span className="truncate">
                    #{s.nomor}
                    {s.namaPenyewa ? ` · ${s.namaPenyewa}` : ''}
                  </span>
                  {s.sampaiSetelahBulan && <span aria-hidden="true" className="ml-1">›</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
