require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// [DIROMBAK] Fungsi untuk memanggil Gemini AI dengan Konteks Database
async function getGeminiResponse(message) {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not found in chat-server/.env");
    return "Maaf, koneksi ke AI sedang bermasalah. Pastikan GEMINI_API_KEY sudah diatur.";
  }

  // 1. Ambil konteks dari database
  let billboardContext = "Saat ini tidak ada data billboard yang tersedia.";
  try {
    const billboards = await prisma.billboard.findMany({
      where: { publishStatus: 'PUBLISHED' },
      select: { title: true, address: true, type: true, slug: true } // Ambil slug
    });

    if (billboards.length > 0) {
      billboardContext = billboards
        .map(b => `- ${b.type} "${b.title}" di ${b.address} (slug: ${b.slug}).`)
        .join('\n');
    }
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

io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);

  socket.on("joinRoom", (sessionId) => {
    socket.join(sessionId);
    console.log(`User ${socket.id} joined room ${sessionId}`);
  });

  socket.on("sendMessage", async ({ sessionId, sender, message }) => {
    try {
      // 1. Simpan pesan asli (dari User atau Agent)
      const originalMessage = await prisma.chatMessage.create({
        data: { sessionId, sender, message },
      });

      // 2. Siarkan pesan asli ke semua client di room
      io.to(sessionId).emit("newMessage", originalMessage);
      console.log(`Message from ${sender} sent to room ${sessionId}:`, message);

      // 3. [LOGIKA BARU] Jika pengirim adalah USER, panggil AI
      if (sender === "USER") {
        console.log("User message detected, calling Gemini...");
        const aiReplyText = await getGeminiResponse(message);

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
        console.log(`AI reply sent to room ${sessionId}:`, aiReplyText);
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
