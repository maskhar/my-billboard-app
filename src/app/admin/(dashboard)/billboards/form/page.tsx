// src/app/admin/(dashboard)/billboards/form/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// PERBAIKAN: Menambahkan 'Plus' di sini
import { ArrowLeft, Save, Loader2, Link as LinkIcon, Wand2, Ruler, Lightbulb, ExternalLink, X, History, Clock, RotateCcw, Plus } from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import { arrayDariJson } from '@/lib/safe-json';
import { angkaRupiah } from '@/lib/money';

export default function BillboardFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billboardId = searchParams.get('id');

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  
  const [inputType, setInputType] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [historyList, setHistoryList] = useState<any[]>([]);

  // DEFAULT DATA CHECKLIST
  const defaultAdminOptions = [
      { name: "Sewa Lahan / Konstruksi", included: true },
      { name: "Pengawasan Media / Maintenance", included: true },
      { name: "Biaya Cetak (1x)", included: true },
      { name: "Biaya Pasang (1x)", included: true },
      { name: "Pajak Reklame Pemda", included: true },
      { name: "Asuransi", included: false },
      { name: "Laporan Trafik (Smartsuco)", included: false },
      { name: "PPN 11%", included: false },
  ];

  const [form, setForm] = useState<any>({
      title: '', slug: '', sku: '', address: '', type: 'Videotron',
      price: 0, lat: -7.9666, lng: 112.6326, 
      publishStatus: 'DRAFT', mainImage: '', desc: '',
      sizeH: '', sizeW: '', 
      orientation: 'Horizontal', sides: '1', lighting: 'Frontlight', material: 'Vinyl Backlight',
      smartsucoUrl: '',
      gallery: [], 
      adminOptions: defaultAdminOptions
  });

  useEffect(() => {
      if (billboardId) {
          setFetching(true);
          fetch(`/api/admin/billboards/detail?id=${encodeURIComponent(billboardId)}`)
            .then(res => {
                if (!res.ok) throw new Error('Gagal memuat data billboard.');
                return res.json();
            })
            .then(data => {
                if(data) {
                    // `JSON.parse` mentah di dalam `.then()` melempar ke `.catch`
                    // di bawah, sehingga kolom yang rusak muncul sebagai "gagal
                    // memuat" — admin tidak punya petunjuk bahwa datanyalah yang
                    // cacat, dan tidak bisa membuka form untuk memperbaikinya.
                    // Sekarang bagian rusak jadi kosong dan form tetap terbuka.
                    //
                    // `arrayDariJson`, BUKAN `safeJsonArray`: ketiga kolom ini
                    // bertipe jsonb, jadi yang sampai ke sini lewat `res.json()`
                    // SUDAH berupa array. Form inilah titik paling berbahaya bila
                    // salah pembaca: nilai yang gagal dibaca menjadi array kosong,
                    // lalu tombol Simpan menulis kembali array kosong itu ke
                    // database — galeri dan daftar fasilitas hilang permanen,
                    // tanpa satu pun pesan galat ke admin.
                    const parsedGallery = arrayDariJson<string>(data.gallery, `Billboard.gallery id=${billboardId}`);
                    const dbIncludes = arrayDariJson<string>(data.includes, `Billboard.includes id=${billboardId}`);
                    const parsedSpecs = arrayDariJson<{ label: string; value: string }>(data.specs, `Billboard.specs id=${billboardId}`);

                    let h = '', w = '', sides='1', mat='', orient='Horizontal', light='Frontlight';

                    const sizeSpec = parsedSpecs.find((s:any) => s.label === "Ukuran")?.value || "";
                    if(sizeSpec) { const parts = sizeSpec.replace(/m/g, '').split('x'); if(parts.length===2) { h=parts[0].trim(); w=parts[1].trim(); }}

                    // `s.label.includes(...)` melempar bila ada satu entri tanpa
                    // `label` — array-nya sah tapi isinya tidak. Dijaga di satu
                    // tempat lewat helper ini.
                    const cariSpec = (kataKunci: string) =>
                        parsedSpecs.find((s:any) => typeof s?.label === 'string' && s.label.includes(kataKunci))?.value;

                    const sOrient = cariSpec("Layout");
                    if(sOrient) orient = sOrient;

                    const sLight = cariSpec("Penerangan");
                    if(sLight) light = sLight;

                    const sMat = cariSpec("Material");
                    if(sMat) mat = sMat;

                    const sSides = cariSpec("Tampilan")?.replace(' Sisi', '');
                    if(sSides) sides = sSides;

                    const mergedOptions = defaultAdminOptions.map(opt => ({ name: opt.name, included: dbIncludes.includes(opt.name) }));

                    setForm((prev:any) => ({
                        ...prev, ...data,
                        gallery: parsedGallery, adminOptions: mergedOptions,
                        sizeH: h, sizeW: w,
                        orientation: orient, lighting: light, material: mat, sides
                    }));

                    if(data.history) setHistoryList(data.history);
                }
                setFetching(false);
            })
            .catch(() => {
                setFetching(false);
                alert("Gagal memuat data billboard. Silakan muat ulang halaman.");
            });
      }
  }, [billboardId]);

  const generateSlug = () => {
      if(!form.title) return alert("Isi Nama Dulu");
      const clean = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      setForm((p:any) => ({...p, slug: clean}));
  };

  const handleChange = (e: any) => { const { name, value } = e.target; setForm((p:any) => ({ ...p, [name]: value })); }
  
  const handleAdminCheck = (index: number) => {
      const newOpts = [...form.adminOptions];
      newOpts[index].included = !newOpts[index].included;
      setForm((p:any) => ({...p, adminOptions: newOpts}));
  };

  const addGallery = (url: string) => {
      if(!url) return;
      setForm((p:any) => ({ ...p, gallery: [...p.gallery, url] }));
  };
  
  const removeGallery = (index: number) => setForm((p:any) => ({ ...p, gallery: p.gallery.filter((_:any, i:number) => i !== index) }));
  
  const handleRollback = async (historyItem: any) => {
      if(!confirm(`Rollback data?`)) return;
      setLoading(true);
      try {
          const res = await fetch('/api/admin/billboards/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ historyId: historyItem.id })
          });
          if (!res.ok) {
              alert("Gagal melakukan rollback. Silakan coba lagi.");
              setLoading(false);
              return;
          }
          window.location.reload();
      } catch {
          alert("Gagal terhubung ke server.");
          setLoading(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      
      // Route Next (create/update) yang menyusun sendiri `specs`, `includes`,
      // dan `excludes` dari `adminOptions` + field ukuran mentah, jadi cukup
      // kirim data form apa adanya.
      const payload = {
          ...form,
          ...(billboardId ? { id: billboardId } : {}),
          gallery: form.gallery,
          adminOptions: form.adminOptions
      };

      const endpoint = billboardId ? '/api/admin/billboards/update' : '/api/admin/billboards/create';

      try {
          const res = await fetch(endpoint, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(payload)
          });
          if(res.ok) { alert("Sukses!"); if(billboardId) window.location.reload(); else router.push('/admin/billboards'); }
          else {
              const msg = await res.json().catch(() => null);
              alert("Gagal menyimpan data" + (msg?.message ? `: ${msg.message}` : "."));
          }
      } catch(err) { alert("Gagal terhubung ke server."); }
      setLoading(false);
  }

  if(fetching) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20 font-sans">
        <div className="flex items-center gap-4 mb-8">
            <button type="button" onClick={() => router.back()} className="p-2 hover:bg-gray-200 rounded-full transition"><ArrowLeft/></button>
            <div>
                <h1 className="text-2xl font-bold text-gray-800">{billboardId ? 'Edit & Audit' : 'Tambah Titik Baru'}</h1>
                <p className="text-gray-500 text-sm">Form data billboard & spesifikasi.</p>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            <div className="lg:col-span-2 space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-800 border-b pb-3 mb-4">Informasi Dasar</h3>
                        <div className="grid grid-cols-1 gap-4">
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Nama Billboard</label><input name="title" value={form.title} onChange={handleChange} className="w-full border rounded p-2.5 mt-1 font-bold text-lg" required /></div>
                            <div className='flex gap-2'><div className='flex-1'><label className="text-xs font-bold text-gray-500 uppercase">Slug URL</label><input name="slug" value={form.slug} onChange={handleChange} className="w-full border rounded p-2.5 mt-1 bg-blue-50/50" required /></div><button type="button" onClick={generateSlug} className="text-blue-600 text-xs mt-6 underline px-2">Auto</button></div>
                            <div className="grid grid-cols-2 gap-2">
                                                                <div><label className="text-xs font-bold text-gray-500 uppercase">Status Ketersediaan</label><select name="status" value={form.status} onChange={handleChange} className="w-full border rounded p-2.5 mt-1 bg-white font-bold"><option value="Available">Available</option><option value="Booked">Booked</option></select></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Status Publikasi</label><select name="publishStatus" value={form.publishStatus} onChange={handleChange} className="w-full border rounded p-2.5 mt-1 bg-white font-bold"><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></div>
                            </div>
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Alamat Lengkap</label><textarea name="address" value={form.address} onChange={handleChange} className="w-full border rounded p-2.5 mt-1 h-20" required /></div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-800 border-b pb-3 mb-4 flex gap-2"><Ruler size={18}/> Spesifikasi Teknis</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Tinggi (m)</label><input type="number" name="sizeH" value={form.sizeH} onChange={handleChange} className="w-full border rounded p-2 font-bold" /></div>
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Lebar (m)</label><input type="number" name="sizeW" value={form.sizeW} onChange={handleChange} className="w-full border rounded p-2 font-bold" /></div>
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Sisi</label><select name="sides" value={form.sides} onChange={handleChange} className="w-full border rounded p-2 bg-white"><option value="1">1 Sisi</option><option value="2">2 Sisi</option><option value="3">3 Sisi</option></select></div>
                            <div><label className="text-[10px] font-bold text-gray-400 uppercase">Orientasi</label><select name="orientation" value={form.orientation} onChange={handleChange} className="w-full border rounded p-2 bg-white"><option>Vertical</option><option>Horizontal</option></select></div>
                        </div>
                        <div className='mb-4 grid grid-cols-2 gap-4'>
                             <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Penerangan</label>
                                <select name="lighting" value={form.lighting} onChange={handleChange} className="w-full border rounded p-2 bg-white mt-1">
                                    <option value="Frontlight">Frontlight</option>
                                    <option value="Backlight">Backlight</option>
                                    <option value="Videotron">Videotron / LED</option>
                                    <option value="Non-Light">Tidak Ada Lampu</option>
                                </select>
                             </div>
                             <div><label className="text-[10px] font-bold text-gray-400 uppercase">Material</label><input name="material" value={form.material} onChange={handleChange} className="w-full border rounded p-2 mt-1" /></div>
                        </div>
                        <div><label className="text-[10px] font-bold text-gray-400 uppercase flex gap-1 items-center mb-1"><ExternalLink size={12}/> Link Laporan Trafik</label><input name="smartsucoUrl" value={form.smartsucoUrl} onChange={handleChange} className="w-full border border-blue-100 bg-blue-50/50 rounded p-2 text-xs text-blue-700"/></div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <h3 className="font-bold text-gray-800 mb-3 text-sm">Fasilitas & Biaya</h3>
                         <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6">
                            {form.adminOptions.map((opt:any, idx:number) => (
                                <label key={idx} className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition group">
                                    <span className="text-sm font-medium text-gray-700">{opt.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold ${opt.included ? 'text-green-600' : 'text-red-500'}`}>{opt.included ? 'INCLUDE' : 'EXCLUDE'}</span>
                                        <input type="checkbox" checked={opt.included} onChange={()=>handleAdminCheck(idx)} className="w-5 h-5 accent-utero cursor-pointer" />
                                    </div>
                                </label>
                            ))}
                         </div>
                         
                         <div className='flex flex-col md:flex-row gap-6 border-t pt-4'>
                             <div className='md:w-1/2'>
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Harga Sewa / Bulan</label>
                                <input type="number" name="price" value={form.price} onChange={e=>setForm((p:any)=>({...p, price:Number(e.target.value)}))} className="w-full border rounded p-2.5 text-xl font-bold" required />
                                <div className='mt-2 flex gap-2'><input placeholder="Lat" name="lat" value={form.lat} onChange={handleChange} className="w-full border rounded p-2 text-xs"/><input placeholder="Lng" name="lng" value={form.lng} onChange={handleChange} className="w-full border rounded p-2 text-xs"/></div>
                             </div>
                             <div className='md:w-1/2'>
                                {inputType==='AUTO' ? <ImageUpload value={form.mainImage} onChange={(u)=>setForm((p:any)=>({...p,mainImage:u}))} label='Cover Image'/> : <input value={form.mainImage} onChange={e=>setForm((p:any)=>({...p,mainImage:e.target.value}))} className="w-full border p-2 text-xs"/>}
                                <button type='button' onClick={()=>setInputType(p=>p==='AUTO'?'MANUAL':'AUTO')} className="text-xs underline mt-1 text-gray-400">Switch Upload Mode</button>
                             </div>
                         </div>
                                                  <div className="mt-4 pt-4 border-t">
                             <label className="text-xs font-bold text-gray-500 uppercase mb-3 block">Galeri Tambahan</label>
                             <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                 {form.gallery.map((url:string, i:number) => (
                                     <div key={i} className="relative aspect-square rounded-lg border-2 border-gray-200 overflow-hidden group">
                                         <img src={url} alt={`Gallery image ${i + 1}`} className="w-full h-full object-cover"/>
                                         <button 
                                            type='button' 
                                            onClick={() => removeGallery(i)} 
                                            className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            aria-label="Remove image"
                                         >
                                             <X size={12}/>
                                         </button>
                                     </div>
                                 ))}
                                 
                                 {/* Tombol Upload Baru */}
                                 <div className="aspect-square">
                                     <ImageUpload value="" onChange={addGallery} />
                                 </div>
                             </div>
                         </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type='button' onClick={()=>router.back()} className="px-6 py-3 rounded-lg text-gray-600 font-bold hover:bg-gray-100 transition">Batal</button>
                        <button type='submit' disabled={loading} className="bg-utero hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition flex items-center gap-2">
                            {loading ? <Loader2 className="animate-spin"/> : <Save size={18}/>} Simpan Data
                        </button>
                    </div>
                </form>
            </div>

            {/* KOLOM KANAN: HISTORY (No changes) */}
            <div className="lg:col-span-1 space-y-4">
                 {billboardId && (
                     <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
                            <History size={18} className="text-gray-500"/><h3 className="font-bold text-gray-700 text-sm">Riwayat Revisi</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar max-h-[500px] pr-1">
                            {historyList.length === 0 ? <p className="text-xs text-gray-400 text-center italic py-4">Belum ada revisi.</p> :
                                historyList.map((log: any) => (
                                    <div key={log.id} className="bg-gray-50 p-3 rounded-lg border text-xs">
                                        <div className="flex justify-between font-bold text-gray-700 mb-1">
                                            <span>{log.changedBy?.name || "System"}</span>
                                            <span className="text-[10px] font-normal text-gray-400">{new Date(log.archivedAt).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-gray-500 mb-2 truncate">Harga lama: Rp {angkaRupiah(log.price)}</p>
                                        <button onClick={()=>handleRollback(log)} className="text-blue-600 font-bold hover:underline flex gap-1"><RotateCcw size={10}/> Restore</button>
                                    </div>
                                ))
                            }
                        </div>
                        <p className="text-[9px] text-center text-gray-300 mt-4">*Audit Log V1</p>
                     </div>
                 )}
            </div>
        </div>
    </div>
  );
}