'use client';

import { io } from "socket.io-client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, Loader2, MessageSquare, Send, ArrowRight } from 'lucide-react';
import { getMessagesForSession } from '@/app/admin/(dashboard)/live-chat/actions';

// Label status percakapan. `ChatSessionStatus` punya tiga nilai dan ketiganya
// benar-benar ditulis: OPEN (tamu menunggu), AGENT (sudah dipegang admin),
// CLOSED (ditutup lewat /api/admin/chat/close).
const LABEL_STATUS: Record<string, { teks: string; kelas: string }> = {
    OPEN: { teks: 'Menunggu dijawab', kelas: 'bg-amber-100 text-amber-800' },
    AGENT: { teks: 'Sedang ditangani', kelas: 'bg-blue-100 text-blue-800' },
    CLOSED: { teks: 'Ditutup', kelas: 'bg-gray-100 text-gray-600' },
};

const BadgeStatus = ({ status }: { status?: string }) => {
    const label = LABEL_STATUS[status || ''] || { teks: status || 'Tidak diketahui', kelas: 'bg-gray-100 text-gray-600' };
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${label.kelas}`}>
            {label.teks}
        </span>
    );
};

// [DIPERBARUI] ChatList sekarang menerima data sesi
//
// Kotak pencarian di sini dulu tidak punya `value` maupun `onChange`: sebuah
// kotak yang menerima ketikan lalu membuangnya. Operator yang punya 40
// percakapan mengetik nama pelanggan, daftarnya tidak bergerak, dan ia
// menyimpulkan pelanggan itu tidak ada di sistem. Kini benar-benar menyaring.
const ChatList = ({ sessions, onSelectSession, selectedSessionId }: any) => {
    const [cari, setCari] = useState('');

    const kunci = cari.trim().toLowerCase();
    const terlihat = !kunci
        ? sessions || []
        : (sessions || []).filter((s: any) =>
              [s.guestName, s.guestEmail, s.guestPhone]
                  .filter(Boolean)
                  .some((nilai: string) => nilai.toLowerCase().includes(kunci))
          );

    return (
    <div className="h-full border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 className="font-bold text-lg text-gray-800">Inbox</h2>
            <div className="relative mt-2">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                    type="search"
                    value={cari}
                    onChange={(e) => setCari(e.target.value)}
                    aria-label="Cari percakapan berdasarkan nama, email, atau nomor telepon"
                    placeholder="Cari nama, email, telepon..."
                    className="w-full pl-9 p-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {terlihat.length > 0 ? (
                terlihat.map((session: any) => (
                    <button
                        type="button"
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        aria-current={selectedSessionId === session.id ? 'true' : undefined}
                        className={`block w-full text-left p-3 rounded-lg transition-colors ${selectedSessionId === session.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                    >
                        {/* `<span>`, bukan `<p>`: paragraf tidak sah di dalam
                            tombol, dan peramban akan memindahkannya keluar. */}
                        <span className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-gray-900 truncate">{session.guestName}</span>
                            <BadgeStatus status={session.status} />
                        </span>
                        <span className="block text-xs text-gray-600 truncate mt-1">{session.messages?.[0]?.message || 'Tidak ada pesan'}</span>
                    </button>
                ))
            ) : (
                <div className="text-center text-sm text-gray-400 p-8">
                    {kunci
                        ? `Tidak ada percakapan yang cocok dengan "${cari.trim()}".`
                        : 'Tidak ada sesi chat.'}
                </div>
            )}
        </div>
    </div>
    );
};

// [BARU] Fungsi helper untuk merender link
const renderMessageText = (text: string) => {
    if (!text) return "";
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = text.split(regex);

    return parts.map((part, index) => {
        if (index % 3 === 1) { // Ini adalah teks link
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

const ChatRoom = ({ session, messages, isLoading, onSendMessage }: { session: any, messages: any[], isLoading: boolean, onSendMessage: (msg: string) => void }) => {
    const [newMessage, setNewMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    if (!session) {
        return (
            <div className="h-full flex flex-col bg-gray-50/80 items-center justify-center text-center">
                <MessageSquare size={40} className="text-gray-300" />
                <h3 className="mt-4 font-bold text-gray-800">Pilih Percakapan</h3>
                <p className="text-sm text-gray-500">Pilih salah satu percakapan dari daftar di sebelah kiri untuk melihat pesan.</p>
            </div>
        );
    }

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim()) {
            onSendMessage(newMessage);
            setNewMessage("");
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-50/80">
            <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center sticky top-0 z-10">
                <div>
                    <h3 className="font-bold text-gray-800">{session.guestName}</h3>
                    {/* Badge hijau "Online" di sini DITULIS TETAP di kode: setiap
                        percakapan, selamanya, tanpa membaca apa pun. Kolom
                        `ChatSession.isOnline` memang ada, tapi hanya ditulis di
                        dua tempat (dibuat `true`, lalu `false` saat ditutup) dan
                        tidak pernah mengikuti koneksi socket yang sesungguhnya —
                        jadi nilainya juga bukan kehadiran. CS melihat "Online",
                        menyangka tamunya sedang menatap layar, dan menulis
                        jawaban panjang untuk orang yang sudah pergi sejak pagi.
                        Diganti status percakapan yang benar-benar dicatat. */}
                    <BadgeStatus status={session.status} />
                </div>
                {/* Tombol ikon `SlidersHorizontal` DIBUANG: tidak punya
                    `onClick`, tidak punya nama yang terbaca, dan tidak ada satu
                    pun panel pengaturan percakapan di aplikasi ini untuk
                    dibukanya. */}
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="animate-spin text-gray-400" />
                    </div>
                ) : (
                    messages.map((msg: any) => (
                        <div key={msg.id} className={`mb-4 flex ${msg.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-3 rounded-lg max-w-xs ${msg.sender === 'USER' ? 'bg-blue-500 text-white' : 'bg-white border'}`}>
                                <p className="text-sm">{renderMessageText(msg.message)}</p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 bg-white border-t border-gray-200 sticky bottom-0">
                <form onSubmit={handleSendMessage} className="relative">
                    <textarea 
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Ketik balasan Anda..." 
                        rows={2} 
                        className="w-full text-sm p-2 pr-12 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e);
                            }
                        }}
                    />
                    {/* `disabled:bg-gray-300` sudah ditulis di kelasnya, tapi
                        `disabled` sendiri tidak pernah dipasang: gaya untuk
                        keadaan yang tidak pernah terjadi. Tombolnya kini benar
                        mati saat tidak ada yang bisa dikirim, dan `aria-label`
                        memberinya nama — ikon panah saja tidak terbaca. */}
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        aria-label="Kirim balasan"
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition disabled:bg-gray-300 disabled:hover:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        <Send size={16} aria-hidden="true" />
                    </button>
                </form>
            </div>
        </div>
);
};

const VisitorDetails = ({ session }: { session: any }) => {
    if (!session) return <div className="h-full border-l border-gray-200 bg-white p-4"></div>; // Return empty state

    return (
        <div className="h-full border-l border-gray-200 bg-white">
            <div className="p-4 border-b border-gray-200 text-center sticky top-0 bg-white z-10">
                <div className="w-16 h-16 rounded-full bg-blue-100 mx-auto flex items-center justify-center font-bold text-blue-600 text-2xl border-2 border-blue-200">
                    {session.guestName?.charAt(0).toUpperCase()}
                </div>
                <h3 className="font-bold mt-2">{session.guestName}</h3>
                <p className="text-xs text-gray-500">{session.guestEmail}</p>
            </div>
            <div className="p-4 overflow-y-auto">
                 <h4 className="font-semibold text-xs text-gray-500 uppercase mb-2">Detail Pengunjung</h4>
                 {/* Empat baris di sini dulu DITULIS TETAP di kode: "Lokasi:
                     Indonesia", "IP Address: 127.0.0.1", "Browser: Chrome",
                     "OS: Windows". Tidak satu pun dibaca dari mana pun; 127.0.0.1
                     adalah alamat mesin itu sendiri, bukan alamat siapa pun.
                     Ini bukan sekadar kosmetik: telemetri palsu yang tampak
                     meyakinkan dipakai CS untuk mengambil keputusan — memutuskan
                     sebuah percakapan mencurigakan atau tidak, atau menjawab
                     "sepertinya Anda dari Jakarta". Data pengunjung yang benar
                     (IP, user agent, geolokasi) sama sekali tidak dikumpulkan
                     oleh chat-server dan tidak ada kolomnya di `ChatSession`;
                     mengumpulkannya adalah fitur, dan fitur yang menyangkut data
                     pribadi harus diputuskan dengan sadar, bukan dipura-purakan.
                     Diganti data kontak yang MEMANG tersimpan dan memang
                     diberikan tamu sendiri saat memulai percakapan. */}
                 <dl className="text-sm space-y-2 text-gray-700">
                    <div className="flex gap-2">
                        <dt className="font-semibold w-24 shrink-0">Telepon</dt>
                        <dd className="break-all">{session.guestPhone || <span className="text-gray-400">Tidak diisi</span>}</dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="font-semibold w-24 shrink-0">Email</dt>
                        <dd className="break-all">{session.guestEmail || <span className="text-gray-400">Tidak diisi</span>}</dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="font-semibold w-24 shrink-0">Status</dt>
                        <dd><BadgeStatus status={session.status} /></dd>
                    </div>
                    <div className="flex gap-2">
                        <dt className="font-semibold w-24 shrink-0">Mulai</dt>
                        <dd>
                            {session.createdAt
                                ? new Date(session.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                                : <span className="text-gray-400">Tidak diketahui</span>}
                        </dd>
                    </div>
                 </dl>
            </div>
        </div>
);
};



export default function CS_InboxLayout({ sessions: initialSessions }: { sessions: any[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const socketRef = useRef<any>(null);

  // Efek untuk koneksi Socket.IO
  useEffect(() => {
    // `withCredentials` wajib: chat-server mengenali admin dari cookie sesi
    // NextAuth pada handshake. Tanpa flag ini browser tidak mengirim cookie ke
    // origin berbeda (app :4000 → chat :3001), admin diperlakukan sebagai tamu,
    // dan setiap `joinRoom` ditolak — inbox tampil kosong tanpa penjelasan.
    const chatUrl = process.env.NEXT_PUBLIC_CHAT_URL || 'http://localhost:3001';
    const socket = io(chatUrl, { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to chat server');
    });

    socket.on('authError', (err: { event?: string; message?: string }) => {
      console.warn('Chat server menolak permintaan:', err?.event, err?.message);
    });

    socket.on('newMessage', (newMessage) => {
      if (newMessage.sessionId === selectedSession?.id) {
        setMessages((prevMessages) => [...prevMessages, newMessage]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedSession]);

  const handleSelectSession = async (session: any) => {
    if (selectedSession?.id) {
      socketRef.current.emit('leaveRoom', selectedSession.id);
    }
    setSelectedSession(session);
    setIsLoadingMessages(true);
    // `getMessagesForSession` tidak lagi menelan galat databasenya sendiri
    // (dulu ia mengembalikan `null`, yang di sini menjadi `|| []` — percakapan
    // tampil kosong alih-alih gagal, dan CS menjawab pelanggan tanpa riwayat).
    // Karena itu pemanggil yang wajib menangkapnya. Tanpa `try/catch` di sini,
    // Promise yang ditolak meninggalkan `isLoadingMessages` bernilai `true`
    // selamanya: panel percakapan berputar tanpa akhir.
    try {
      const fullSession = await getMessagesForSession(session.id);
      setMessages(fullSession?.messages || []);
      socketRef.current.emit('joinRoom', session.id);
    } catch (e: any) {
      setMessages([]);
      alert(
        `Riwayat percakapan gagal dimuat: ${e?.message || 'galat tidak diketahui'}. ` +
          'Jangan menjawab sebelum riwayatnya tampil — pilih ulang percakapan ini.'
      );
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSendMessage = (message: string) => {
    if (socketRef.current && selectedSession) {
      // 'AGENT' bukan salah satu nilai sah kolom ChatSender — yang ada hanya
      // USER, ADMIN, BOT, SYSTEM. Server memang sudah mengabaikan `sender`
      // kiriman client dan menuliskan 'ADMIN' sendiri (chat-server/index.js),
      // jadi isi database tidak pernah salah. Yang salah hanya pesan sementara
      // yang ditampilkan sebelum jawaban server datang: nilainya tidak cocok
      // dengan apa pun, sehingga baris itu sempat tampil di sisi yang keliru
      // lalu melompat saat pesan aslinya tiba.
      const tempMessage = {
        id: Date.now().toString(),
        sessionId: selectedSession.id,
        sender: 'ADMIN',
        message: message,
        createdAt: new Date().toISOString(),
      };

      // [BARU] Optimistic UI Update untuk admin
      setMessages((prevMessages) => [...prevMessages, tempMessage]);

      // `sender` sengaja tidak dikirim: server yang menentukannya dari
      // identitas socket, bukan dari isi payload.
      socketRef.current.emit('sendMessage', {
        sessionId: selectedSession.id,
        message: message,
      });
    }
  };

  return (
    <div className="grid grid-cols-12 h-screen w-full overflow-hidden">
        <div className="col-span-12 md:col-span-3 h-screen overflow-y-auto">
            <ChatList 
                sessions={sessions} 
                onSelectSession={handleSelectSession}
                selectedSessionId={selectedSession?.id}
            />
        </div>
        <div className="col-span-12 md:col-span-6 h-screen overflow-y-auto">
            <ChatRoom 
                session={selectedSession} 
                messages={messages} 
                isLoading={isLoadingMessages} 
                onSendMessage={handleSendMessage}
            />
        </div>
        <div className="hidden md:block md:col-span-3 h-screen overflow-y-auto">
            <VisitorDetails session={selectedSession} />
        </div>
    </div>
  );
}
