'use client';

// src/components/admin/TabelDiffRollback.tsx
//
// Tabel "sebelum → sesudah" di dalam dialog konfirmasi rollback billboard.
//
// KOMPONEN INI TIDAK MENGHITUNG APA PUN, dan itu keputusan, bukan kebetulan.
// Seluruh barisnya datang jadi dari `GET /api/admin/billboards/rollback/preview`,
// yang menyusunnya dengan `bacaSnapshotBillboard()` — fungsi yang SAMA yang
// dipakai route rollback untuk menuliskan perubahannya. Menghitung ulang apa pun
// di sini membuka celah antara yang dipratinjau dan yang dituliskan, dan
// pratinjau yang menyimpang memperlihatkan admin perubahan yang bukan perubahan
// yang terjadi — lebih berbahaya daripada tidak ada pratinjau sama sekali.
//
// Hanya kolom yang BERUBAH yang ikut. Tabel berisi 17 baris yang 14 di antaranya
// bertuliskan "tidak berubah" menyembunyikan tiga yang berubah.

import type { BarisDiffBillboard } from '@/lib/diff-billboard';

export default function TabelDiffRollback({ baris }: { baris: BarisDiffBillboard[] }) {
  return (
    // `overflow-x-auto` ada di elemen DALAM, bukan di elemen yang membulat:
    // `rounded-*` bersama `overflow-x-auto` pada satu elemen memotong isi yang
    // digulung di sudutnya, dan kolom terakhir tabel ini adalah nilai yang
    // sedang diputuskan untuk ditimpa.
    //
    // Sel "Sekarang" dan "Setelah dipulihkan" memuat slug, URL foto, dan alamat
    // yang tidak bisa membungkus lebih sempit daripada satu kata panjang, dan
    // dialog ini dibuka juga di layar ponsel.
    <div className="rounded-lg border border-gray-200">
      <div className="overflow-x-auto">
        {/* `min-w-[440px]` bukan hiasan: tanpa lebar minimum, `w-full
            table-fixed` menyusut mengikuti wadahnya dan tidak pernah meluber,
            jadi `overflow-x-auto` di atas tidak akan pernah menggulung apa pun.
            Pada dialog selebar ponsel 360px, tiga kolom persen menyisakan ±130px
            untuk sel nilai, dan URL Cloudinary di sana membungkus menjadi satu
            kolom huruf. */}
        <table className="w-full min-w-[440px] table-fixed text-left text-xs">
          <caption className="sr-only">
            Kolom billboard yang akan berubah bila revisi ini dipulihkan
          </caption>
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="w-[26%] px-3 py-2 font-bold">
                Kolom
              </th>
              <th scope="col" className="w-[37%] px-3 py-2 font-bold">
                Sekarang
              </th>
              <th scope="col" className="w-[37%] px-3 py-2 font-bold">
                Setelah dipulihkan
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {baris.map((b) => (
              <tr key={b.label} className="align-top">
                <th scope="row" className="px-3 py-2 text-left font-bold text-gray-700">
                  {b.label}
                </th>
                {/* `break-words` bukan `truncate`: slug, URL foto, dan alamat
                    panjang yang dipotong dengan elipsis membuat dua nilai yang
                    berbeda terbaca identik — persis pada kolom yang orang ini
                    sedang memutuskan untuk menimpa. */}
                <td className="break-words px-3 py-2 text-gray-500 line-through decoration-gray-300">
                  {b.sebelum}
                </td>
                <td className="break-words px-3 py-2 font-semibold text-gray-900">{b.sesudah}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
