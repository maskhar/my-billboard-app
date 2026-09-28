'use client';

// Halaman Pengaturan Sistem (SUPER_ADMIN).
//
// Empat cacat ditambal di sini, semuanya satu keluarga: jawaban server tidak
// pernah diperiksa, jadi halaman melaporkan keadaan yang tidak pernah
// dikonfirmasi siapa pun.
//
//   1. `useEffect` dulu berbunyi `fetch(...).then(res => res.json()).then(...)`
//      tanpa `res.ok` dan tanpa `.catch`. Route GET menjawab 401 kepada siapa
//      pun yang bukan SUPER_ADMIN, dan badan 401-nya `{ message: 'Unauthorized' }`
//      — objek yang lolos dari `if(!data) return`, lalu `data.siteName || ""`
//      mengisi form dengan teks kosong. Seorang ADMIN biasa karena itu melihat
//      FORM PENGATURAN KOSONG, bukan penolakan: ia mengira setelan situs
//      memang belum diisi, mengetik ulang nama situs, menekan Simpan, dan baru
//      di sana ditolak. Kegagalan jaringan lebih buruk lagi — Promise-nya
//      ditolak tanpa penangkap, jadi tidak ada satu pun tanda di layar.
//   2. POST di `handleSave` tidak mengirim header `Content-Type: application/json`.
//   3. `await res.json()` dipanggil tanpa `.catch` di jalur galat. Balasan 500
//      dari proxy atau dev-server berbadan HTML, bukan JSON, jadi `json()`
//      melempar — dan karena `setLoading(false)` ada di baris terakhir fungsi,
//      bukan di `finally`, tombol Simpan berputar selamanya. Admin menunggu
//      sesuatu yang tidak akan pernah datang.
//   4. `handleTestAI` sama persis, dengan `setAiLoading(false)` yang juga tidak
//      di `finally`.
//
//   5. `catch (e: any)` di ketiga penangkap. `e?.message` pada nilai yang
//      bukan `Error` — objek biasa dari `fetch` yang dibatalkan, atau string
//      yang dilempar langsung — menghasilkan `undefined`, jadi pesan
//      cadangannya yang tampil; pada objek tanpa prototype `?.` tidak
//      menyelamatkan apa pun. `pesanGalat` memeriksa bentuknya lebih dulu.
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Save, Loader2, Bot, Key, Globe, CheckCircle2, Map } from 'lucide-react'; // Tambah icon Map
import { useToast } from '@/components/ui/Toast';
import { bacaBadan, bacaJawaban, alasanPenolakan } from '@/lib/baca-jawaban';
import { pesanGalat } from '@/lib/pesan-galat';

// Bentuk yang dibaca dari GET /api/admin/settings, sudah tersempit.
//
// Dulu badannya dibaca `await res.json().catch(() => null)`, yang bertipe `any`:
// `data.siteName`, `data.geminiApiKeyMasked`, dan setiap salah-tulis nama kolom
// lolos dari `tsc`. Salah tulis `geminiApiKeyMaskd` akan selalu menghasilkan
// `undefined`, jadi pratinjau key-nya hilang dari layar tanpa satu pun
// peringatan — dan itulah satu-satunya petunjuk yang dimiliki admin tentang key
// mana yang sekarang tersimpan.
//
// Nilai key-nya sendiri tidak ada di daftar ini dan memang tidak pernah
// dikirim server: hanya penanda `*Set` dan pratinjau 4 karakter `*Masked`.
type SetelanTerbaca = {
  siteName: string;
  siteDesc: string;
  geminiApiKeySet: boolean;
  geminiApiKeyMasked: string | null;
  googleMapsApiKeySet: boolean;
  googleMapsApiKeyMasked: string | null;
};

function bacaSetelan(isi: Record<string, unknown>): SetelanTerbaca {
  const teks = (nilai: unknown) => (typeof nilai === 'string' ? nilai : '');
  const teksAtauNull = (nilai: unknown) => (typeof nilai === 'string' ? nilai : null);
  return {
    siteName: teks(isi.siteName),
    siteDesc: teks(isi.siteDesc),
    geminiApiKeySet: isi.geminiApiKeySet === true,
    geminiApiKeyMasked: teksAtauNull(isi.geminiApiKeyMasked),
    googleMapsApiKeySet: isi.googleMapsApiKeySet === true,
    googleMapsApiKeyMasked: teksAtauNull(isi.googleMapsApiKeyMasked),
  };
}

export default function SettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");

  // Dua keadaan pemuatan yang dulu tidak ada sama sekali: sedang memuat, dan
  // gagal memuat. Tanpa keduanya form kosong tidak bisa dibedakan dari form
  // yang memang belum diisi.
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

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
      let dibatalkan = false;

      const muat = async () => {
          try {
              const res = await fetch('/api/admin/settings');
              // `res.ok` diperiksa LEBIH DULU. Badan 401 adalah JSON yang sah,
              // jadi tanpa gerbang ini ia terbaca sebagai setelan kosong.
              if (!res.ok) {
                  const jawaban = await bacaJawaban(res);
                  throw new Error(
                      jawaban.pesan ??
                          (res.status === 401
                              ? 'Hanya SUPER_ADMIN yang boleh membuka pengaturan sistem.'
                              : `Gagal memuat pengaturan (${res.status}).`)
                  );
              }
              // `bacaBadan` memulangkan `{}` pada badan yang tidak terbaca, dan
              // `{}` mustahil dibedakan dari setelan yang memang kosong. Karena
              // itu badannya dibaca sekali lagi di sini: `siteName` selalu ada
              // di jawaban route ini, jadi ketidakhadirannya berarti badannya
              // bukan setelan.
              const isi = await bacaBadan(res);
              if (!('siteName' in isi)) throw new Error('Jawaban server tidak bisa dibaca.');
              const data = bacaSetelan(isi);
              if (dibatalkan) return;
              setForm({
                  siteName: data.siteName,
                  siteDesc: data.siteDesc,
              });
              setKeyStatus({
                  geminiApiKeySet: data.geminiApiKeySet,
                  geminiApiKeyMasked: data.geminiApiKeyMasked,
                  googleMapsApiKeySet: data.googleMapsApiKeySet,
                  googleMapsApiKeyMasked: data.googleMapsApiKeyMasked,
              });
          } catch (galatMuat) {
              if (!dibatalkan) setGalat(pesanGalat(galatMuat, 'Gagal memuat pengaturan.'));
          } finally {
              if (!dibatalkan) setMemuat(false);
          }
      };

      muat();
      return () => {
          dibatalkan = true;
      };
  }, []);

  const handleSave = useCallback(async () => {
      // Kunci in-flight: klik kedua sebelum yang pertama selesai mengirim
      // payload yang sama dua kali. Pada jalur API key itu berarti dua
      // penulisan enkripsi berurutan atas nilai yang sama — tidak merusak,
      // tapi tidak ada gunanya, dan tombolnya sudah `disabled` jadi ini
      // pengaman untuk pemanggil lain.
      if (loading) return;
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

      try {
          const res = await fetch('/api/admin/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          // Kedua jalur — sukses dan penolakan — hanya membutuhkan `message`,
          // jadi pembaca bersama ini cukup dan `json?.message` bertipe `any`
          // yang dulu ada di sini lenyap bersamanya.
          const jawaban = await bacaJawaban(res);
          if (!res.ok) {
              throw new Error(alasanPenolakan(res, jawaban));
          }

          toast.sukses(jawaban.pesan ?? 'Pengaturan sistem tersimpan.');

          // Muat ulang status key agar pratinjau ter-mask ikut diperbarui,
          // lalu kosongkan field input supaya nilai baru tidak tertinggal di DOM.
          const resSegar = await fetch('/api/admin/settings');
          if (resSegar.ok) {
              const isiSegar = await bacaBadan(resSegar);
              // Gerbang yang sama seperti di pemuatan awal: badan yang tidak
              // terbaca memulangkan `{}`, dan menulisnya ke state akan MENGOSONGKAN
              // pratinjau key yang sebenarnya masih tersimpan di database — admin
              // lalu menyangka penyimpanannya menghapus key-nya.
              if ('siteName' in isiSegar) {
                  const segar = bacaSetelan(isiSegar);
                  setKeyStatus({
                      geminiApiKeySet: segar.geminiApiKeySet,
                      geminiApiKeyMasked: segar.geminiApiKeyMasked,
                      googleMapsApiKeySet: segar.googleMapsApiKeySet,
                      googleMapsApiKeyMasked: segar.googleMapsApiKeyMasked,
                  });
              }
          }
          setNewKeys({ geminiApiKey: "", googleMapsApiKey: "" });
      } catch (galatSimpan) {
          // Nilai API key TIDAK pernah ikut tercatat di sini: yang di-log adalah
          // galatnya, dan galatnya hanya membawa pesan server atau pesan
          // jaringan. Muatan permintaan tidak disentuh.
          console.error('Gagal menyimpan pengaturan sistem:', galatSimpan);
          toast.galat('Gagal menyimpan: ' + pesanGalat(galatSimpan, 'galat tidak diketahui'));
      } finally {
          // Di `finally`, bukan di baris terakhir fungsi: `await res.json()`
          // yang melempar dulu meninggalkan tombol berputar tanpa akhir.
          setLoading(false);
      }
  }, [form, newKeys, loading, toast]);

  // Key boleh diuji bila sudah tersimpan di server ATAU admin sedang mengetik
  // kandidat key baru. Bila field kosong, API memakai key tersimpan di database
  // — client tidak perlu (dan tidak boleh) memegang nilainya.
  const bisaTestAI = keyStatus.geminiApiKeySet || newKeys.geminiApiKey.trim() !== "";

  const handleTestAI = useCallback(async () => {
      if (!bisaTestAI) {
          toast.galat('Masukkan Gemini API Key dulu, atau simpan satu di server.');
          return;
      }
      if (aiLoading) return;
      setAiLoading(true); setAiResult("");
      const body: Record<string, string> = { action: 'TEST_AI' };
      if (newKeys.geminiApiKey.trim() !== "") {
          body.apiKey = newKeys.geminiApiKey.trim();
      }
      try {
          const res = await fetch('/api/admin/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
          });
          // `bacaBadan`, bukan `bacaJawaban`: jalur ini butuh `aiResult`, yang
          // bukan salah satu dari dua kolom yang dibaca pembaca ringkas itu.
          // Nilainya `unknown`, jadi pemeriksaan `typeof` di bawah wajib — dan
          // itulah bedanya dengan `json?.aiResult` bertipe `any` yang dulu ada
          // di sini.
          const isi = await bacaBadan(res);
          if (!res.ok) {
              const pesan = typeof isi.message === 'string' ? isi.message : null;
              throw new Error(pesan ?? `Gagal menguji AI (${res.status}).`);
          }
          // `aiResult` bisa tidak ada walaupun statusnya 200 (mis. proxy yang
          // memotong badan). Menyetel `undefined` membuat panel hasil hilang
          // tanpa keterangan, jadi turunkan ke pesan yang jujur.
          setAiResult(
              typeof isi.aiResult === 'string' && isi.aiResult !== ''
                  ? isi.aiResult
                  : 'Server menjawab berhasil tanpa teks hasil.'
          );
      } catch (galatUji) {
          console.error('Gagal menguji Gemini API key:', galatUji);
          toast.galat('Gagal menguji AI: ' + pesanGalat(galatUji, 'galat tidak diketahui'));
      } finally {
          setAiLoading(false);
      }
  }, [bisaTestAI, aiLoading, newKeys, toast]);

  // Gagal memuat ditampilkan sebagai penolakan, BUKAN sebagai form kosong.
  // Form kosong adalah klaim ("belum ada setelan") yang halaman ini tidak
  // pernah punya dasar untuk membuatnya.
  if (galat) {
      return (
          <div className="max-w-4xl">
              <div className="bg-white border border-red-200 rounded-2xl p-8 flex items-start gap-4">
                  <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={22} />
                  <div>
                      <h2 className="font-bold text-gray-800">Pengaturan tidak bisa dibuka</h2>
                      <p className="text-sm text-gray-600 mt-1">{galat}</p>
                  </div>
              </div>
          </div>
      );
  }

  if (memuat) {
      return (
          <div className="max-w-4xl flex items-center gap-3 text-gray-500 text-sm p-8">
              <Loader2 className="animate-spin" size={18} /> Memuat pengaturan…
          </div>
      );
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
                    {aiResult && <p className="text-sm italic text-gray-700 bg-white p-3 rounded border border-purple-200">&ldquo;{aiResult}&rdquo;</p>}
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