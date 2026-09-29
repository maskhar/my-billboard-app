// src/app/admin/(dashboard)/users/UserClientPage.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Wallet } from 'lucide-react';
import UserFormModal from './UserFormModal';
import { rupiah } from '@/lib/money';
import { tanggalRingkas } from '@/lib/tanggal';
import KepalaUrut from '@/components/admin/KepalaUrut';
import KotakCari from '@/components/admin/KotakCari';
import TombolEkspor from '@/components/admin/TombolEkspor';

const GOOGLE_ICON = "https://cdn.iconscout.com/icon/free/png-256/free-google-1772223-1507807.png";

// Tipe ini dulu `User & { bookings: Booking[] }` — tipe Prisma utuh, jauh
// lebih longgar daripada data yang benar-benar dikirim, sehingga halaman
// induk harus memakai cast `as unknown as` agar TypeScript diam. Kini ia
// menggambarkan persis apa yang menyeberang: kolom aman milik pengguna,
// plus dua angka yang sudah dijumlahkan di database.
//
// `bookings` sengaja TIDAK ada lagi di sini. Sebelumnya seluruh baris pesanan
// tiap pengguna dikirim ke browser hanya untuk dijumlahkan di sana lalu
// dibuang — dan ikut tertanam di HTML halaman.
export type BarisPengguna = {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: string;
    authProvider: string | null;
    createdAt: string;
    jumlahOrder: number;
    /**
     * Uang yang benar-benar diterima dari pelanggan ini (`Payment PAID`),
     * dikurangi refund yang sudah selesai ditransfer. Bukan nilai kontrak
     * pesanan-pesanannya. Dihitung server sebagai Decimal, sampai di sini
     * sudah berupa angka jadi.
     */
    totalSpent: number;
};

// `KepalaUrut` dan `KotakCari` dirender dari dalam Client Component ini, dan itu
// sah: keduanya tidak memakai satu pun hook dan tidak menyentuh API khusus
// server, jadi Next menyusunnya sebagai bagian dari bundel client tanpa keluhan.
// Yang tidak boleh adalah sebaliknya — Server Component di dalam client tree
// yang MEMBACA database — dan tidak satu pun dari keduanya melakukannya.
//
// Menyalin isi keduanya ke sini supaya "tetap di client" akan menghasilkan dua
// salinan aturan yang sama: `aria-sort` yang harus ada di `<th>`, dan saringan
// yang harus dibawa sebagai medan tersembunyi. Dua salinan adalah dua tempat
// yang akan menyimpang.
export default function UserClientPage({
    users,
    urutAktif,
    kataKunci,
    kueriAktif,
    total,
    bolehEkspor,
}: {
    users: BarisPengguna[];
    /** Kunci urut yang sedang berlaku menurut URL; dipakai kepala kolom. */
    urutAktif: string;
    /**
     * Kata kunci yang SUDAH dipakai server untuk menyaring. Komponen ini tidak
     * menyaring apa pun dengannya — daftar yang tiba sudah merupakan hasilnya.
     * Ia hanya dipakai mengisi kotak cari dan menulis keadaan kosong yang benar.
     */
    kataKunci: string;
    /** Urutan + kata kunci yang aktif, untuk dibawa tautan kepala kolom. */
    kueriAktif: Record<string, string | undefined>;
    /** Jumlah baris SELURUH hasil (bukan 25 baris halaman ini). */
    total: number;
    /**
     * Apakah peran yang sedang masuk boleh MENGUNDUH daftar ini.
     *
     * Diputuskan server dan diserahkan sebagai boolean jadi, bukan dihitung di
     * sini dari `session`: keputusan peran tidak pernah diambil di sisi client,
     * dan komponen ini tidak menerima `Role` sama sekali. Gerbang sesungguhnya
     * tetap di route ekspor — ini hanya menentukan tombolnya digambar.
     */
    bolehEkspor: boolean;
}) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="space-y-6">
            <UserFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Manajemen Pengguna</h1>
                    {/* Label jumlahnya berubah saat mencari. "Total: 4.000
                        pengguna" di atas hasil pencarian yang berisi 3 baris
                        adalah angka yang benar untuk pertanyaan yang tidak
                        sedang ditanyakan. */}
                    <p className="text-gray-500 text-sm">
                        {kataKunci === '' ? (
                            <>Kelola pelanggan, hak akses, dan status akun.</>
                        ) : (
                            <>
                                <span className="font-bold text-utero">{total}</span> pengguna cocok dengan
                                &ldquo;{kataKunci}&rdquo;
                            </>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                    + Tambah User Baru
                </button>
            </div>

            {/* Urutan dibawa sebagai medan tersembunyi. Tanpa itu, menekan Cari
                mengembalikan urutan ke bakunya tanpa satu pun tanda. */}
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              <div className="flex-1">
                <KotakCari
                  basis="/admin/users"
                  nilai={kataKunci}
                  label="Cari pengguna berdasarkan nama, email, nomor WhatsApp, atau nama perusahaan"
                  placeholder="Cari nama, email, nomor WhatsApp, perusahaan…"
                  tersembunyi={{ urut: kueriAktif.urut }}
                />
              </div>

              {bolehEkspor && (
                <TombolEkspor daftar="users" parameter={kueriAktif} label="Unduh CSV" />
              )}
            </div>

            {/* `overflow-hidden` dulu ada di pembungkus ini, dan yang ia
                potong adalah kolom "Aksi" — tombol edit dan hapus di ujung
                kanan. Enam kolom dengan `px-6` tidak muat di bawah ~900px, dan
                `overflow-hidden` MEMOTONG luberan itu tanpa memberi cara
                menggulungnya: admin di laptop 13" melihat tabel yang terlihat
                utuh dan tidak punya satu pun tombol.

                Pemisahannya dua lapis karena keduanya berbeda tugas:
                pembungkus luar membawa sudut membulat dan bingkai (dan tetap
                `overflow-hidden`, supaya sudutnya memotong baris pertama
                tabel), pembungkus dalam yang menggulung. Menaruh
                `overflow-x-auto` pada elemen yang sama dengan `rounded-xl`
                membuat sudut membulatnya hilang saat gulungan aktif. */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[860px]">
                    <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-100">
                        <tr>
                            <KepalaUrut
                              className="px-6 py-4"
                              label="User Info"
                              basis="/admin/users"
                              urutAktif={urutAktif}
                              naik="nama-naik"
                              turun="nama-turun"
                              parameter={kueriAktif}
                            />
                            <KepalaUrut
                              className="px-6 py-4"
                              label="Role"
                              basis="/admin/users"
                              urutAktif={urutAktif}
                              naik="peran-naik"
                              turun="peran-turun"
                              parameter={kueriAktif}
                            />
                            {/* Kolom ini menampilkan metode daftar DAN tanggal
                                daftar, dan yang diurutkan adalah tanggalnya —
                                yaitu `terbaru`/`terlama`, urutan bakunya.
                                Mengurutkan menurut `authProvider` hanya
                                menghasilkan dua blok ("EMAIL" lalu "GOOGLE"),
                                dan itu penyaringan yang dipaksa jadi urutan. */}
                            <KepalaUrut
                              className="px-6 py-4"
                              label="Metode Daftar"
                              basis="/admin/users"
                              urutAktif={urutAktif}
                              naik="terlama"
                              turun="terbaru"
                              parameter={kueriAktif}
                            />
                            <KepalaUrut
                              className="px-6 py-4"
                              label="Riwayat Order"
                              basis="/admin/users"
                              urutAktif={urutAktif}
                              naik="order-sedikit"
                              turun="order-banyak"
                              parameter={kueriAktif}
                            />
                            {/* "Total Dibayar", bukan "Total Spending": isinya
                                uang yang benar-benar diterima dari pelanggan
                                ini, bukan nilai pesanan yang pernah ia buat.

                                TIDAK bisa diurutkan, dan itu keputusan, bukan
                                kelalaian: angkanya bukan kolom mana pun. Ia
                                `Payment PAID` dikurangi refund yang sudah
                                ditransfer, dilipat di sini atas 25 baris halaman
                                ini. Kepala kolom yang bisa diklik akan
                                mengurutkan 25 baris itu saja — sehingga
                                "halaman 1 menurut pembayaran terbesar" tidak
                                memuat pembayar terbesar, hanya pembayar terbesar
                                di antara pendaftar terbaru. Kepala kolom yang
                                menjawab salah lebih buruk daripada kepala kolom
                                yang tidak bisa diklik.

                                Mengurutkannya dengan benar menuntut agregasi di
                                dalam query utamanya (view, atau kolom ringkasan
                                yang dipelihara) — itu perubahan schema, dan fase
                                ini tidak menambah migration. */}
                            <th className="px-6 py-4">Total Dibayar</th>
                            <th className="px-6 py-4 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {/* Keadaan kosong. Sebelum ini tidak ada: `users.map`
                            atas array kosong merender `<tbody>` tanpa satu pun
                            baris, jadi admin melihat kepala tabel yang melayang
                            di atas ruang putih tanpa satu kata pun yang
                            menjelaskan kenapa — dan sekarang, dengan pencarian,
                            itu adalah keadaan yang PALING sering muncul. */}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-400">
                                    {kataKunci !== ''
                                        ? `Tidak ada pengguna yang cocok dengan "${kataKunci}".`
                                        : 'Belum ada pengguna.'}
                                </td>
                            </tr>
                        )}
                        {users.map((user) => {
                            // Penjumlahan kolom ini dulu dilakukan di sini, di
                            // browser, atas seluruh baris pesanan yang dikirim
                            // serta — dan yang dijumlahkan adalah nilai
                            // kontrak, bukan uang. Kini dihitung server dari
                            // `Payment PAID` dikurangi refund yang sudah
                            // selesai (lihat `page.tsx`), dari sumber yang sama
                            // dengan KPI "Uang Masuk" di dashboard admin.
                            return (
                                <tr key={user.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm relative overflow-hidden" 
                                                 style={{background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)'}}>
                                                {user.image ? (
                                                    <>
                                                        {/*
                                                          `<img>` biasa, bukan
                                                          `next/image`: `user.image`
                                                          berasal dari profil Google
                                                          (`lh3.googleusercontent.com`)
                                                          dan host itu TIDAK ada di
                                                          `remotePatterns`
                                                          next.config.ts, jadi
                                                          `next/image` melempar saat
                                                          dijalankan dan seluruh
                                                          daftar pengguna hilang.

                                                          `alt` dulu tidak ada. Nama
                                                          pengguna tertulis tepat di
                                                          sebelah avatar ini, jadi
                                                          `alt=""` sudah benar
                                                          secara semantik — foto
                                                          profil di sini tidak
                                                          membawa satu pun informasi
                                                          yang belum tertulis, dan
                                                          `alt=""` yang eksplisit
                                                          memberi tahu pembaca layar
                                                          untuk MELEWATINYA alih-alih
                                                          membacakan URL berkasnya.
                                                        */}
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={user.image} alt="" className="w-full h-full object-cover"/>
                                                    </>
                                                ) : (
                                                    <span>{user.name ? user.name.charAt(0).toUpperCase() : '?'}</span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-800">{user.name}</div>
                                                <div className="text-xs text-gray-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold border uppercase ${
                                            user.role.includes('ADMIN') ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'
                                        }`}>
                                            {user.role.replace('_', ' ')}
                                        </span>
                                    </td>

                                    <td className="px-6 py-4">
                                         <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                                             {user.authProvider === 'GOOGLE' ? (
                                                 <>
                                                    {/*
                                                      `<img>` biasa: host CDN
                                                      ikonnya tidak ada di
                                                      `remotePatterns`. `alt`
                                                      dikosongkan — kata "Google"
                                                      tertulis tepat di sebelahnya,
                                                      jadi `alt="G"` yang dulu ada
                                                      membuat pembaca layar berbunyi
                                                      "G Google".
                                                    */}
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={GOOGLE_ICON} width={16} height={16} alt=""/>
                                                    <span>Google</span>
                                                 </>
                                             ) : (
                                                 <>
                                                    <div className="w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center text-[8px] text-white">@</div>
                                                    <span>Email Manual</span>
                                                 </>
                                             )}
                                         </div>
                                         <div className="text-[10px] text-gray-400 mt-1">
                                             {tanggalRingkas(user.createdAt)}
                                         </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <span className="font-bold text-gray-700">{user.jumlahOrder}</span> <span className="text-xs text-gray-400">Trx</span>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1 text-green-700 font-bold">
                                            <Wallet size={14} className="opacity-50"/> {rupiah(user.totalSpent)}
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-center">
                                        <Link href={`/admin/users/${user.id}`} className="text-blue-600 hover:underline">
                                            <Pencil size={16} />
                                        </Link>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
              </div>
            </div>
        </div>
    );
}
