require("dotenv").config();
const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const { rateLimit } = require("./rate-limit");

// [SECURITY] Daftar origin yang boleh mengakses chat server.
// Diisi lewat env CHAT_CORS_ORIGINS (dipisah koma). Fallback aman untuk dev lokal.
// Catatan: aplikasi Next berjalan di port 4000 (`next dev -p 4000` di
// package.json), bukan 3000. Tanpa 4000 di daftar ini, browser memblokir setiap
// koneksi dari aplikasi ke chat-server dan live chat mati total di dev.
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

const ALLOWED_ORIGINS = (process.env.CHAT_CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const CORS_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_DEV_ORIGINS;

if (ALLOWED_ORIGINS.length === 0) {
  console.warn(
    "⚠️  CHAT_CORS_ORIGINS tidak diatur. Memakai fallback origin pengembangan lokal:",
    DEFAULT_DEV_ORIGINS.join(", ")
  );
}

// Request tanpa header Origin (curl, health check server-to-server) tetap diizinkan,
// browser selalu mengirim Origin sehingga tetap terkunci ke daftar di atas.
const corsOptions = {
  origin(origin, callback) {
    if (!origin || CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin tidak diizinkan oleh kebijakan CORS"));
  },
  methods: ["GET", "POST"],
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
// Rahasia terpisah untuk menandatangani token tamu; jatuh kembali ke NEXTAUTH_SECRET.
const GUEST_TOKEN_SECRET = process.env.CHAT_GUEST_TOKEN_SECRET || NEXTAUTH_SECRET;
const GUEST_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 hari

// Role yang dianggap admin/CS dan boleh masuk ke room mana pun.
// "CS" sebelumnya tidak ada di daftar ini. Akibatnya petugas CS — satu-satunya
// peran yang memang dibuat untuk melayani percakapan — diperlakukan sebagai
// tamu: tidak bisa membuka room pelanggan, dan pesannya akan tercatat sebagai
// datang dari USER, bukan ADMIN.
const STAFF_ROLES = ["ADMIN", "SUPER_ADMIN", "OPERATOR", "CS"];

// next-auth/jwt di-resolve dari node_modules aplikasi utama (root repo).
// Dibungkus try/catch supaya server tetap hidup untuk tamu bila paketnya belum terpasang.
let decodeNextAuthToken = null;
try {
  decodeNextAuthToken = require("next-auth/jwt").decode;
} catch (error) {
  console.warn(
    "⚠️  Paket 'next-auth' tidak ditemukan. Login admin/user via socket akan ditolak, tamu tetap bisa chat."
  );
}

if (!NEXTAUTH_SECRET) {
  console.warn("⚠️  NEXTAUTH_SECRET belum diatur di chat-server/.env. Token login tidak bisa diverifikasi.");
}

// ---------------------------------------------------------------------------
// [SECURITY] Identitas: token tamu diterbitkan server, bukan ditentukan client
// ---------------------------------------------------------------------------
function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function signGuestPayload(payloadB64) {
  return crypto.createHmac("sha256", GUEST_TOKEN_SECRET).update(payloadB64).digest("base64url");
}

function issueGuestToken(sessionId) {
  if (!GUEST_TOKEN_SECRET) {
    throw new Error("CHAT_GUEST_TOKEN_SECRET / NEXTAUTH_SECRET belum diatur.");
  }
  const payload = { sid: sessionId, iat: Date.now(), exp: Date.now() + GUEST_TOKEN_TTL_MS };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `v1.${payloadB64}.${signGuestPayload(payloadB64)}`;
}

function verifyGuestToken(token) {
  if (!token || typeof token !== "string" || !GUEST_TOKEN_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  const [, payloadB64, signature] = parts;
  const expected = signGuestPayload(payloadB64);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload.sid || typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

// Ambil session token NextAuth dari handshake (auth object atau cookie browser).
function extractNextAuthToken(handshake) {
  const auth = handshake.auth || {};
  const fromAuth = auth.token || auth.sessionToken || auth.session_token;
  if (typeof fromAuth === "string" && fromAuth) return fromAuth;

  const cookieHeader = handshake.headers?.cookie;
  if (!cookieHeader) return null;

  const cookies = {};
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies["__Secure-next-auth.session-token"] || cookies["next-auth.session-token"] || null;
}

// [SECURITY] Verifikasi handshake sebelum koneksi diterima.
io.use(async (socket, next) => {
  const handshake = socket.handshake;
  const rawToken = extractNextAuthToken(handshake);

  // 1. User login / admin: verifikasi JWT NextAuth.
  if (rawToken) {
    if (!decodeNextAuthToken || !NEXTAUTH_SECRET) {
      return next(new Error("unauthorized"));
    }
    try {
      const token = await decodeNextAuthToken({ token: rawToken, secret: NEXTAUTH_SECRET });
      if (!token) return next(new Error("unauthorized"));

      const role = typeof token.role === "string" ? token.role.toUpperCase() : "USER";
      socket.data.identity = {
        type: STAFF_ROLES.includes(role) ? "staff" : "user",
        userId: token.id || token.sub || null,
        role,
        sessionId: null,
      };
      return next();
    } catch (error) {
      console.warn("Handshake ditolak: token NextAuth tidak valid.");
      return next(new Error("unauthorized"));
    }
  }

  // 2. Tamu: boleh tanpa token. Kalau membawa guest token terbitan server,
  //    sessionId diambil dari token — bukan dari nilai yang dikirim client.
  const guestPayload = verifyGuestToken(handshake.auth?.guestToken);
  socket.data.identity = {
    type: "guest",
    userId: null,
    role: "GUEST",
    sessionId: guestPayload ? guestPayload.sid : null,
  };
  return next();
});

// ---------------------------------------------------------------------------
// Pembatas laju untuk jalur yang memanggil AI berbayar
// ---------------------------------------------------------------------------
//
// Setiap pesan dari pengunjung memicu satu panggilan Gemini, dan jalur ini
// terbuka untuk TAMU — siapa pun bisa mengambil token dari /api/chat/start
// tanpa login. Tanpa pembatas, satu skrip yang mengirim pesan dalam loop
// menguras kuota berbayar dalam hitungan menit, dan chat untuk pelanggan asli
// ikut mati bersamanya.
//
// Dua lapis, karena keduanya menjawab hal yang berbeda:
//   - Per sesi: menahan satu pengunjung (atau satu skrip) agar tidak memborong.
//   - Global: batas atas untuk seluruh server, supaya seribu sesi baru yang
//     masing-masing masih "sopan" tetap tidak bisa melewati batas tagihan.
//
// Angkanya longgar untuk percakapan manusia: 12 pesan per menit jauh di atas
// kecepatan orang mengetik pertanyaan, tapi jauh di bawah kecepatan loop.
const BATAS_AI_PER_SESI = 12;
const JENDELA_AI_PER_SESI_MS = 60 * 1000;

const BATAS_AI_GLOBAL = Number(process.env.CHAT_AI_BATAS_GLOBAL_PER_MENIT) || 120;
const JENDELA_AI_GLOBAL_MS = 60 * 1000;

/**
 * Bolehkah pesan ini memicu panggilan AI?
 *
 * Mengembalikan `null` bila boleh, atau teks alasan yang layak dibaca
 * pengunjung bila tidak. Pesan pengunjung TETAP tersimpan dan tersiar apa pun
 * hasilnya — yang ditahan hanya panggilan AI-nya, supaya percakapan dengan
 * petugas manusia tidak ikut mati saat jatah AI habis.
 */
function tolakanBalasanAI(sessionId) {
  const perSesi = rateLimit({
    key: `chat-ai:sesi:${sessionId}`,
    limit: BATAS_AI_PER_SESI,
    windowMs: JENDELA_AI_PER_SESI_MS,
  });
  if (!perSesi.success) {
    return `Anda mengirim pesan terlalu cepat. Coba lagi dalam ${perSesi.retryAfterSeconds} detik ya. 🙏`;
  }

  const global = rateLimit({
    key: "chat-ai:global",
    limit: BATAS_AI_GLOBAL,
    windowMs: JENDELA_AI_GLOBAL_MS,
  });
  if (!global.success) {
    return "Asisten AI sedang sangat sibuk. Pesan Anda sudah kami terima dan akan dibalas petugas kami. 🙏";
  }

  return null;
}

// Apakah identitas socket berhak atas room/sesi ini?
function canAccessSession(identity, sessionId) {
  if (!identity || !sessionId) return false;
  if (identity.type === "staff") return true; // admin/CS bebas ke room mana pun
  return identity.sessionId === sessionId;
}

// Cache konteks billboard untuk prompt AI.
//
// Umurnya sengaja pendek: billboard baru terbit harus muncul di jawaban AI
// dalam hitungan menit, bukan setelah server di-restart.
const UMUR_CACHE_BILLBOARD_MS = 5 * 60 * 1000;
const BATAS_BILLBOARD_KONTEKS = 60;

let cacheKonteksBillboard = { teks: null, kedaluwarsa: 0 };

async function ambilKonteksBillboard() {
  if (cacheKonteksBillboard.teks !== null && Date.now() < cacheKonteksBillboard.kedaluwarsa) {
    return cacheKonteksBillboard.teks;
  }

  const billboards = await prisma.billboard.findMany({
    where: { publishStatus: 'PUBLISHED' },
    select: { title: true, address: true, type: true, slug: true },
    // Indeks `@@index([publishStatus, status])` di schema.prisma membuat
    // penyaringan ini memakai indeks, bukan membaca seluruh tabel.
    orderBy: { createdAt: 'desc' },
    take: BATAS_BILLBOARD_KONTEKS,
  });

  const teks =
    billboards.length > 0
      ? billboards
          .map((b) => `- ${b.type} "${b.title}" di ${b.address} (slug: ${b.slug}).`)
          .join('\n')
      : "Saat ini tidak ada data billboard yang tersedia.";

  cacheKonteksBillboard = { teks, kedaluwarsa: Date.now() + UMUR_CACHE_BILLBOARD_MS };
  return teks;
}

// [DIROMBAK] Fungsi untuk memanggil Gemini AI dengan Konteks Database
async function getGeminiResponse(message) {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not found in chat-server/.env");
    return "Maaf, koneksi ke AI sedang bermasalah. Pastikan GEMINI_API_KEY sudah diatur.";
  }

  // 1. Ambil konteks dari database
  //
  // Query ini dulu berjalan untuk SETIAP pesan chat yang masuk, tanpa batas
  // jumlah baris. Seratus pengunjung yang mengetik bersamaan = seratus query
  // ke tabel yang sama, mengambil seluruh billboard terbit, hanya untuk
  // menempelkan teks yang sama persis ke dalam prompt. Katalog yang tumbuh
  // juga membengkakkan prompt sampai melewati batas token model, dan saat itu
  // terjadi AI berhenti menjawab tanpa sebab yang kelihatan.
  //
  // Dua pengamannya: hasil disimpan sebentar di memori (katalog billboard
  // tidak berubah tiap detik), dan jumlah barisnya dibatasi.
  let billboardContext = "Saat ini tidak ada data billboard yang tersedia.";
  try {
    billboardContext = await ambilKonteksBillboard();
  } catch (dbError) {
    console.error("Error fetching billboard data for AI context:", dbError);
  }

  // 2. Buat "Super Prompt"
  const superPrompt = `
    Anda adalah "Utero Agent", AI Customer Service yang sangat membantu, ramah, dan to-the-point untuk Utero Cloud, sebuah platform sewa billboard.
    
    KONTEKS INTERNAL (DATA BILLBOARD YANG TERSEDIA SAAT INI):
    ---
    ${billboardContext}
    ---
    
    TUGAS ANDA:
    - Jawab pertanyaan user HANYA BERDASarkan data dari KONTEKS INTERNAL di atas.
    - Jika user menanyakan lokasi (contoh: "ada di Jakarta?"), dan lokasi itu ada di dalam konteks, sebutkan semua billboard yang relevan di lokasi tersebut.
    - Saat Anda menyebutkan sebuah billboard, Anda HARUS menyertakan link ke halaman detailnya. Format linknya adalah Markdown: [Nama Billboard](/billboard/slug-billboard). Gunakan 'slug' yang tersedia di dalam konteks.
    - Jika user menanyakan lokasi yang TIDAK ADA di dalam konteks, jangan berbohong atau mencari di internet. Jawab dengan jujur bahwa saat ini belum tersedia di lokasi tersebut, lalu tawarkan beberapa lokasi alternatif yang ADA di dalam konteks.
    - Jangan pernah menyebutkan "berdasarkan konteks internal" atau "berdasarkan data yang saya miliki". Berbicaralah seolah-olah Anda tahu semuanya secara alami.
    - Gunakan emoji untuk membuat jawaban lebih ramah.
    
    PERTANYAAN USER:
    "${message}"
  `;
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: superPrompt }] }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok || !data.candidates || data.candidates.length === 0) {
        console.error("Gemini API returned an error or no candidates:", JSON.stringify(data, null, 2));
        const errorMessage = data?.error?.message || "Gagal memproses permintaan AI.";
        return `Maaf, terjadi kesalahan pada AI: ${errorMessage}`;
    }

    return data.candidates[0]?.content?.parts[0]?.text || "Saya tidak yakin bagaimana harus merespon, coba tanyakan hal lain.";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Terjadi kesalahan saat mencoba menghubungi AI.";
  }
}

// ... (sisa kode tidak berubah)
// Endpoint sederhana untuk cek server hidup
app.get("/", (req, res) => {
  res.send("Chat server is running!");
});

// [SECURITY] Sesi tamu diterbitkan server: client tidak boleh memilih sendiri id-nya.
// Respons berisi id sesi + guestToken yang dipakai saat handshake socket.
app.post("/api/chat/start", async (req, res) => {
  try {
    const { name, email, phone } = req.body || {};
    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Nama, email, dan nomor telepon wajib diisi." });
    }

    // Tanpa batas, endpoint ini bisa dipanggil berulang untuk membuat baris
    // ChatSession tanpa henti — sekaligus memasok token sesi baru untuk
    // menyiasati batas AI per sesi di atas. Batasnya per alamat IP dan
    // longgar: satu orang jarang memulai lebih dari beberapa percakapan.
    const jatahSesi = rateLimit({
      key: `chat-start:${req.ip || "tanpa-ip"}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!jatahSesi.success) {
      res.set("Retry-After", String(jatahSesi.retryAfterSeconds));
      return res.status(429).json({
        error: `Terlalu banyak percakapan dimulai. Coba lagi dalam ${jatahSesi.retryAfterSeconds} detik.`,
      });
    }

    // `issueGuestToken` melempar bila rahasia penanda tangan belum diatur.
    // Dulu ia dipanggil SETELAH baris sesi dibuat, jadi kegagalan itu
    // meninggalkan baris sesi yatim di database sementara pengunjung hanya
    // melihat 500. Token diterbitkan lebih dulu sekarang: kalau memang tidak
    // bisa, tidak ada yang perlu ditulis.
    const session = await prisma.$transaction(async (tx) => {
      const dibuat = await tx.chatSession.create({
        data: {
          guestName: String(name).slice(0, 120),
          guestEmail: String(email).slice(0, 160),
          guestPhone: String(phone).slice(0, 40),
        },
      });
      // Dipanggil di dalam transaksi supaya kegagalannya membatalkan
      // penulisan sesi, bukan menyisakannya.
      return { id: dibuat.id, guestToken: issueGuestToken(dibuat.id) };
    });

    return res.json(session);
  } catch (error) {
    console.error("Error creating chat session:", error);
    return res.status(500).json({ error: "Gagal memulai sesi chat." });
  }
});

io.on("connection", (socket) => {
  const identity = socket.data.identity;
  console.log(`✅ A ${identity.type} connected:`, socket.id);

  // Tamu yang baru mendaftar lewat /api/chat/start bisa menukar guestToken
  // tanpa harus menyambung ulang. sessionId tetap berasal dari token, bukan client.
  socket.on("claimGuestSession", (guestToken) => {
    if (identity.type !== "guest") return;
    const payload = verifyGuestToken(guestToken);
    if (!payload) {
      socket.emit("authError", { event: "claimGuestSession", message: "Token tamu tidak valid." });
      return;
    }
    identity.sessionId = payload.sid;
    socket.emit("guestSessionClaimed", { sessionId: payload.sid });
  });

  socket.on("joinRoom", (sessionId) => {
    // [SECURITY] Verifikasi pemanggil memang berhak atas room ini.
    if (typeof sessionId !== "string" || !canAccessSession(identity, sessionId)) {
      socket.emit("authError", { event: "joinRoom", message: "Tidak berhak mengakses room ini." });
      console.warn(`Penolakan joinRoom: socket ${socket.id} (${identity.type})`);
      return;
    }
    socket.join(sessionId);
    console.log(`Socket ${socket.id} (${identity.type}) joined a room`);
  });

  socket.on("leaveRoom", (sessionId) => {
    if (typeof sessionId !== "string") return;
    socket.leave(sessionId);
  });

  socket.on("sendMessage", async ({ sessionId, message }) => {
    try {
      // [SECURITY] Nilai 'sender' dari payload client diabaikan sepenuhnya;
      // identitas ditentukan dari hasil verifikasi handshake.
      if (typeof sessionId !== "string" || !canAccessSession(identity, sessionId)) {
        socket.emit("authError", { event: "sendMessage", message: "Tidak berhak mengirim ke room ini." });
        console.warn(`Penolakan sendMessage: socket ${socket.id} (${identity.type})`);
        return;
      }

      if (typeof message !== "string" || !message.trim()) return;
      const safeMessage = message.slice(0, 4000);

      // CATATAN: nilai 'ADMIN' dipakai konsisten dengan API admin chat yang lama.
      // Inkonsistensi 'AGENT' vs 'ADMIN' dijadwalkan dibereskan di task 3.3.
      const sender = identity.type === "staff" ? "ADMIN" : "USER";

      // 1. Simpan pesan asli (dari User atau Admin)
      const originalMessage = await prisma.chatMessage.create({
        data: { sessionId, sender, message: safeMessage },
      });

      // 2. Siarkan pesan asli ke semua client di room
      io.to(sessionId).emit("newMessage", originalMessage);
      // [PRIVACY] Hanya catat metadata, jangan isi pesan pelanggan.
      console.log(`Message from ${sender} stored (len=${safeMessage.length}, msgId=${originalMessage.id})`);

      // 3. [LOGIKA BARU] Jika pengirim adalah USER, panggil AI
      if (sender === "USER") {
        // Panggilan Gemini menghabiskan kuota berbayar dan jalur ini terbuka
        // untuk tamu, jadi lajunya dibatasi lebih dulu. Saat jatah habis,
        // pengunjung tetap mendapat balasan — hanya balasan yang tidak
        // menghabiskan kuota, dan pesan aslinya sudah tersimpan di atas
        // sehingga petugas tetap bisa menindaklanjutinya.
        const alasanTolak = tolakanBalasanAI(sessionId);
        const aiReplyText = alasanTolak !== null
          ? alasanTolak
          : await getGeminiResponse(safeMessage);

        // 4. Simpan balasan AI ke database
        const aiMessage = await prisma.chatMessage.create({
          data: {
            sessionId,
            sender: "BOT", // Tandai sebagai 'BOT'
            message: aiReplyText,
          },
        });

        // 5. Siarkan balasan AI ke semua client di room
        io.to(sessionId).emit("newMessage", aiMessage);
        console.log(`AI reply stored (len=${aiReplyText.length}, msgId=${aiMessage.id})`);
      }
    } catch (error) {
      console.error("Error handling sendMessage:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Chat server listening on *:${PORT}`);
});
