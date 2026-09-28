// src/app/admin/(dashboard)/live-chat/actions.ts
'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { PesanChat, SesiChat, SesiChatLengkap } from '@/lib/tipe-chat';

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

/**
 * Pesan terakhir yang dimuat saat satu percakapan dibuka.
 *
 * Alasannya sama, dengan satu tambahan: `ChatMessage.message` tidak dibatasi
 * panjangnya di schema, jadi satu percakapan panjang bisa membawa payload yang
 * jauh lebih besar daripada seluruh daftar sesi.
 */
const PESAN_TERAKHIR = 200;

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

const PILIH_PESAN = {
  id: true,
  sessionId: true,
  sender: true,
  message: true,
  createdAt: true,
} as const;

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
        orderBy: { createdAt: 'desc' },
        take: PESAN_TERAKHIR + 1,
        select: PILIH_PESAN,
      },
    },
  });

  if (!sesi) return null;

  const adaRiwayatLebihLama = sesi.messages.length > PESAN_TERAKHIR;
  const terbaruDuluan = adaRiwayatLebihLama
    ? sesi.messages.slice(0, PESAN_TERAKHIR)
    : sesi.messages;

  return {
    ...sesi,
    createdAt: sesi.createdAt.toISOString(),
    // `slice().reverse()`: `reverse()` mengubah array aslinya di tempat, dan
    // array itu masih dipakai `adaRiwayatLebihLama` di atas.
    messages: terbaruDuluan.slice().reverse().map(keTeksPesan),
    adaRiwayatLebihLama,
  };
}
