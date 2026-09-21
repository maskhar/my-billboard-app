'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Send, User, Loader2 } from 'lucide-react';

export default function ChatRoom() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('id');
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState("");
    const [info, setInfo] = useState<any>(null);
    
    // Polling Admin (Realtime Update)
    useEffect(() => {
        if(!sessionId) return;
        
        // Ambil info user (nama dll) - ini bisa dibuat API sendiri, tapi sementara kita ambil dr pesan pertama
        
        const fetchMsg = async () => {
            const res = await fetch(`/api/chat/history?id=${sessionId}`);
            const data = await res.json();
            setMessages(data);
        }

        fetchMsg();
        const interval = setInterval(fetchMsg, 3000); // Poll 3 detik
        return () => clearInterval(interval);
    }, [sessionId]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!input.trim() || !sessionId) return;

        // 1. Simpan Pesan Admin
        await fetch('/api/admin/chat/reply', { // Nanti buat API ini
            method: 'POST',
            body: JSON.stringify({ sessionId, message: input })
        });
        
        setInput("");
        // Trigger fetch manual
        const res = await fetch(`/api/chat/history?id=${sessionId}`);
        const data = await res.json();
        setMessages(data);
    };

    if(!sessionId) return (
        <div className="h-full flex items-center justify-center text-gray-400 flex-col gap-2">
            <MessageCircle size={48} className="opacity-20"/>
            <p>Pilih pesan di samping untuk membalas</p>
        </div>
    );

    return (
        <>
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
               <h3 className="font-bold text-gray-700">Chat Session</h3>
               <span className="text-xs bg-gray-200 px-2 py-1 rounded">ID: {sessionId.slice(-6)}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] p-3 rounded-lg text-sm shadow-sm ${
                            msg.sender === 'ADMIN' 
                            ? 'bg-blue-600 text-white rounded-br-none' 
                            : msg.sender === 'BOT'
                            ? 'bg-gray-200 text-gray-600 text-xs italic border border-gray-300'
                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                        }`}>
                            <div className="text-[9px] font-bold mb-1 opacity-70">{msg.sender}</div>
                            {msg.message}
                        </div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-200 flex gap-2">
                <input 
                    className="flex-1 border p-2 rounded-lg text-sm focus:outline-none focus:border-blue-500" 
                    placeholder="Tulis balasan sebagai admin..."
                    value={input} onChange={e=>setInput(e.target.value)}
                />
                <button className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700">
                    <Send size={18}/>
                </button>
            </form>
        </>
    );
}

import { MessageCircle } from 'lucide-react';