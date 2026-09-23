// src/lib/rate-limit.ts
//
// Pembatas laju (rate limiter) sederhana berbasis memori proses.
//
// Sebelum file ini ada, tidak ada satu pun endpoint di repo yang dibatasi.
// Yang paling berisiko adalah endpoint yang meneruskan permintaan ke Gemini
// API: tiap panggilan menghabiskan kuota berbayar, jadi tanpa pembatas satu
// pemanggil bisa menguras tagihan.
//
// ========================= BATASAN PENTING =========================
// Penghitung disimpan di memori proses Node yang sedang berjalan.
// Konsekuensinya:
//
//   1. TIDAK CUKUP UNTUK DEPLOYMENT MULTI-INSTANCE. Bila aplikasi dijalankan
//      di beberapa instance / container / lambda di balik load balancer, tiap
//      instance punya penghitungnya sendiri. Batas efektif menjadi
//      (limit x jumlah instance), bukan limit.
//   2. Penghitung hilang saat proses restart atau saat serverless function
//      di-recycle, sehingga batas bisa di-reset dengan memicu restart.
//   3. Tidak berlaku lintas region.
//
// Untuk produksi multi-instance, ganti penyimpanan ini dengan store terpusat
// (Redis / Upstash Ratelimit / Vercel KV) dengan operasi increment atomik.
// Antarmuka `rateLimit()` di bawah sengaja dibuat sederhana agar penggantian
// implementasinya tidak mengubah kode pemanggil.
// ===================================================================

type Bucket = {
  /** Jumlah permintaan yang sudah tercatat dalam jendela berjalan. */
  count: number;
  /** Waktu (epoch ms) saat jendela berjalan berakhir. */
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Pembersihan berkala agar Map tidak tumbuh tanpa batas oleh kunci mati.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpired(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitOptions = {
  /** Pengenal pemanggil — sebaiknya user id sesi, bukan IP (IP mudah dipalsukan lewat header). */
  key: string;
  /** Maksimum permintaan yang diizinkan dalam satu jendela. */
  limit: number;
  /** Panjang jendela dalam milidetik. */
  windowMs: number;
};

export type RateLimitResult = {
  /** true bila permintaan boleh diteruskan. */
  success: boolean;
  /** Sisa jatah dalam jendela berjalan. */
  remaining: number;
  /** Waktu (epoch ms) saat jatah kembali penuh. */
  resetAt: number;
  /** Detik yang perlu ditunggu sebelum mencoba lagi (0 bila masih ada jatah). */
  retryAfterSeconds: number;
};

/**
 * Mencatat satu permintaan untuk `key` dan memutuskan apakah permintaan itu
 * boleh diteruskan. Memakai fixed window sederhana — cukup untuk menahan
 * penyalahgunaan kasar, bukan untuk penghalusan lalu lintas.
 */
export function rateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanupExpired(now);

  const existing = buckets.get(key);

  // Jendela baru: belum pernah tercatat, atau jendela lama sudah lewat.
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      success: true,
      remaining: limit - 1,
      resetAt,
      retryAfterSeconds: 0,
    };
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

/**
 * Header standar untuk disertakan pada respons, agar client tahu sisa jatahnya.
 */
export function rateLimitHeaders(limit: number, result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.success) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }
  return headers;
}
