'use client';

import { useEffect, useState, useRef } from 'react';
import { 
    Send, Loader2, MessageCircle, Phone, Mail, Clock, MonitorSmartphone, 
    MousePointerClick, Zap, Wand2, XCircle, LogOut 
} from 'lucide-react';

export default function ChatInterface({ sessionId }: { sessionId?: string }) {
    // STATES
    const [messages, setMessages] = useState<any[]>([]);
    const [sessionInfo, setSessionInfo] = useState<any>(null); 
    const [input, setInput] = useState("");
    
    const [loading, setLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastMsgCount = useRef(0);

    const templates = [
        "Halo, ada yang bisa kami bantu?",
        "Baik, mohon ditunggu sebentar ya.",
        "Terima kasih, data sudah kami terima.",
        "Ada pertanyaan lain yang bisa dibantu?"
    ];

    const playNotification = () => {
        const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
        audio.play().catch(() => {}); 
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    // FETCHER
    const fetchChatData = async () => {
        if (!sessionId) return;
        try {
            const now = new Date().getTime();
            const [resMsg, resInfo] = await Promise.all([
                fetch(`/api/chat/history?id=${sessionId}&t=${now}`),
                fetch(`/api/admin/chat/session-detail?id=${sessionId}&t=${now}`)
            ]);

            if (resMsg.ok && resInfo.ok) {
                const dataMsg = await resMsg.json();
                const dataInfo = await resInfo.json();

                if (dataMsg.length > lastMsgCount.current) {
                    setTimeout(scrollToBottom, 100);
                    if (lastMsgCount.current !== 0) {
                        const lastMsg = dataMsg[dataMsg.length - 1];
                        if (lastMsg && lastMsg.sender === 'USER') playNotification();
                    }
                }
                setMessages(dataMsg);
                setSessionInfo(dataInfo);
                lastMsgCount.current = dataMsg.length;
            }
        } catch (e) { }
    };

    useEffect(() => {
        lastMsgCount.current = 0; setMessages([]); setSessionInfo(null); setInput("");
        if (sessionId) {
            fetchChatData(); 
            const interval = setInterval(fetchChatData, 1000); 
            return () => clearInterval(interval);
        }
    }, [sessionId]);

    // HANDLERS
    const handleJoinChat = async () => {
        setLoading(true);
        await fetch('/api/admin/chat/join', { method: 'POST', body: JSON.stringify({ sessionId }) });
        fetchChatData(); 
        setLoading(false);
    };

    const handleEndChat = async () => {
        // PERUBAHAN BAHASA: "Meninggalkan"
        if(!confirm("Anda akan meninggalkan sesi chat ini?")) return;
        
        setLoading(true);
        await fetch('/api/admin/chat/close', { method: 'POST', body: JSON.stringify({ sessionId }) });
        fetchChatData();
        setLoading(false);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !sessionId) return;
        const msgToSend = input;
        setInput(""); 
        
        setMessages(prev => [...prev, { sender: 'ADMIN', message: msgToSend, createdAt: new Date() }]);
        setTimeout(scrollToBottom, 50);

        await fetch('/api/admin/chat/reply', { method: 'POST', body: JSON.stringify({ sessionId, message: msgToSend }) });
        fetchChatData();
        setShowTemplates(false);
    };

    const handleMagicReply = async () => {
        if(!input.trim()) setInput("Buatkan balasan ramah");
        setIsGenerating(true);
        try {
            const res = await fetch('/api/admin/chat/suggest', {
                method: 'POST', body: JSON.stringify({ sessionId, context: input })
            });
            const json = await res.json();
            if(json.reply) setInput(json.reply);
        } catch(e) {}
        setIsGenerating(false);
    };

    // RENDER UI
    if (!sessionId) return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 h-full w-full">
            <MessageCircle size={64} className="opacity-10 mb-4" />
            <p>Pilih pesan dari Inbox.</p>
        </div>
    );

    const isBot = sessionInfo?.status === 'OPEN';
    const isAgent = sessionInfo?.status === 'AGENT';
    const isClosed = sessionInfo?.status === 'CLOSED';

    return (
        <div className="flex flex-1 overflow-hidden h-full font-sans text-slate-800">
            
            {/* AREA CHAT TENGAH */}
            <div className="flex-1 flex flex-col relative bg-[#F8FAFC] border-r border-gray-200">
                <div className="h-16 px-6 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 shadow-sm z-10">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">{sessionInfo?.guestName}</h3>
                        <div className="flex items-center gap-1.5 text-xs mt-0.5">
                            <span className={`w-2 h-2 rounded-full ${isClosed ? 'bg-red-500': isAgent ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                            <span className="text-gray-500 font-bold text-[10px] uppercase">
                                {isBot ? 'Menunggu' : isAgent ? 'Sedang Chat' : 'Selesai'}
                            </span>
                        </div>
                    </div>
                    {isAgent && (
                        // PERUBAHAN LABEL TOMBOL: Tinggalkan
                        <button onClick={handleEndChat} className="bg-white border border-gray-300 text-gray-600 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex gap-2 items-center transition shadow-sm">
                            <LogOut size={14}/> Tinggalkan Chat
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex w-full ${msg.sender === 'ADMIN' ? 'justify-end' : (msg.sender === 'SYSTEM' ? 'justify-center' : 'justify-start')}`}>
                            {msg.sender === 'SYSTEM' ? (
                                <span className="bg-gray-200 text-gray-500 text-[10px] px-3 py-1 rounded-full font-bold shadow-sm">{msg.message}</span>
                            ) : (
                                <div className={`max-w-[70%] p-3.5 rounded-2xl text-sm shadow-sm leading-relaxed ${
                                    msg.sender === 'ADMIN' 
                                    ? 'bg-blue-600 text-white rounded-br-none' 
                                    : 'bg-white text-gray-700 border border-gray-200 rounded-bl-none'
                                }`}>
                                    {msg.sender === 'BOT' && <b className="text-[9px] text-purple-600 block mb-1">AI Assistant</b>}
                                    {msg.message}
                                    <div className="text-[9px] mt-1 text-right opacity-70">
                                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <div className="bg-white p-4 border-t border-gray-200 shrink-0">
                    {showTemplates && (
                        <div className="mb-2 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
                            {templates.map((t, i) => <button key={i} onClick={()=>{setInput(t); setShowTemplates(false)}} className="text-xs bg-gray-100 hover:bg-blue-50 px-3 py-1.5 rounded border">{t}</button>)}
                        </div>
                    )}

                    {isBot && (
                        <div className="flex flex-col items-center justify-center p-3 bg-yellow-50 rounded-xl border border-yellow-100 shadow-sm">
                            <p className="text-xs text-yellow-800 font-semibold mb-2 flex items-center gap-1">User dilayani Bot.</p>
                            <button onClick={handleJoinChat} disabled={loading} className="bg-green-600 text-white px-6 py-2 rounded-full font-bold shadow-md hover:bg-green-700 animate-bounce text-xs flex gap-2 mx-auto items-center transition">
                                <MousePointerClick size={14}/> Join Chat
                            </button>
                        </div>
                    )}

                    {isAgent && (
                        <form onSubmit={handleSend} className="relative flex items-end gap-2">
                            <div className="flex flex-col gap-2 pb-2">
                                <button type="button" onClick={() => setShowTemplates(!showTemplates)} className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition" title="Template"><Zap size={20}/></button>
                                <button type="button" onClick={handleMagicReply} disabled={isGenerating} className={`text-purple-400 hover:text-purple-600 hover:bg-purple-50 p-2 rounded-lg transition ${isGenerating && 'animate-spin'}`}><Wand2 size={20}/></button>
                            </div>
                            <input className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-5 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition" placeholder="Ketik balasan..." value={input} onChange={e=>setInput(e.target.value)} autoFocus />
                            <button className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 shadow-md transition transform hover:scale-105"><Send size={18}/></button>
                        </form>
                    )}

                    {isClosed && <div className="text-center text-xs text-gray-400 font-bold p-3 border border-dashed rounded-lg bg-gray-50">🔴 Sesi ditutup.</div>}
                </div>
            </div>

            {/* KOLOM KANAN (Info Tetap Sama) */}
            <div className="w-[280px] bg-white border-l border-gray-100 hidden xl:block p-6 overflow-y-auto">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg mb-2">{sessionInfo?.guestName?.charAt(0)}</div>
                    <h3 className="font-bold text-gray-800">{sessionInfo?.guestName}</h3>
                    <p className="text-xs text-gray-500 truncate">{sessionInfo?.guestEmail}</p>
                </div>
                <div className="space-y-4">
                    <div className="bg-gray-50 p-3 rounded border"><p className="text-[10px] font-bold text-gray-400 uppercase">WhatsApp</p><p className="font-mono text-xs text-gray-700 font-bold">{sessionInfo?.guestPhone}</p></div>
                    <div className="bg-gray-50 p-3 rounded border"><p className="text-[10px] font-bold text-gray-400 uppercase">Device</p><p className="text-xs text-gray-600 flex items-center gap-1"><MonitorSmartphone size={10}/> Web</p></div>
                </div>
            </div>
        </div>
    );
}