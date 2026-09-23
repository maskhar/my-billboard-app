// src/lib/enum-guard.ts
//
// Pemeriksa nilai status yang datang dari luar.
//
// Kolom status kini bertipe enum di database, jadi nilai asing pasti ditolak.
// Masalahnya, penolakan itu terjadi di lapisan paling dalam dan muncul ke
// pengguna sebagai "Gagal mengupdate" tanpa keterangan, sementara log terisi
// jejak error Prisma. Lebih buruk lagi, beberapa route menulis status di
// tengah rangkaian operasi — kegagalan di sana bisa meninggalkan perubahan
// setengah jadi.
//
// Fungsi di sini memeriksa lebih awal, di pintu masuk, dan mengembalikan
// pesan yang menyebut nilai apa saja yang sah.

import {
  Role,
  BookingStatus,
  BillboardStatus,
  PublishStatus,
  DesignStatus,
  DesignOption,
  ChatSender,
  ChatSessionStatus,
} from '@prisma/client';

/**
 * Periksa apakah `nilai` termasuk salah satu anggota enum.
 * `daftar` adalah objek enum hasil generate Prisma, mis. `Role`.
 */
export function nilaiEnumSah<T extends Record<string, string>>(
  daftar: T,
  nilai: unknown
): nilai is T[keyof T] {
  return typeof nilai === 'string' && Object.values(daftar).includes(nilai);
}

/** Daftar nilai sah sebagai teks, untuk ditaruh di pesan error. */
export function daftarNilai<T extends Record<string, string>>(daftar: T): string {
  return Object.values(daftar).join(', ');
}

// Pintasan untuk enum yang paling sering diterima dari request.
export const sahRole = (v: unknown) => nilaiEnumSah(Role, v);
export const sahBookingStatus = (v: unknown) => nilaiEnumSah(BookingStatus, v);
export const sahBillboardStatus = (v: unknown) => nilaiEnumSah(BillboardStatus, v);
export const sahPublishStatus = (v: unknown) => nilaiEnumSah(PublishStatus, v);
export const sahDesignStatus = (v: unknown) => nilaiEnumSah(DesignStatus, v);
export const sahDesignOption = (v: unknown) => nilaiEnumSah(DesignOption, v);
export const sahChatSender = (v: unknown) => nilaiEnumSah(ChatSender, v);
export const sahChatSessionStatus = (v: unknown) => nilaiEnumSah(ChatSessionStatus, v);

export {
  Role,
  BookingStatus,
  BillboardStatus,
  PublishStatus,
  DesignStatus,
  DesignOption,
  ChatSender,
  ChatSessionStatus,
};
