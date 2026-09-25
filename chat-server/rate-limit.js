// chat-server/rate-limit.js
//
// Salinan CommonJS dari `src/lib/rate-limit.ts`.
//
// Kenapa disalin, bukan diimpor: chat-server berjalan sebagai proses Node
// terpisah tanpa langkah build, jadi ia tidak bisa memuat modul TypeScript di
// `src/`. Antarmukanya sengaja dibuat sama persis (`rateLimit({ key, limit,
// windowMs })` → `{ success, remaining, resetAt, retryAfterSeconds }`) supaya
// keduanya bisa diganti ke store terpusat dengan cara yang sama nanti.
//
// KALAU SALAH SATU DIUBAH, UBAH JUGA YANG LAIN.
//
// ========================= BATASAN PENTING =========================
// Penghitung disimpan di memori proses. Bila chat-server dijalankan di lebih
// dari satu instance, tiap instance punya penghitungnya sendiri dan batas
// efektifnya menjadi (limit x jumlah instance). Untuk produksi multi-instance,
// ganti penyimpanannya dengan Redis / Upstash dengan increment atomik.
// ===================================================================

const buckets = new Map();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpired(now) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Mencatat satu permintaan untuk `key` dan memutuskan apakah ia boleh
 * diteruskan. Fixed window sederhana — cukup untuk menahan penyalahgunaan
 * kasar, bukan untuk penghalusan lalu lintas.
 */
function rateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  cleanupExpired(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, resetAt, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    success: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSeconds: 0,
  };
}

module.exports = { rateLimit };
