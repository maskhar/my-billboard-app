'use client';

import { io } from "socket.io-client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, Loader2, MessageSquare, Send, ArrowRight, ChevronUp } from 'lucide-react';
import {
    getMessagesForSession,
    getRiwayatLebihLama,
} from '@/app/admin/(dashboard)/live-chat/actions';
import { alamatChat, PESAN_CHAT_BELUM_DIKONFIGURASI } from '@/lib/alamat-chat';
import type { PesanChat, SesiChat } from '@/lib/tipe-chat';

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

// Kehadiran tamu, sekarang benar-benar dibaca.
//
// Badge hijau "Online" di panel ini dulu DITULIS TETAP di kode: setiap
// percakapan, selamanya, tanpa membaca apa pun. Kolom `ChatSession.isOnline`
// memang ada tapi tidak pernah mengikuti koneksi socket, jadi sekadar
// membacanya pun belum cukup. `chat-server/kehadiran.js` kini mengukurnya dari
// socket yang sesungguhnya, dan inilah yang menampilkannya.
//
// Kata "Sedang online" dan "Sedang tidak online" dipilih apa adanya. Petugas
// memakai tanda ini untuk memutuskan antara membalas di chat atau mengirim
// email, jadi yang perlu ia tahu bukan lencana berwarna, tapi apakah orangnya
// akan membaca jawabannya sekarang.
const BadgeKehadiran = ({ isOnline }: { isOnline: boolean }) => (
    <span
        className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
            isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}
    >
        <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
        />
        {isOnline ? 'Sedang online' : 'Sedang tidak online'}
    </span>
);

// [DIPERBARUI] ChatList sekarang menerima data sesi
//
// Kotak pencarian di sini dulu tidak punya `value` maupun `onChange`: sebuah
// kotak yang menerima ketikan lalu membuangnya. Operator yang punya 40
// percakapan mengetik nama pelanggan, daftarnya tidak bergerak, dan ia
// menyimpulkan pelanggan itu tidak ada di sistem. Kini benar-benar menyaring.
const ChatList = ({
    sessions,
    onSelectSession,
    selectedSessionId,
}: {
    sessions: SesiChat[];
    onSelectSession: (sesi: SesiChat) => void;
    selectedSessionId?: string;
}) => {
    const [cari, setCari] = useState('');

    const kunci = cari.trim().toLowerCase();
    const terlihat = !kunci
        ? sessions
        : sessions.filter((s) =>
              [s.guestName, s.guestEmail, s.guestPhone]
                  .filter(Boolean)
                  .some((nilai) => nilai.toLowerCase().includes(kunci))
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
                terlihat.map((session) => (
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
                            <span className="flex items-center gap-1.5 min-w-0">
                                {/* Titik kehadiran, dengan namanya terbaca pembaca
                                    layar — warna saja bukan keterangan. */}
                                <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${session.isOnline ? 'bg-green-500' : 'bg-gray-300'}`}
                                    role="img"
                                    aria-label={session.isOnline ? 'Sedang online' : 'Sedang tidak online'}
                                />
                                <span className="font-bold text-sm text-gray-900 truncate">{session.guestName}</span>
                            </span>
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

const ChatRoom = ({
    session,
    messages,
    isLoading,
    adaRiwayatLebihLama,
    memuatLama,
    onMuatLama,
    onSendMessage,
}: {
    session: SesiChat | null;
    messages: PesanChat[];
    isLoading: boolean;
    adaRiwayatLebihLama: boolean;
    memuatLama: boolean;
    onMuatLama: () => void;
    onSendMessage: (msg: string) => void;
}) => {
    const [newMessage, setNewMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const daftarRef = useRef<HTMLDivElement>(null);

    // Tinggi daftar SEBELUM pesan lama disisipkan, dicatat saat tombolnya
    // ditekan. Bukan kosmetik: menyisipkan 50 pesan di ATAS daftar menggeser
    // seluruh isinya ke bawah, dan tanpa pemulihan ini CS yang baru saja
    // menekan "muat pesan lama" melihat layarnya melompat ke bagian yang sama
    // sekali lain — lalu menekan tombolnya lagi karena menyangka tidak
    // terjadi apa-apa.
    const tinggiSebelumRef = useRef<number | null>(null);

    // Id pesan TERAKHIR pada render sebelumnya.
    //
    // Efek gulir di sini dulu berbunyi `useEffect(scrollToBottom, [messages])`:
    // setiap perubahan array, apa pun sebabnya, menyeret panel ke dasar. Itu
    // benar untuk pesan baru yang masuk dan SALAH untuk pesan lama yang
    // disisipkan di atas — riwayat yang baru dimuat langsung tergulir keluar
    // dari pandangan pada milidetik yang sama ia tiba.
    const idTerakhirRef = useRef<string | null>(null);

    useEffect(() => {
        const daftar = daftarRef.current;
        const tinggiSebelum = tinggiSebelumRef.current;
        const idTerakhir = messages.length > 0 ? messages[messages.length - 1].id : null;

        // Pesan lama baru saja disisipkan: pulihkan posisi baca, jangan
        // menggulir ke dasar.
        if (tinggiSebelum !== null) {
            tinggiSebelumRef.current = null;
            if (daftar) {
                daftar.scrollTop += daftar.scrollHeight - tinggiSebelum;
            }
            idTerakhirRef.current = idTerakhir;
            return;
        }

        // Gulir ke dasar hanya bila ujung daftar benar-benar berubah, yaitu
        // ada pesan baru. Berpindah percakapan juga mengubahnya, dan itu
        // memang perlu digulir.
        if (idTerakhir !== idTerakhirRef.current) {
            idTerakhirRef.current = idTerakhir;
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleMuatLama = () => {
        // Tingginya dicatat SEBELUM permintaan dikirim, bukan setelah
        // jawabannya tiba: pada saat pesan lama sudah masuk ke state, tinggi
        // daftarnya sudah berubah dan angka pembandingnya hilang.
        tinggiSebelumRef.current = daftarRef.current?.scrollHeight ?? null;
        onMuatLama();
    };

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
                    {/* Dua keterangan, karena keduanya menjawab hal berbeda:
                        status percakapan (sudah dipegang siapa) dan kehadiran
                        tamu (jawabannya akan dibaca sekarang atau tidak). */}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <BadgeStatus status={session.status} />
                        <BadgeKehadiran isOnline={session.isOnline} />
                    </div>
                </div>
                {/* Tombol ikon `SlidersHorizontal` DIBUANG: tidak punya
                    `onClick`, tidak punya nama yang terbaca, dan tidak ada satu
                    pun panel pengaturan percakapan di aplikasi ini untuk
                    dibukanya. */}
            </div>
            <div ref={daftarRef} className="flex-1 p-6 overflow-y-auto">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="animate-spin text-gray-400" />
                    </div>
                ) : (
                    <>
                    {/* Riwayat yang dipotong tidak lagi hanya DINYATAKAN.
                        Kotak masuk memuat 200 pesan terakhir, dan panel ini
                        sejak awal sudah mengatakannya — tapi tanpa satu pun
                        jalur untuk mengambil sisanya. Pemberitahuan tanpa jalan
                        keluar: CS membaca percakapan panjang dari atas,
                        menyimpulkan pesan ke-200 adalah awal pembicaraan, lalu
                        menjawab tanpa tahu apa yang sudah dijanjikan. Sekarang
                        ada tombolnya. */}
                    {adaRiwayatLebihLama && (
                        <div className="mb-4 text-center">
                            <button
                                type="button"
                                onClick={handleMuatLama}
                                disabled={memuatLama}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {memuatLama ? (
                                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <ChevronUp size={12} aria-hidden="true" />
                                )}
                                {memuatLama ? 'Memuat pesan lama…' : 'Muat pesan yang lebih lama'}
                            </button>
                            {/* Keterangan tetap ada di sampingnya: tombol
                                sendiri tidak mengatakan bahwa yang tampil
                                sekarang BUKAN awal percakapan. */}
                            <p className="mt-1.5 text-[10px] text-gray-500">
                                Percakapan ini punya riwayat yang lebih lama dari yang tampil.
                            </p>
                        </div>
                    )}
                    {messages.map((msg) => (
                        <div key={msg.id} className={`mb-4 flex ${msg.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-3 rounded-lg max-w-xs ${msg.sender === 'USER' ? 'bg-blue-500 text-white' : 'bg-white border'}`}>
                                <p className="text-sm">{renderMessageText(msg.message)}</p>
                            </div>
                        </div>
                    ))}
                    </>
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

const VisitorDetails = ({ session }: { session: SesiChat | null }) => {
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
                        <dt className="font-semibold w-24 shrink-0">Kehadiran</dt>
                        <dd><BadgeKehadiran isOnline={session.isOnline} /></dd>
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



export default function CS_InboxLayout({ sessions }: { sessions: SesiChat[] }) {
  // `useState(initialSessions)` DIHAPUS. Salinannya tidak pernah diperbarui —
  // `setSessions` nol pemanggil — sehingga daftar sesi justru MEMBEKU pada
  // keadaan saat halaman pertama dirender: percakapan baru yang masuk tidak
  // muncul walaupun `router.refresh()` atau navigasi memberi prop yang baru.
  // Prop dari server dipakai langsung.
  const [selectedSession, setSelectedSession] = useState<SesiChat | null>(null);
  const [messages, setMessages] = useState<PesanChat[]>([]);
  const [adaRiwayatLebihLama, setAdaRiwayatLebihLama] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [memuatLama, setMemuatLama] = useState(false);
  const [galatChat, setGalatChat] = useState('');
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  // Kehadiran yang datang lewat socket, menimpa potret dari server.
  //
  // Disimpan terpisah dari `sessions` karena prop itu milik server: ia diganti
  // utuh setiap kali halaman dirender ulang, dan menulis ke dalamnya berarti
  // perubahan yang tiba lewat socket lenyap pada `router.refresh()` berikutnya.
  // Peta ini hanya memuat sesi yang kehadirannya BERUBAH sejak halaman dimuat,
  // jadi sesi yang tidak ada di sini memakai nilai dari server apa adanya.
  const [kehadiran, setKehadiran] = useState<Record<string, boolean>>({});

  // Id percakapan yang sedang dibuka, dibaca DARI DALAM listener socket.
  //
  // Efek koneksi di bawah dulu bergantung pada `selectedSession`, jadi setiap
  // kali petugas berpindah percakapan seluruh socket diputus lalu dibangun
  // ulang — dan peristiwa yang tiba dalam jeda itu hilang. Yang sebenarnya
  // dibutuhkan listener hanyalah id yang sedang terbuka, bukan koneksi baru;
  // ref inilah yang menyediakannya, sehingga socketnya dibuat sekali saja.
  const idTerpilihRef = useRef<string | null>(null);
  idTerpilihRef.current = selectedSession?.id ?? null;

  // Efek untuk koneksi Socket.IO
  useEffect(() => {
    // `withCredentials` wajib: chat-server mengenali admin dari cookie sesi
    // NextAuth pada handshake. Tanpa flag ini browser tidak mengirim cookie ke
    // origin berbeda (app :4000 → chat :3001), admin diperlakukan sebagai tamu,
    // dan setiap `joinRoom` ditolak — inbox tampil kosong tanpa penjelasan.
    //
    // Alamatnya satu sumber lewat `alamatChat()`. `null` berarti build produksi
    // dibuat tanpa NEXT_PUBLIC_CHAT_URL: koneksi tidak dibuka, dan operator
    // diberi tahu — bukan dibiarkan menatap inbox yang tidak pernah hidup.
    const chatUrl = alamatChat();
    if (!chatUrl) {
      setGalatChat(
        `Chat tidak tersambung. ${PESAN_CHAT_BELUM_DIKONFIGURASI} ` +
          'Pesan baru tidak akan masuk sampai ini dibereskan.'
      );
      return;
    }
    setGalatChat('');

    const socket = io(chatUrl, { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to chat server');
    });

    socket.on('authError', (err: { event?: string; message?: string }) => {
      console.warn('Chat server menolak permintaan:', err?.event, err?.message);
    });

    // Bentuknya diperiksa sebelum dipakai, bukan dipercaya. Payload ini datang
    // dari socket — jalur di luar pemeriksaan tipe apa pun — dan langsung
    // dirender sebagai isi percakapan. `message` yang bukan teks akan melempar
    // di `renderMessageText` (`text.split`) dan mematikan seluruh kotak masuk.
    socket.on('newMessage', (masuk: unknown) => {
      if (masuk === null || typeof masuk !== 'object') return;
      const m = masuk as Partial<PesanChat>;
      if (typeof m.id !== 'string' || typeof m.message !== 'string') return;
      if (m.sessionId !== idTerpilihRef.current) return;

      setMessages((sebelumnya) => [
        ...sebelumnya,
        {
          id: m.id as string,
          sessionId: m.sessionId as string,
          sender: typeof m.sender === 'string' ? m.sender : 'USER',
          message: m.message as string,
          createdAt:
            typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
        },
      ]);
    });

    // Kehadiran tamu, disiarkan chat-server saat kolomnya BENAR-BENAR berubah.
    //
    // Tanpa listener ini titik hijau di daftar hanya potret saat halaman dimuat,
    // dan potret yang membeku adalah persis cacat yang sedang dibereskan —
    // petugas menatap tanda hijau milik tamu yang sudah pergi setengah jam lalu.
    //
    // Bentuknya diperiksa sebelum dipakai, alasannya sama seperti `newMessage`:
    // ini jalur di luar pemeriksaan tipe apa pun. `isOnline` yang bukan boolean
    // akan dirender sebagai warna hijau untuk nilai apa pun yang truthy.
    socket.on('presenceChanged', (masuk: unknown) => {
      if (masuk === null || typeof masuk !== 'object') return;
      const p = masuk as { sessionId?: unknown; isOnline?: unknown };
      if (typeof p.sessionId !== 'string' || typeof p.isOnline !== 'boolean') return;

      const sessionId = p.sessionId;
      const isOnline = p.isOnline;
      setKehadiran((sebelumnya) =>
        sebelumnya[sessionId] === isOnline
          ? sebelumnya
          : { ...sebelumnya, [sessionId]: isOnline }
      );
    });

    return () => {
      socket.disconnect();
    };
    // Sengaja dibangun SEKALI, dan daftar dependensinya memang kosong: yang
    // dipakai di dalam hanyalah penyetel state (stabil) dan `idTerpilihRef`
    // (ref, juga stabil). Percakapan yang terbuka dibaca lewat ref itu, bukan
    // lewat closure — itulah yang membuat berpindah percakapan tidak lagi
    // memutus koneksinya.
  }, []);

  const handleSelectSession = async (session: SesiChat) => {
    // `socketRef.current` bisa `null`: efek koneksi keluar lebih awal saat
    // alamat chat tidak ada. Tanpa `?.` baris ini melempar TypeError dan
    // seluruh panel berhenti merender — galat konfigurasi berubah menjadi
    // halaman putih.
    if (selectedSession?.id) {
      socketRef.current?.emit('leaveRoom', selectedSession.id);
    }
    setSelectedSession(session);
    setIsLoadingMessages(true);
    // Penanda muat-lama disetel ulang di sini. Tanpa ini, berpindah percakapan
    // saat halaman lama sedang diminta meninggalkan tombolnya mati selamanya di
    // percakapan yang baru dibuka.
    setMemuatLama(false);
    // `getMessagesForSession` tidak lagi menelan galat databasenya sendiri
    // (dulu ia mengembalikan `null`, yang di sini menjadi `|| []` — percakapan
    // tampil kosong alih-alih gagal, dan CS menjawab pelanggan tanpa riwayat).
    // Karena itu pemanggil yang wajib menangkapnya. Tanpa `try/catch` di sini,
    // Promise yang ditolak meninggalkan `isLoadingMessages` bernilai `true`
    // selamanya: panel percakapan berputar tanpa akhir.
    try {
      const fullSession = await getMessagesForSession(session.id);
      setMessages(fullSession?.messages || []);
      setAdaRiwayatLebihLama(fullSession?.adaRiwayatLebihLama === true);
      socketRef.current?.emit('joinRoom', session.id);
    } catch (e) {
      setMessages([]);
      setAdaRiwayatLebihLama(false);
      // `e: any` lalu `e?.message` adalah cacat, bukan kelonggaran tipe:
      // `throw` boleh melempar apa saja, dan Server Action yang gagal karena
      // jaringan menolak dengan nilai yang belum tentu punya `message`.
      // Membacanya lewat `any` berarti penangkap ini sendiri bisa melempar.
      setGalatChat(
        `Riwayat percakapan gagal dimuat: ${
          e instanceof Error ? e.message : 'galat tidak diketahui'
        }. Jangan menjawab sebelum riwayatnya tampil — pilih ulang percakapan ini.`
      );
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleMuatLama = async () => {
    const sesiId = selectedSession?.id;
    // Pesan TERTUA yang sudah tampil adalah titik potongnya. `messages` selalu
    // urut lama-ke-baru (server membaliknya di batas), jadi indeks 0.
    const tertua = messages[0];
    if (!sesiId || !tertua || memuatLama) return;

    setMemuatLama(true);
    try {
      const halaman = await getRiwayatLebihLama(sesiId, tertua.id);

      // Jawaban yang datang SETELAH CS berpindah percakapan dibuang.
      //
      // Tanpa penjaga ini, riwayat percakapan A disisipkan ke atas percakapan B
      // yang sedang terbuka — dan karena keduanya tampil dengan gaya yang sama,
      // tidak ada satu pun tanda di layar bahwa itu pesan orang lain. CS lalu
      // menjawab B berdasarkan apa yang dikatakan A.
      if (idTerpilihRef.current !== sesiId) return;

      // Halaman kosong berarti riwayatnya benar-benar habis. `adaLagi` dari
      // server tetap yang memutuskan tombolnya: halaman penuh tepat sebanyak
      // batasnya BUKAN berarti sudah sampai awal percakapan.
      setMessages((sebelumnya) => {
        if (halaman.messages.length === 0) return sebelumnya;
        // Id yang sudah ada disaring. Pesan lama tidak bisa berubah, tapi
        // penekanan tombol yang ganda (dua klik cepat sebelum `memuatLama`
        // terpasang di render berikutnya) akan menyisipkan halaman yang sama
        // dua kali — dan `key={msg.id}` yang kembar membuat React merender
        // salah satu baris tanpa pernah memperbaruinya.
        const sudahAda = new Set(sebelumnya.map((m) => m.id));
        const baru = halaman.messages.filter((m) => !sudahAda.has(m.id));
        return baru.length === 0 ? sebelumnya : [...baru, ...sebelumnya];
      });
      setAdaRiwayatLebihLama(halaman.adaLagi);
    } catch (e) {
      // Kegagalan di sini TIDAK mengosongkan `messages`: yang gagal hanyalah
      // penambahan riwayat lama, dan percakapan yang sudah tampil tetap benar.
      // Membuangnya berarti mengubah kegagalan kecil menjadi kehilangan besar.
      setGalatChat(
        `Pesan lama gagal dimuat: ${
          e instanceof Error ? e.message : 'galat tidak diketahui'
        }. Pesan yang sudah tampil tetap benar; coba lagi.`
      );
    } finally {
      // Tidak dijaga `idTerpilihRef`: penanda ini milik panel, bukan milik satu
      // percakapan, dan `handleSelectSession` sudah menyetelnya ulang.
      setMemuatLama(false);
    }
  };

  const handleSendMessage = (message: string) => {
    // Tanpa socket, blok di bawah dulu dilewati DIAM-DIAM — tapi pesan
    // optimistiknya sudah terlanjur akan ditulis kalau syaratnya dikendurkan,
    // dan operator membaca balasannya sebagai terkirim padahal tidak pernah
    // keluar dari browser. Kegagalannya dinyatakan, bukan disembunyikan.
    if (!socketRef.current) {
      setGalatChat(
        'Balasan tidak terkirim: chat tidak tersambung. ' +
          PESAN_CHAT_BELUM_DIKONFIGURASI +
          ' Pesan baru tidak akan masuk sampai ini dibereskan.'
      );
      return;
    }

    if (selectedSession) {
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
      socketRef.current?.emit('sendMessage', {
        sessionId: selectedSession.id,
        message: message,
      });
    }
  };

  // Kehadiran terbaru ditempelkan SATU KALI di sini, bukan di tiga tempat
  // render.
  //
  // Titik di daftar, lencana di kepala percakapan, dan baris di panel pengunjung
  // semuanya membaca `session.isOnline`. Kalau masing-masing yang menggabungkan
  // sendiri, ketiganya bisa menyimpang — dan `selectedSession` khususnya adalah
  // salinan state yang dibuat saat percakapan dipilih, jadi ia tidak akan pernah
  // ikut berubah tanpa penggabungan ini.
  const denganKehadiran = (sesi: SesiChat): SesiChat => {
    const terbaru = kehadiran[sesi.id];
    return terbaru === undefined || terbaru === sesi.isOnline
      ? sesi
      : { ...sesi, isOnline: terbaru };
  };

  const sesiTampil = sessions.map(denganKehadiran);
  const sesiTerpilihTampil = selectedSession ? denganKehadiran(selectedSession) : null;

  return (
    <div className="grid grid-cols-12 h-screen w-full overflow-hidden">
        {/* Judul "Chat tidak tersambung." yang DITULIS TETAP di sini dibuang:
            banner yang sama sekarang juga memuat kegagalan memuat riwayat, dan
            di kasus itu kalimatnya salah — chatnya tersambung, yang gagal
            adalah satu percakapan. Pesannya sendiri sudah menyatakan apa yang
            terjadi, jadi judulnya tidak menambah apa pun kecuali risiko
            berbohong. */}
        {galatChat && (
            <div role="alert" className="col-span-12 bg-red-50 border-b border-red-200 px-4 py-3 text-sm text-red-800">
                {galatChat}
            </div>
        )}
        <div className="col-span-12 md:col-span-3 h-screen overflow-y-auto">
            <ChatList
                sessions={sesiTampil}
                onSelectSession={handleSelectSession}
                selectedSessionId={selectedSession?.id}
            />
        </div>
        <div className="col-span-12 md:col-span-6 h-screen overflow-y-auto">
            <ChatRoom
                session={sesiTerpilihTampil}
                messages={messages}
                isLoading={isLoadingMessages}
                adaRiwayatLebihLama={adaRiwayatLebihLama}
                memuatLama={memuatLama}
                onMuatLama={handleMuatLama}
                onSendMessage={handleSendMessage}
            />
        </div>
        <div className="hidden md:block md:col-span-3 h-screen overflow-y-auto">
            <VisitorDetails session={sesiTerpilihTampil} />
        </div>
    </div>
  );
}
