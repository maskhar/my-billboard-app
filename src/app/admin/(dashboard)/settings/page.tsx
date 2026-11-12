'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Save, Loader2, Bot, Key, Globe, Map, Trash2 } from 'lucide-react';

function extractErrorMessage(payload: any): string {
  const message = payload?.message ?? payload?.error;
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string' && message.trim()) return message;
  return 'Terjadi kesalahan. Silakan coba lagi.';
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    return extractErrorMessage(await res.json());
  } catch {
    return `Permintaan gagal (HTTP ${res.status}).`;
  }
}

function LoadingScreen() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-gray-500">
      <Loader2 className="animate-spin" size={24} />
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isSuperAdmin =
    (session?.user as { role?: string } | undefined)?.role === 'SUPER_ADMIN';
  const roleBlocked = status === 'authenticated' && !isSuperAdmin;

  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [deletingField, setDeletingField] = useState<
    'geminiApiKey' | 'googleMapsApiKey' | null
  >(null);

  const [siteName, setSiteName] = useState('');
  const [siteDesc, setSiteDesc] = useState('');

  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [googleMapsApiKeyInput, setGoogleMapsApiKeyInput] = useState('');
  const [geminiApiKeyMasked, setGeminiApiKeyMasked] = useState<string | null>(null);
  const [geminiApiKeyConfigured, setGeminiApiKeyConfigured] = useState(false);
  const [googleMapsApiKeyMasked, setGoogleMapsApiKeyMasked] = useState<string | null>(
    null,
  );
  const [googleMapsApiKeyConfigured, setGoogleMapsApiKeyConfigured] =
    useState(false);

  const [aiResult, setAiResult] = useState('');
  const [aiError, setAiError] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/settings/admin', { cache: 'no-store' });
      if (!res.ok) {
        alert('Gagal memuat pengaturan: ' + (await readErrorMessage(res)));
        return;
      }

      const data = await res.json();
      setSiteName(data?.siteName ?? '');
      setSiteDesc(data?.siteDesc ?? '');
      setGeminiApiKeyMasked(data?.geminiApiKeyMasked ?? null);
      setGeminiApiKeyConfigured(Boolean(data?.geminiApiKeyConfigured));
      setGoogleMapsApiKeyMasked(data?.googleMapsApiKeyMasked ?? null);
      setGoogleMapsApiKeyConfigured(Boolean(data?.googleMapsApiKeyConfigured));
      setGeminiApiKeyInput('');
      setGoogleMapsApiKeyInput('');
    } catch {
      alert('Gagal memuat pengaturan: tidak dapat menghubungi server.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!isSuperAdmin) {
      router.replace('/admin');
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [status, isSuperAdmin, router, loadSettings]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { siteName, siteDesc };
      const geminiKey = geminiApiKeyInput.trim();
      const mapsKey = googleMapsApiKeyInput.trim();
      if (geminiKey) payload.geminiApiKey = geminiKey;
      if (mapsKey) payload.googleMapsApiKey = mapsKey;

      const res = await fetch('/api/proxy/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        alert('Gagal menyimpan: ' + (await readErrorMessage(res)));
        return;
      }

      setFetching(true);
      await loadSettings();
      alert('Pengaturan berhasil disimpan.');
    } catch {
      alert('Gagal menyimpan: tidak dapat menghubungi server.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (field: 'geminiApiKey' | 'googleMapsApiKey') => {
    const label = field === 'geminiApiKey' ? 'Gemini API Key' : 'Google Maps API Key';
    if (!window.confirm(`Hapus ${label} yang tersimpan?`)) return;

    setDeletingField(field);
    try {
      const res = await fetch('/api/proxy/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: null }),
      });

      if (!res.ok) {
        alert('Gagal menghapus key: ' + (await readErrorMessage(res)));
        return;
      }

      setFetching(true);
      await loadSettings();
    } catch {
      alert('Gagal menghapus key: tidak dapat menghubungi server.');
    } finally {
      setDeletingField(null);
    }
  };

  const handleTestAI = async () => {
    const key = geminiApiKeyInput.trim();
    if (!key && !geminiApiKeyConfigured) {
      alert('Masukkan API Key Gemini atau simpan key terlebih dahulu.');
      return;
    }

    setAiLoading(true);
    setAiResult('');
    setAiError('');
    try {
      const res = await fetch('/api/proxy/settings/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(key ? { apiKey: key } : {}),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = extractErrorMessage(json);
        setAiError(message);
        alert('Gagal: ' + message);
        return;
      }

      setAiResult(typeof json?.aiResult === 'string' ? json.aiResult : '');
    } catch {
      const message = 'Tidak dapat menghubungi server.';
      setAiError(message);
      alert('Gagal: ' + message);
    } finally {
      setAiLoading(false);
    }
  };

  if (status !== 'authenticated' || roleBlocked || fetching) {
    return <LoadingScreen />;
  }

  return (
    <div className="max-w-4xl space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Pengaturan System</h1>
        <p className="text-gray-500 text-sm">Pusat kendali konfigurasi API dan SEO.</p>
      </div>

      {/* 1. SEO & IDENTITY */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4 pb-3 border-b">
          <Globe size={20} className="text-blue-600" /> Identitas Website
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Nama Website
            </label>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full border rounded-lg p-3 font-bold"
              placeholder="Utero Billboard"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Deskripsi
            </label>
            <input
              value={siteDesc}
              onChange={(e) => setSiteDesc(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="Sewa Billboard..."
            />
          </div>
        </div>
      </div>

      {/* 2. GOOGLE MAPS CONFIG */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4 pb-3 border-b">
          <Map size={20} className="text-green-600" /> Google Maps Configuration
        </h3>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
            Google Maps API Key (Untuk Street View)
          </label>
          <div className="relative">
            <Key size={16} className="absolute left-3 top-3.5 text-gray-400" />
            <input
              type="password"
              value={googleMapsApiKeyInput}
              onChange={(e) => setGoogleMapsApiKeyInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 p-3 font-mono text-sm"
              placeholder="AIza... (Isi untuk mengaktifkan Street View)"
            />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-[11px] text-gray-500">
              {googleMapsApiKeyConfigured
                ? `Tersimpan: ${googleMapsApiKeyMasked ?? '••••'}`
                : 'Belum diisi'}
            </p>
            {googleMapsApiKeyConfigured && (
              <button
                type="button"
                onClick={() => handleDeleteKey('googleMapsApiKey')}
                disabled={deletingField !== null}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 disabled:opacity-50 flex items-center gap-1"
              >
                {deletingField === 'googleMapsApiKey' ? (
                  <Loader2 className="animate-spin" size={12} />
                ) : (
                  <Trash2 size={12} />
                )}
                Hapus key
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1 italic">
            Jika dikosongkan, Street View akan menggunakan mode tombol eksternal.
          </p>
        </div>
      </div>

      {/* 3. AI CONFIGURATION */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4 pb-3 border-b">
          <Bot size={20} className="text-purple-600" /> Artificial Intelligence
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Gemini API Key
            </label>
            <div className="relative">
              <Key size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                type="password"
                value={geminiApiKeyInput}
                onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-10 p-3 font-mono text-sm"
                placeholder="AIza..."
              />
            </div>
            <div className="mt-1 flex items-center gap-3">
              <p className="text-[11px] text-gray-500">
                {geminiApiKeyConfigured
                  ? `Tersimpan: ${geminiApiKeyMasked ?? '••••'}`
                  : 'Belum diisi'}
              </p>
              {geminiApiKeyConfigured && (
                <button
                  type="button"
                  onClick={() => handleDeleteKey('geminiApiKey')}
                  disabled={deletingField !== null}
                  className="text-[11px] font-bold text-red-600 hover:text-red-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {deletingField === 'geminiApiKey' ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  Hapus key
                </button>
              )}
            </div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-purple-800">Test AI Response</span>
              <button
                onClick={handleTestAI}
                disabled={
                  aiLoading || (!geminiApiKeyInput.trim() && !geminiApiKeyConfigured)
                }
                className="bg-purple-600 text-white text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="animate-spin" size={14} /> : 'Test Generate'}
              </button>
            </div>
            {aiResult && (
              <p className="text-sm italic text-gray-700 bg-white p-3 rounded border border-purple-200">
                &quot;{aiResult}&quot;
              </p>
            )}
            {aiError && (
              <p className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">
                {aiError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-end px-8 z-40 md:pl-72">
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Save size={18} />} Simpan
          Konfigurasi
        </button>
      </div>
    </div>
  );
}
