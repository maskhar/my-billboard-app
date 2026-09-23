'use client';

import { useState, useRef, useEffect } from 'react';
import { io, Socket } from "socket.io-client";
import { MessageCircle, X, Send, Loader2, User, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    const chatUrl = process.env.NEXT_PUBLIC_CHAT_URL || 'http://localhost:3001';
    const storedToken = localStorage.getItem('utero_chat_token');

    socketRef.current = io(chatUrl, {
        auth: storedToken ? { guestToken: storedToken } : undefined,
    });

    socketRef.current.on('connect', () => {
        const storedId = localStorage.getItem('utero_chat_id');
        if (storedId && storedToken) {
            setSessionId(storedId);
            socketRef.current?.emit('joinRoom', storedId);
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

    socketRef.current.on('newMessage', (newMessage) => {
        if (localStorage.getItem('utero_chat_id') === newMessage.sessionId && newMessage.sender !== 'USER') {
            setMessages((prev) => [...prev, newMessage]);
        }
    });

    socketRef.current.on('loadHistory', (history) => {
        setMessages(history);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
      if (messages.length > lastMsgCount.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          lastMsgCount.current = messages.length;
      }
  }, [messages, isOpen]);

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          const chatUrl = process.env.NEXT_PUBLIC_CHAT_URL || 'http://localhost:3001';
          const res = await fetch(`${chatUrl}/api/chat/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form)
          });
          const session = await res.json();
          if (session.id && session.guestToken) {
              localStorage.setItem('utero_chat_id', session.id);
              localStorage.setItem('utero_chat_token', session.guestToken);
              // Socket sudah tersambung sebagai tamu tanpa identitas. Alih-alih
              // menyambung ulang, tukarkan token di koneksi yang sama —
              // server yang menetapkan sessionId, lalu membalas
              // `guestSessionClaimed` yang menjalankan joinRoom.
              socketRef.current?.emit('claimGuestSession', session.guestToken);
          } else {
              setError(session.error || 'Gagal memulai sesi chat.');
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
        const tempMessage = { sender: 'USER', message: userMsg, createdAt: new Date(), id: Date.now().toString() };
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

          {!sessionId ? (
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
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === 'USER' ? 'justify-end' : 'justify-start'}`}>
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