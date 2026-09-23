'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2, Bot, Key, Globe, CheckCircle2, Map } from 'lucide-react'; // Tambah icon Map

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  
  // Nilai API key TIDAK pernah disimpan di state.
  //
  // `type="password"` pada input hanya menyembunyikan karakter secara visual —
  // nilainya tetap ada di DOM dan di payload halaman, jadi siapa pun yang
  // membuka devtools bisa membacanya. Karena itu GET /api/admin/settings kini
  // mengembalikan `geminiApiKey`/`googleMapsApiKey` bernilai null, ditemani
  // penanda `*KeySet` (boolean) dan pratinjau `*KeyMasked` (4 karakter
  // terakhir). Halaman ini hanya menampilkan pratinjau itu.
  const [form, setForm] = useState({
      siteName: "",
      siteDesc: "",
  });

  // Status key tersimpan di server — bukan nilainya.
  const [keyStatus, setKeyStatus] = useState({
      geminiApiKeySet: false,
      geminiApiKeyMasked: null as string | null,
      googleMapsApiKeySet: false,
      googleMapsApiKeyMasked: null as string | null,
  });

  // Nilai baru yang diketik admin. Dikosongkan = "jangan ubah key tersimpan".
  const [newKeys, setNewKeys] = useState({
      geminiApiKey: "",
      googleMapsApiKey: "",
  });

  useEffect(() => {
      fetch('/api/admin/settings').then(res => res.json()).then(data => {
          if(!data) return;
          setForm({
              siteName: data.siteName || "",
              siteDesc: data.siteDesc || "",
          });
          setKeyStatus({
              geminiApiKeySet: !!data.geminiApiKeySet,
              geminiApiKeyMasked: data.geminiApiKeyMasked ?? null,
              googleMapsApiKeySet: !!data.googleMapsApiKeySet,
              googleMapsApiKeyMasked: data.googleMapsApiKeyMasked ?? null,
          });
      });
  }, []);

  const handleSave = async () => {
      setLoading(true);

      // Key hanya dikirim bila admin benar-benar mengetik nilai baru.
      // Field yang dibiarkan kosong tidak ikut dikirim, sehingga key lama di
      // database tetap utuh (API memperlakukan nilai kosong sebagai "abaikan").
      const payload: Record<string, string> = { ...form };
      if (newKeys.geminiApiKey.trim() !== "") {
          payload.geminiApiKey = newKeys.geminiApiKey.trim();
      }
      if (newKeys.googleMapsApiKey.trim() !== "") {
          payload.googleMapsApiKey = newKeys.googleMapsApiKey.trim();
      }

      const res = await fetch('/api/admin/settings', {
          method: 'POST',
          body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("Pengaturan Berhasil Disimpan!");

        // Muat ulang status key agar pratinjau ter-mask ikut diperbarui,
        // lalu kosongkan field input supaya nilai baru tidak tertinggal di DOM.
        const segar = await fetch('/api/admin/settings').then(r => r.json()).catch(() => null);
        if (segar) {
            setKeyStatus({
                geminiApiKeySet: !!segar.geminiApiKeySet,
                geminiApiKeyMasked: segar.geminiApiKeyMasked ?? null,
                googleMapsApiKeySet: !!segar.googleMapsApiKeySet,
                googleMapsApiKeyMasked: segar.googleMapsApiKeyMasked ?? null,
            });
        }
        setNewKeys({ geminiApiKey: "", googleMapsApiKey: "" });
      } else {
        const json = await res.json();
        alert("Gagal menyimpan: " + (json.message || "Unknown error"));
      }
      setLoading(false);
  };

  // Key boleh diuji bila sudah tersimpan di server ATAU admin sedang mengetik
  // kandidat key baru. Bila field kosong, API memakai key tersimpan di database
  // — client tidak perlu (dan tidak boleh) memegang nilainya.
  const bisaTestAI = keyStatus.geminiApiKeySet || newKeys.geminiApiKey.trim() !== "";

  const handleTestAI = async () => {
      if(!bisaTestAI) return alert("Masukkan API Key dulu!");
      setAiLoading(true); setAiResult("");
      const body: Record<string, string> = { action: 'TEST_AI' };
      if (newKeys.geminiApiKey.trim() !== "") {
          body.apiKey = newKeys.geminiApiKey.trim();
      }
      const res = await fetch('/api/admin/settings', {
          method: 'POST', body: JSON.stringify(body)
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
                    <input
                        type="password"
                        autoComplete="off"
                        value={newKeys.googleMapsApiKey}
                        onChange={e => setNewKeys({...newKeys, googleMapsApiKey: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg pl-10 p-3 font-mono text-sm"
                        placeholder={keyStatus.googleMapsApiKeySet
                            ? `Tersimpan (${keyStatus.googleMapsApiKeyMasked}) — isi untuk mengganti`
                            : "AIza... (Isi untuk mengaktifkan Street View)"}
                    />
                </div>
                {keyStatus.googleMapsApiKeySet ? (
                    <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1 font-bold">
                        <CheckCircle2 size={12}/> Key sudah tersimpan. Kosongkan field ini bila tidak ingin mengubahnya.
                    </p>
                ) : (
                    <p className="text-[10px] text-gray-400 mt-1 italic">Belum diisi — Street View akan menggunakan mode tombol eksternal.</p>
                )}
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
                        <input
                            type="password"
                            autoComplete="off"
                            value={newKeys.geminiApiKey}
                            onChange={e => setNewKeys({...newKeys, geminiApiKey: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg pl-10 p-3 font-mono text-sm"
                            placeholder={keyStatus.geminiApiKeySet
                                ? `Tersimpan (${keyStatus.geminiApiKeyMasked}) — isi untuk mengganti`
                                : "AIza..."}
                        />
                    </div>
                    {keyStatus.geminiApiKeySet ? (
                        <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1 font-bold">
                            <CheckCircle2 size={12}/> Key sudah tersimpan. Kosongkan field ini bila tidak ingin mengubahnya.
                        </p>
                    ) : (
                        <p className="text-[10px] text-gray-400 mt-1 italic">Belum diisi — fitur AI nonaktif.</p>
                    )}
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-purple-800">Test AI Response</span>
                        <button onClick={handleTestAI} disabled={aiLoading || !bisaTestAI} className="bg-purple-600 text-white text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-2">
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