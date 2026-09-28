// src/app/admin/(dashboard)/live-chat/actions.ts
'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { HalamanPesanChat, PesanChat, SesiChat, SesiChatLengkap } from '@/lib/tipe-chat';
import {
  PESAN_PER_HALAMAN,
  PESAN_TERAKHIR,
  PILIH_PESAN,
  potongHalaman,
  syaratLebihLama,
  takeDenganPengintip,
  urutanTerbaruDulu,
} from '@/lib/riwayat-chat';

// Peran yang boleh membaca percakapan pelanggan.
const CHAT_ROLES = ['ADMIN', 'SUPER_ADMIN', 'CS'];

/**
 * Sesi terbaru yang dimuat ke kotak masuk sekaligus.
 *
 * Tanpa batas, halaman ini mengambil SELURUH percakapan yang pernah ada —
 * beserta pesan terakhir masing-masing — lalu menanamkannya ke HTML sebagai
 * props komponen client. Dengan 30 sesi itu tidak terasa; setelah setahun
 * widget chat berjalan, halaman yang paling perlu dibuka cepat oleh CS justru
 * yang paling lambat, dan tidak ada satu pun percakapan di bawah baris ke-50
 * yang benar-benar dibaca.
 */
const SESI_TERBARU = 50;

// Kolom yang MEMANG dipakai layar, ditulis eksplisit.
//
// `include` mengambil seluruh kolom tabel, dan hasil action ini menyeberang ke
// `CS_InboxLayout` (`'use client'`) — artinya tertanam di HTML halaman. Pada
// tabel yang menyimpan nama, email, dan nomor telepon tamu, kolom baru tidak
// boleh ikut menyeberang hanya karena ditambahkan ke schema.
const PILIH_SESI = {
  id: true,
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  status: true,
  // Kehadiran tamu, diukur dari koneksi socket oleh `chat-server/kehadiran.js`.
  // Nilai ini adalah potret saat halaman dirender; perubahan setelahnya tiba
  // lewat peristiwa socket `presenceChanged` di kotak masuk.
  isOnline: true,
  createdAt: true,
} as const;

// `PILIH_PESAN` dan batas-batasnya datang dari `@/lib/riwayat-chat`, bukan
// ditulis ulang di sini: widget tamu memakai kolom yang sama persis, dan kolom
// yang ditambahkan di satu sisi saja berarti dua bentuk `PesanChat` yang
// berbeda mengalir ke satu tipe yang sama.

// Tanggal diubah menjadi teks DI SINI, sebelum menyeberang.
//
// Bukan kosmetik: pesan yang tiba lewat socket membawa `createdAt` berupa teks
// ISO, sedangkan pesan dari database membawa objek `Date`. Keduanya masuk ke
// satu array `messages` yang sama di kotak masuk, jadi bentuknya disamakan di
// batas server — kalau tidak, `new Date(x)` di layar bekerja untuk separuh
// baris dan `x.toLocaleString` melempar untuk separuhnya.
type BarisPesan = {
  id: string;
  sessionId: string;
  sender: string;
  message: string;
  createdAt: Date;
};

function keTeksPesan(baris: BarisPesan): PesanChat {
  return { ...baris, createdAt: baris.createdAt.toISOString() };
}

// Penjaga akses untuk Server Action.
//
// Server Action di Next.js adalah endpoint HTTP publik dengan id yang bisa
// ditemukan dari bundle JavaScript — bukan fungsi internal. Kedua action di
// file ini mengembalikan guestName, guestEmail, guestPhone, dan seluruh isi
// percakapan, jadi tanpa pemeriksaan ini data pelanggan bisa diambil siapa pun
// yang memanggil endpoint action-nya langsung.
async function pastikanBolehLihatChat() {
  const session = await getServerSession(authOptions);
  if (!session || !CHAT_ROLES.includes(session.user.role)) {
    throw new Error('Unauthorized');
  }
}

// `catch` yang mengembalikan `[]` DIHAPUS.
//
// Pemanggilnya adalah Server Component (`live-chat/page.tsx`), yang meneruskan
// hasilnya langsung ke `CS_InboxLayout`. Daftar kosong di sana dirender sebagai
// kotak masuk yang bersih — tidak ada percakapan yang menunggu. Itu persis
// kalimat yang tidak boleh diucapkan saat database gagal dihubungi: CS melihat
// layar tenang, tidak menjawab siapa pun, dan pelanggan yang sedang mengetik di
// widget chat tidak pernah dibalas. Galat sekarang melempar ke
// `admin/(dashboard)/error.tsx`, yang menyatakan datanya gagal dimuat.
export async function getChatSessions(): Promise<SesiChat[]> {
  await pastikanBolehLihatChat();

  const baris = await prisma.chatSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: SESI_TERBARU,
    select: {
      ...PILIH_SESI,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1, // Hanya ambil pesan terakhir untuk preview
        select: PILIH_PESAN,
      },
    },
  });

  return baris.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    messages: s.messages.map(keTeksPesan),
  }));
}

export async function getMessagesForSession(
  sessionId: string
): Promise<SesiChatLengkap | null> {
  await pastikanBolehLihatChat();

  if (!sessionId) return null;

  // `catch` yang mengembalikan `null` DIHAPUS di sini juga. Pemanggilnya
  // (`CS_InboxLayout.handleSelectSession`) menulis `fullSession?.messages || []`,
  // jadi `null` menjadi percakapan yang tampil KOSONG — bukan gagal. CS membuka
  // percakapan pelanggan, melihat riwayatnya lenyap, dan menjawab tanpa tahu apa
  // yang sudah dibicarakan sebelumnya.
  //
  // `null` tetap dipakai untuk satu arti saja: sesi dengan id itu tidak ada.
  // Pemanggil sekarang menangkap galat dan menampilkannya (lihat try/catch di
  // sana), karena ini Client Component — melempar ke batas galat akan
  // membongkar seluruh kotak masuk hanya karena satu percakapan gagal dibuka.
  // Diambil `desc` lalu dibalik, BUKAN `asc` dengan `take`.
  //
  // `orderBy: asc` + `take: 200` memberi 200 pesan PERTAMA — pembukaan
  // percakapan, bagian yang paling tidak dibutuhkan CS saat hendak menjawab.
  // Yang diperlukan adalah 200 TERAKHIR, jadi urutannya dibalik di query dan
  // dipulihkan di sini.
  //
  // `+ 1` adalah cara mengetahui masih ada riwayat yang lebih lama tanpa
  // `count` kedua: kalau yang kembali lebih banyak dari batasnya, baris
  // kelebihannya dibuang dan CS diberi tahu.
  const sesi = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: {
      ...PILIH_SESI,
      messages: {
        // `id` ikut di `orderBy`, bukan `createdAt` saja. Dua pesan bisa lahir
        // pada milidetik yang sama — pesan tamu dan balasan BOT atasnya
        // ditulis dalam satu penanganan `sendMessage` — dan urutan yang tidak
        // menentukan di antara keduanya membuat kursor halaman berikutnya
        // menunjuk ke tempat yang salah.
        orderBy: urutanTerbaruDulu(),
        take: takeDenganPengintip(PESAN_TERAKHIR),
        select: PILIH_PESAN,
      },
    },
  });

  if (!sesi) return null;

  // Pemotongnya bersama dengan jalur "muat lebih lama" dan dengan widget tamu.
  // `+ 1` di `take` dan `slice().reverse()` di sini dulu ditulis di tempat ini
  // saja; begitu ada pemanggil kedua, salah satunya akan lupa salah satunya.
  const halaman = potongHalaman(sesi.messages, PESAN_TERAKHIR);

  return {
    ...sesi,
    createdAt: sesi.createdAt.toISOString(),
    messages: halaman.pesan.map(keTeksPesan),
    adaRiwayatLebihLama: halaman.adaLagi,
  };
}

/**
 * Satu halaman pesan yang LEBIH LAMA dari pesan tertua yang sudah tampil.
 *
 * Ini yang menutup pemberitahuan tanpa jalan keluar di kotak masuk: panel
 * percakapan sudah mengatakan "hanya 200 pesan terakhir yang ditampilkan"
 * sejak awal, tapi tidak ada satu pun jalur yang bisa mengambil sisanya. CS
 * yang membaca percakapan panjang dari atas menyimpulkan pesan ke-200 adalah
 * awal pembicaraan, lalu menjawab tanpa tahu apa yang sudah dijanjikan.
 *
 * `sebelumId` adalah id pesan tertua di layar, bukan nomor halaman. Alasannya
 * ada di `syaratLebihLama`: percakapan ini bisa menerima pesan baru selagi CS
 * membacanya, dan OFFSET yang dihitung dari ujung daftar akan menggeser
 * seluruh halaman setiap kali itu terjadi.
 */
export async function getRiwayatLebihLama(
  sessionId: string,
  sebelumId: string
): Promise<HalamanPesanChat> {
  await pastikanBolehLihatChat();

  if (!sessionId || !sebelumId) return { messages: [], adaLagi: false };

  // Kursornya DIBACA DARI DATABASE, tidak diterima dari client.
  //
  // Dua hal sekaligus. Pertama, `createdAt` yang dikirim client adalah teks
  // ISO yang bisa apa saja: nilai yang digeser satu milidetik membuat halaman
  // melewatkan atau mengulang pesan, dan nilai yang tidak bisa diparse
  // menghasilkan `Invalid Date` yang membuat SELURUH perbandingan `lt` palsu —
  // Prisma menerimanya dan kembali tanpa satu baris pun, jadi riwayat tampak
  // habis padahal tidak.
  //
  // Kedua, dan ini yang lebih penting: `where: { id, sessionId }` mengikat
  // kursor pada sesi yang diminta. Tanpa itu, id pesan dari percakapan LAIN
  // bisa dipakai sebagai titik potong — dan walaupun hasilnya tetap disaring
  // `sessionId`, ia memberi tahu pemanggil kapan pesan orang lain ditulis.
  const kursorBaris = await prisma.chatMessage.findFirst({
    where: { id: sebelumId, sessionId },
    select: { id: true, createdAt: true },
  });
  if (!kursorBaris) return { messages: [], adaLagi: false };

  const baris = await prisma.chatMessage.findMany({
    where: syaratLebihLama(sessionId, kursorBaris),
    orderBy: urutanTerbaruDulu(),
    take: takeDenganPengintip(PESAN_PER_HALAMAN),
    select: PILIH_PESAN,
  });

  const halaman = potongHalaman(baris, PESAN_PER_HALAMAN);
  return { messages: halaman.pesan.map(keTeksPesan), adaLagi: halaman.adaLagi };
}
