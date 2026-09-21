'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2, Bot, Key, Globe, CheckCircle2, Map } from 'lucide-react'; // Tambah icon Map

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  
  // Tambah googleMapsApiKey di sini
  const [form, setForm] = useState({
      siteName: "",
      siteDesc: "",
      geminiApiKey: "",
      googleMapsApiKey: "" // New Field
  });

  useEffect(() => {
      fetch('/api/admin/settings').then(res => res.json()).then(data => {
          if(data) setForm(data);
      });
  }, []);

  const handleSave = async () => {
            setLoading(true);
      const res = await fetch('/api/admin/settings', {
          method: 'POST',
          body: JSON.stringify(form)
      });
      if (res.ok) {
        alert("Pengaturan Berhasil Disimpan!");
      } else {
        const json = await res.json();
        alert("Gagal menyimpan: " + (json.message || "Unknown error"));
      }
      setLoading(false);
  };

  const handleTestAI = async () => {
      if(!form.geminiApiKey) return alert("Masukkan API Key dulu!");
      setAiLoading(true); setAiResult("");
      const res = await fetch('/api/admin/settings', {
          method: 'POST', body: JSON.stringify({ action: 'TEST_AI', apiKey: form.geminiApiKey })
      });
      const json = await res.json();
      if(res.ok) setAiResult(json.aiResult); else alert("Gagal: " + json.message);
      setAiLoading(false);
  };

  return (
    <div className="max-w-4xl space-y-8 pb-20">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Pengaturan System</h1>
            <p className="text-gray-500 text-sm">Pusat kendali konfigurasi API dan SEO.</p>
        </div>

        {/* 1. SEO & IDENTITY */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4 pb-3 border-b">
                <Globe size={20} className="text-blue-600"/> Identitas Website
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Nama Website</label>
                    <input value={form.siteName || ""} onChange={e => setForm({...form, siteName: e.target.value})} className="w-full border rounded-lg p-3 font-bold" placeholder="Utero Cloud"/>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Deskripsi</label>
                    <input value={form.siteDesc || ""} onChange={e => setForm({...form, siteDesc: e.target.value})} className="w-full border rounded-lg p-3" placeholder="Sewa Billboard..."/>
                </div>
            </div>
        </div>

        {/* 2. GOOGLE MAPS CONFIG (BARU) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4 pb-3 border-b">
                <Map size={20} className="text-green-600"/> Google Maps Configuration
            </h3>
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Google Maps API Key (Untuk Street View)</label>
                <div className="relative">
                    <Key size={16} className="absolute left-3 top-3.5 text-gray-400"/>
                    <input type="password" value={form.googleMapsApiKey || ""} onChange={e => setForm({...form, googleMapsApiKey: e.target.value})} className="w-full border border-gray-300 rounded-lg pl-10 p-3 font-mono text-sm" placeholder="AIza... (Isi untuk mengaktifkan Street View)"/>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 italic">Jika dikosongkan, Street View akan menggunakan mode tombol eksternal.</p>
            </div>
        </div>

        {/* 3. AI CONFIGURATION */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4 pb-3 border-b">
                <Bot size={20} className="text-purple-600"/> Artificial Intelligence
            </h3>
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Gemini API Key</label>
                    <div className="relative">
                        <Key size={16} className="absolute left-3 top-3.5 text-gray-400"/>
                        <input type="password" value={form.geminiApiKey || ""} onChange={e => setForm({...form, geminiApiKey: e.target.value})} className="w-full border border-gray-300 rounded-lg pl-10 p-3 font-mono text-sm" placeholder="AIza..."/>
                    </div>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-purple-800">Test AI Response</span>
                        <button onClick={handleTestAI} disabled={aiLoading || !form.geminiApiKey} className="bg-purple-600 text-white text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                            {aiLoading ? <Loader2 className="animate-spin" size={14}/> : 'Test Generate'}
                        </button>
                    </div>
                    {aiResult && <p className="text-sm italic text-gray-700 bg-white p-3 rounded border border-purple-200">"{aiResult}"</p>}
                </div>
            </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-end px-8 z-40 md:pl-72">
            <button onClick={handleSave} disabled={loading} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg">
                {loading ? <Loader2 className="animate-spin"/> : <Save size={18}/>} Simpan Konfigurasi
            </button>
        </div>
    </div>
  );
}