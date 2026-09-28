'use client';

import { useState, useRef, useEffect } from 'react';
import { io, Socket } from "socket.io-client";
import { MessageCircle, X, Send, Loader2, User, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { alamatChat, PESAN_CHAT_BELUM_DIKONFIGURASI } from '@/lib/alamat-chat';
import type { PesanChat } from '@/lib/tipe-chat';
import { bacaBadan } from '@/lib/baca-jawaban';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  // `any[]` dulu tertulis di sini, dan itu membiarkan `tempMessage` di
  // `handleSend` lahir dengan bentuk yang BERBEDA dari pesan yang datang dari
  // socket: tanpa `sessionId`, dan dengan `createdAt` berupa objek `Date`
  // sementara server mengirim teks ISO. Satu array berisi dua bentuk adalah
  // jebakan yang menunggu pembaca pertama yang membaca `createdAt` — jam pesan
  // belum dirender hari ini, jadi cacatnya belum terlihat, bukan tidak ada.
  const [messages, setMessages] = useState<PesanChat[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Inisialisasi malas (`useState(alamatChat)`, bukan `useState(alamatChat())`):
  // fungsinya dipanggil SEKALI seumur komponen, bukan setiap render. Nilai ini
  // tidak pernah berubah saat komponen hidup — ia berasal dari nilai yang
  // ditanam saat build — jadi menyimpannya lebih tepat daripada memanggil ulang
  // di effect lalu mengabarkan hasilnya lewat `setState`, yang memicu render
  // berantai.
  const [chatUrl] = useState<string | null>(alamatChat);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);

  useEffect(() => {
    // Dua perbaikan sekaligus di sini:
    //
    // 1. PORT. Sebelumnya menyambung ke 4001 (backend NestJS yang dihapus),
    //    padahal chat-server mendengarkan di 3001. Live chat tidak pernah
    //    tersambung.
    //
    // 2. IDENTITAS TAMU. chat-server kini mewajibkan handshake: tamu harus
    //    membawa `guestToken` yang diterbitkan server lewat POST /api/chat/start.
    //    Sebelumnya client mengirim `sessionId` pilihannya sendiri, sehingga
    //    siapa pun bisa menebak id sesi orang lain dan ikut membaca
    //    percakapannya. Sekarang sessionId diturunkan dari token, bukan dari
    //    apa yang dikirim client.
    //
    // 3. ALAMAT. Alamatnya kini satu sumber lewat `alamatChat()`. Bila ia
    //    mengembalikan `null` (build produksi tanpa NEXT_PUBLIC_CHAT_URL),
    //    koneksi TIDAK dibuka: menyambung ke cadangan localhost berarti setiap
    //    browser pengunjung menghubungi mesinnya sendiri. Pesannya dirender
    //    langsung dari `chatUrl`, bukan lewat `setError` di sini: `setState`
    //    sinkron di dalam effect memicu render berantai.
    if (!chatUrl) return;

    const storedToken = localStorage.getItem('utero_chat_token');

    socketRef.current = io(chatUrl, {
        auth: storedToken ? { guestToken: storedToken } : undefined,
    });

    socketRef.current.on('connect', () => {
        const storedId = localStorage.getItem('utero_chat_id');
        if (storedId && storedToken) {
            setSessionId(storedId);
            socketRef.current?.emit('joinRoom', storedId);
            // Riwayat diminta HANYA di jalur tamu yang kembali, dan hanya
            // setelah `joinRoom`. Sesi yang baru dibuat lewat
            // `claimGuestSession` belum punya satu pun pesan, jadi memintanya
            // di sana hanya menambah satu kueri yang selalu kosong.
            //
            // `sebelumId` tidak dikirim: yang diminta adalah halaman TERAKHIR,
            // yaitu pesan terbaru. Widget ini tidak punya tombol muat-lama —
            // tingginya 500px dan percakapan tamu jarang melewati satu halaman
            // — jadi parameter itu memang tidak dipakai di sisi ini.
            socketRef.current?.emit('mintaRiwayat', { sessionId: storedId });
        }
    });

    // Server menolak permintaan yang tidak berhak. Tanpa penanganan ini,
    // widget diam seolah-olah pesan terkirim padahal ditolak.
    socketRef.current.on('authError', (err: { event?: string; message?: string }) => {
        console.warn('Chat ditolak server:', err?.event, err?.message);
        // Sesi tersimpan kemungkinan sudah kedaluwarsa/dicabut — mulai dari awal.
        localStorage.removeItem('utero_chat_id');
        localStorage.removeItem('utero_chat_token');
        setSessionId(null);
    });

    socketRef.current.on('guestSessionClaimed', ({ sessionId: sid }: { sessionId: string }) => {
        setSessionId(sid);
        socketRef.current?.emit('joinRoom', sid);
    });

    // Payload-nya adalah satu baris `ChatMessage` yang dikirim chat-server
    // (`io.to(sessionId).emit("newMessage", originalMessage)`). socket.io
    // mengubahnya menjadi JSON, jadi `createdAt` tiba sebagai teks ISO —
    // itulah sebabnya `PesanChat.createdAt` bertipe `string`.
    socketRef.current.on('newMessage', (newMessage: PesanChat) => {
        if (localStorage.getItem('utero_chat_id') === newMessage.sessionId && newMessage.sender !== 'USER') {
            setMessages((prev) => [...prev, newMessage]);
        }
    });

    // Riwayat percakapan, jawaban atas `mintaRiwayat` di atas.
    //
    // Pendengar `loadHistory` yang dulu ada di sini SUDAH DIHAPUS, dan bukan
    // diganti namanya begitu saja: chat-server tidak pernah memancarkan
    // peristiwa bernama itu, jadi pendengarnya tidak pernah berjalan sekali pun
    // sementara keberadaannya membuat riwayat tampak seolah-olah sudah
    // ditangani. Yang tertutup sekarang adalah akibatnya: tamu yang kembali
    // membawa `utero_chat_token` berhasil `joinRoom` tapi kotaknya KOSONG,
    // seluruh riwayatnya ada di database tanpa satu pun jalur yang memintanya.
    //
    // Bentuknya diperiksa sebelum dipakai, alasannya sama seperti `newMessage`:
    // ini jalur di luar pemeriksaan tipe apa pun, dan `message` yang bukan teks
    // akan melempar di `renderMessageText` (`text.split`) lalu mematikan
    // seluruh widget.
    socketRef.current.on('riwayatChat', (masuk: unknown) => {
        if (masuk === null || typeof masuk !== 'object') return;
        const h = masuk as { sessionId?: unknown; pesan?: unknown };
        // Riwayat milik sesi LAIN dibuang. Server hanya mengirimkannya ke socket
        // yang memintanya, tapi satu socket bisa berpindah sesi lewat
        // `claimGuestSession` — dan jawaban permintaan lama yang tiba setelah
        // itu akan menempelkan percakapan sebelumnya ke kotak yang baru.
        if (h.sessionId !== localStorage.getItem('utero_chat_id')) return;
        if (!Array.isArray(h.pesan)) return;

        const bersih: PesanChat[] = [];
        for (const baris of h.pesan) {
            if (baris === null || typeof baris !== 'object') continue;
            const m = baris as Partial<PesanChat>;
            if (typeof m.id !== 'string' || typeof m.message !== 'string') continue;
            bersih.push({
                id: m.id,
                sessionId: typeof m.sessionId === 'string' ? m.sessionId : '',
                sender: typeof m.sender === 'string' ? m.sender : 'USER',
                message: m.message,
                createdAt:
                    typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
            });
        }
        if (bersih.length === 0) return;

        // Disisipkan di ATAS, dan id yang sudah ada disaring. Riwayat diminta
        // saat `connect` ketika daftarnya masih kosong, tapi pesan baru bisa
        // tiba lewat `newMessage` sebelum jawabannya datang — dan `key` yang
        // kembar membuat React merender salah satu baris tanpa memperbaruinya.
        setMessages((sebelumnya) => {
            const sudahAda = new Set(sebelumnya.map((m) => m.id));
            const baru = bersih.filter((m) => !sudahAda.has(m.id));
            return baru.length === 0 ? sebelumnya : [...baru, ...sebelumnya];
        });
    });

    // Riwayat gagal dimuat, TERPISAH dari `authError`.
    //
    // Peristiwanya sendiri ada supaya penanganannya bisa berbeda: `authError` di
    // atas menghapus `utero_chat_id` dan `utero_chat_token` lalu mengembalikan
    // tamu ke formulir kosong, dan itu benar untuk sesi yang dicabut — tapi
    // salah untuk riwayat yang tertolak jatah atau database yang sedang
    // bermasalah. Sesinya masih sah; yang gagal hanya pemuatan riwayat, jadi
    // yang dilakukan di sini cuma memberi tahu. Pesan yang baru dikirim tetap
    // masuk lewat `newMessage`.
    socketRef.current.on('riwayatGagal', (masuk: unknown) => {
        const g = masuk !== null && typeof masuk === 'object'
            ? (masuk as { message?: unknown })
            : {};
        setError(
            typeof g.message === 'string' && g.message.trim() !== ''
                ? g.message
                : 'Riwayat percakapan gagal dimuat.'
        );
    });

    return () => {
      socketRef.current?.disconnect();
    };
    // `chatUrl` masuk ke daftar dependensi. Nilainya memang tidak pernah
    // berubah — `useState(alamatChat)` menghitungnya sekali seumur komponen —
    // jadi effect ini tetap berjalan tepat satu kali, sama seperti sebelumnya.
    // Yang berubah adalah daftar `[]` tidak lagi BERBOHONG: daftar kosong
    // menyatakan effect tidak bergantung pada nilai apa pun dari render,
    // padahal baris 56 dan 60 keduanya membaca `chatUrl`. Kebohongan itu yang
    // berbahaya, bukan nilainya: begitu seseorang menjadikan alamat chat bisa
    // berubah (misalnya membacanya dari `SystemSetting`), socket tetap
    // tersambung ke alamat lama tanpa satu pun peringatan.
  }, [chatUrl]);

  useEffect(() => {
      if (messages.length > lastMsgCount.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          lastMsgCount.current = messages.length;
      }
  }, [messages, isOpen]);

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!chatUrl) {
          setError(PESAN_CHAT_BELUM_DIKONFIGURASI);
          return;
      }

      setLoading(true);
      try {
          const res = await fetch(`${chatUrl}/api/chat/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form)
          });
          // `await res.json()` tanpa penjaga: balasan 429 atau 500 yang berbadan
          // HTML (proxy di depan chat-server) membuatnya melempar, lemparannya
          // mendarat di `catch` di bawah, dan pengunjung membaca "Tidak bisa
          // menghubungi layanan chat" padahal layanannya menjawab — hanya
          // menolak, dan alasannya ("Terlalu banyak percakapan dimulai. Coba
          // lagi dalam 420 detik.") justru yang perlu ia tahu.
          const session = await bacaBadan(res);
          if (typeof session.id === 'string' && typeof session.guestToken === 'string') {
              localStorage.setItem('utero_chat_id', session.id);
              localStorage.setItem('utero_chat_token', session.guestToken);
              // Socket sudah tersambung sebagai tamu tanpa identitas. Alih-alih
              // menyambung ulang, tukarkan token di koneksi yang sama —
              // server yang menetapkan sessionId, lalu membalas
              // `guestSessionClaimed` yang menjalankan joinRoom.
              socketRef.current?.emit('claimGuestSession', session.guestToken);
          } else {
              // `error`, bukan `message`: chat-server adalah server Express
              // terpisah dan setiap penolakannya berbunyi `{ error }` —
              // 400 data kurang, 429 terlalu sering, 500 gagal. Karena itu
              // `bacaJawaban` (yang membaca `message`) tidak dipakai di sini.
              const alasan = session.error;
              setError(typeof alasan === 'string' && alasan.trim() !== ''
                  ? alasan
                  : 'Gagal memulai sesi chat.');
          }
      } catch (e) {
        console.error("Gagal memulai sesi chat:", e);
        setError('Tidak bisa menghubungi layanan chat.');
      }
      setLoading(false);
  };

  const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if(!input.trim() || !sessionId || !socketRef.current) return;
        const userMsg = input;
        // Bentuknya disamakan dengan pesan yang datang dari socket: `sessionId`
        // ikut, dan `createdAt` berupa teks ISO — bukan objek `Date`. Dulu
        // keduanya menyimpang, dan karena array-nya bertipe `any[]` tidak ada
        // yang menuntut kesamaan itu.
        const tempMessage: PesanChat = {
            id: Date.now().toString(),
            sessionId,
            sender: 'USER',
            message: userMsg,
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempMessage]);
        setInput("");
        socketRef.current.emit('sendMessage', { 
            sessionId,
            sender: 'USER',
            message: userMsg 
        });
    };

  const renderMessageText = (text: string) => {
    if (!text) return "";
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = text.split(regex);
    return parts.map((part, index) => {
        if (index % 3 === 1) {
            const url = parts[index + 1];
            return (
                <Link key={index} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs font-bold border border-blue-200 mx-1 hover:bg-blue-100">
                    {part} <ArrowRight size={12} className="ml-1" />
                </Link>
            );
        }
        if (index % 3 === 0) {
            return <span key={index}>{part}</span>;
        }
        return null;
    });
  };

  return (
    <>
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} className="fixed bottom-6 right-6 z-[9999] bg-gradient-to-r from-utero to-red-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition flex items-center gap-2 group animate-in slide-in-from-bottom-4">
          <MessageCircle size={28}/><span className="font-bold pr-2 hidden group-hover:inline">Live Chat</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[9999] w-[350px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[500px] animate-in slide-in-from-bottom-10 fade-in font-sans">
          <div className="bg-utero p-4 flex justify-between items-center text-white shadow-md shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-2 rounded-full"><User size={20}/></div>
              <div><h3 className="font-bold text-sm">Customer Service</h3><p className="text-[10px] text-white/90">Kami siap membantu 24/7</p></div>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded"><X size={20}/></button>
          </div>

          {!chatUrl ? (
            // Tanpa alamat chat tidak ada form sama sekali: mengisi tiga kolom
            // lalu ditolak lebih buruk daripada diberi tahu lebih dulu.
            <div role="alert" className="p-6 flex-1 flex flex-col justify-center bg-gray-50 text-center">
              <h4 className="text-gray-800 font-bold text-base mb-2">Chat belum tersedia</h4>
              <p className="text-xs text-gray-600 leading-relaxed">{PESAN_CHAT_BELUM_DIKONFIGURASI}</p>
            </div>
          ) : !sessionId ? (
            <div className="p-6 flex-1 flex flex-col justify-center bg-gray-50">
              <h4 className="text-gray-800 font-bold text-lg mb-6 text-center">Halo! Silakan isi data 👋</h4>
              {error && (
                <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </div>
              )}
              <form onSubmit={handleRegister} className="space-y-3">
                <input className="w-full border p-3 rounded-lg text-sm" placeholder="Nama Lengkap" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required/>
                <input className="w-full border p-3 rounded-lg text-sm" placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required/>
                <input className="w-full border p-3 rounded-lg text-sm" placeholder="Nomor WhatsApp" type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required/>
                <button disabled={loading} className="w-full bg-utero text-white font-bold py-3 rounded-lg hover:bg-red-700 transition mt-2 shadow-lg">{loading ? <Loader2 className="animate-spin mx-auto"/> : 'Mulai Chatting'}</button>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50">
              {/* `error` dulu hanya dirender di cabang formulir, jadi kegagalan
                  yang terjadi SETELAH percakapan dimulai — riwayat yang gagal
                  dimuat, misalnya — menyetel state yang tidak ada satu pun
                  tempat menampilkannya. Tamu melihat kotak yang lebih kosong
                  dari isi percakapannya dan tidak diberi tahu apa pun. */}
              {error && (
                <div role="alert" className="mx-3 mt-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 leading-relaxed">
                  {error}
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* `key={i}` diganti `key={msg.id}`. Indeks array sebagai kunci
                    baru saja menjadi salah: riwayat disisipkan di ATAS daftar,
                    jadi setiap pesan yang sudah tampil berpindah indeks — React
                    lalu menganggap baris yang sama sebagai baris yang berbeda,
                    dan isi gelembungnya tertukar dengan pengirim yang salah. */}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-xs shadow-sm leading-relaxed ${
                        msg.sender === 'USER' 
                            ? 'bg-blue-600 text-white rounded-br-none' 
                            : msg.sender === 'ADMIN' 
                                ? 'bg-orange-100 text-gray-800 rounded-bl-none border border-orange-200' 
                                : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                    }`}>
                      {msg.sender === 'ADMIN' && <div className="text-[9px] font-bold text-orange-600 mb-1">Admin Support</div>}
                      {msg.sender === 'BOT' && <div className="text-[9px] font-bold text-red-600 mb-1">Customer Service AI</div>}
                      {renderMessageText(msg.message)}
                    </div>
                  </div>
                ))}
                {loading && <div className="text-gray-400 text-xs italic ml-2">Mengetik...</div>}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSend} className="p-3 bg-white border-t flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ketik pesan..." className="flex-1 border bg-gray-50 rounded-full px-4 py-2.5 text-xs focus:outline-none focus:border-utero"/>
                <button disabled={loading} className="bg-utero p-2.5 rounded-full text-white hover:scale-105 transition shadow-md"><Send size={16}/></button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}