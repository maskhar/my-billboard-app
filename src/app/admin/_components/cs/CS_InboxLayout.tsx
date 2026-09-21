'use client';

import { io } from "socket.io-client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal, Loader2, MessageSquare, Send, ArrowRight } from 'lucide-react';
import { getMessagesForSession } from '@/app/admin/(dashboard)/live-chat/actions';

// [DIPERBARUI] ChatList sekarang menerima data sesi
const ChatList = ({ sessions, onSelectSession, selectedSessionId }: any) => (
    <div className="h-full border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2 className="font-bold text-lg text-gray-800">Inbox</h2>
            <div className="relative mt-2">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Cari percakapan..." className="w-full pl-9 p-2 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions && sessions.length > 0 ? (
                sessions.map((session: any) => (
                    <div 
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedSessionId === session.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}
                    >
                        <p className="font-bold text-sm text-gray-900">{session.guestName}</p>
                        <p className="text-xs text-gray-600 truncate mt-1">{session.messages?.[0]?.message || 'Tidak ada pesan'}</p>
                    </div>
                ))
            ) : (
                <div className="text-center text-sm text-gray-400 p-8">Tidak ada sesi chat.</div>
            )}
        </div>
    </div>
);

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
                    <span className="text-xs text-green-600 font-semibold flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>Online</span>
                </div>
                <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
                    <SlidersHorizontal size={18} />
                </button>
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
                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition disabled:bg-gray-300">
                        <Send size={16} />
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
                 <div className="text-sm space-y-2 text-gray-700">
                    <p><span className="font-semibold w-20 inline-block">Lokasi:</span> Indonesia</p>
                    <p><span className="font-semibold w-20 inline-block">IP Address:</span> 127.0.0.1</p>
                    <p><span className="font-semibold w-20 inline-block">Browser:</span> Chrome</p>
                    <p><span className="font-semibold w-20 inline-block">OS:</span> Windows</p>
                 </div>
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
    const socket = io("http://localhost:3001");
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to chat server');
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
    const fullSession = await getMessagesForSession(session.id);
    setMessages(fullSession?.messages || []);
    setIsLoadingMessages(false);
    socketRef.current.emit('joinRoom', session.id);
  };

  const handleSendMessage = (message: string) => {
    if (socketRef.current && selectedSession) {
      const tempMessage = {
        id: Date.now().toString(),
        sessionId: selectedSession.id,
        sender: 'AGENT',
        message: message,
        createdAt: new Date().toISOString(),
      };

      // [BARU] Optimistic UI Update untuk admin
      setMessages((prevMessages) => [...prevMessages, tempMessage]);

      // Kirim ke server
      socketRef.current.emit('sendMessage', {
        sessionId: selectedSession.id,
        sender: 'AGENT',
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
