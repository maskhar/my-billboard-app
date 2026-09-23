// src/app/dashboard/order/[id]/page.tsx

import Navbar from '@/components/Navbar';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Check, CalendarDays, ArrowLeft, MapPin, Download, ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { angkaRupiah } from '@/lib/money';

type Props = {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage(props: Props) {
  const session = await getServerSession(authOptions);
  const params = await props.params;

  if (!session) notFound();

  const order = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { billboard: true }
  });

  if (!order) notFound();

  // Cek kepemilikan. Sebelumnya order diambil berdasarkan id saja, sehingga user
  // mana pun bisa membaca order milik orang lain hanya dengan mengganti id di URL.
  //
  // Sengaja memakai notFound(), bukan pesan "tidak berhak": pesan error akan
  // membocorkan bahwa id tersebut memang ada di database.
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(session.user.role);
  if (order.userId !== session.user.id && !isAdmin) notFound();

  // --- HELPER FORMAT ---
  const formatTime = (d: Date | null) => {
      if(!d) return '';
      return new Intl.DateTimeFormat('id-ID', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(d);
  };
  const formatDateOnly = (d: Date) => {
      return new Intl.DateTimeFormat('id-ID', {day:'numeric', month:'long', year:'numeric'}).format(d);
  };

  const endDate = new Date(order.endDate);
  
  // --- LOGIC STATUS (6 TAHAP) ---
  const s = order.status; // status saat ini

  // 1. Pesan (Selalu True jika data ada)
  
    // 2. Bayar (Ada tanggal `paidAt`)
  const isPaid = !!order.paidAt;

  // 3. Desain (Status desain `APPROVED`)
  const isDesignApproved = order.designStatus === 'APPROVED';

  // 4. Cetak (Ada tanggal `productionStartedAt`)
  const isPrinting = !!order.productionStartedAt;

  // 5. Pasang (Ada tanggal `installedAt`)
  const isInstall = !!order.installedAt;

  // 6. Tayang (Status ACTIVE DAN Ada Bukti Foto)
  const isLive = s === 'ACTIVE' && !!order.installationProof;


  const steps = [
      { id: 1, label: 'Pesan', done: true, time: formatTime(order.createdAt) },
      { id: 2, label: 'Dibayar', done: isPaid, time: formatTime(order.paidAt) },
      { id: 3, label: 'Desain Disetujui', done: isDesignApproved, time: formatTime(order.designApprovedAt) },
      { id: 4, label: 'Cetak', done: isPrinting, time: formatTime(order.productionStartedAt) },
      { id: 5, label: 'Pasang', done: isInstall, time: formatTime(order.installedAt) },
      { id: 6, label: 'Tayang', done: isLive, time: isLive ? formatTime(order.installedAt) : '' },
  ];

  // Logic Progress Bar (Total 5 Jarak antar titik)
  const activeStepIndex = steps.findLastIndex(s => s.done);
  const progressPercent = Math.min((activeStepIndex / (steps.length - 1)) * 100, 100);

  // Status Merah
  const isFailed = s === 'CANCELLED' || s === 'REFUNDED';
  const hasPhoto = !!order.installationProof;


  return (
    <div className="bg-gray-50 min-h-screen pb-20 font-sans">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 pt-24">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-500 hover:text-utero mb-6 font-bold text-sm transition">
             <ArrowLeft size={16}/> Kembali ke Dashboard
          </Link>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden">
              
              <div className="flex justify-between items-start border-b border-gray-100 pb-6 mb-8">
                  <div>
                      <h1 className="text-2xl font-bold text-gray-900 mb-1">Tracking Pesanan</h1>
                      <p className="text-gray-500 text-sm font-mono">#{order.id.slice(-8).toUpperCase()}</p>
                  </div>
                  <div className="text-right">
                      <p className="text-xs text-gray-400 font-bold uppercase mb-1">Berakhir Pada</p>
                      <div className="text-lg font-bold text-utero flex items-center gap-2 bg-red-50 px-3 py-1 rounded-lg border border-red-100">
                          <CalendarDays size={18}/> {formatDateOnly(endDate)}
                      </div>
                  </div>
              </div>

              {/* TIMELINE VISUAL (6 STEP) */}
              {!isFailed ? (
                  <div className="relative mb-16 px-4 mt-8"> 
                      {/* Garis Abu (Latar) */}
                      <div className="absolute top-4 left-0 w-full h-1.5 bg-gray-100 rounded-full"></div>
                      
                      {/* Garis Hijau (Progress) */}
                      <div className="absolute top-4 left-0 h-1.5 bg-green-500 transition-all duration-1000 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.4)]" 
                           style={{ width: `${progressPercent}%` }}>
                      </div>

                      <div className="flex justify-between relative z-10">
                          {steps.map((step, idx) => (
                              <div key={idx} className="flex flex-col items-center w-24 -ml-4 md:ml-0">
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all border-[3px] z-20 ${
                                      step.done ? 'bg-green-500 text-white border-white shadow-lg' : 'bg-white border-gray-200 text-gray-300'
                                  }`}>
                                      {step.done ? <Check size={16} strokeWidth={3}/> : idx + 1}
                                  </div>
                                  <p className={`text-[10px] md:text-xs font-bold mt-2 uppercase tracking-wide text-center transition-colors ${step.done ? 'text-green-700' : 'text-gray-300'}`}>
                                      {step.label}
                                  </p>
                                  {step.time && step.done && (
                                    <span className="text-[9px] text-gray-500 mt-1 bg-gray-50 px-1.5 py-0.5 rounded font-mono">{step.time}</span>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>
              ) : (
                  <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-center font-bold mb-8 text-sm">
                      ❌ Pesanan Dibatalkan / Refund
                  </div>
              )}
            
            
            {/* AREA BUKTI FOTO (Hanya muncul jika Status Active + Ada Foto) */}
              {hasPhoto && (
                  <div className="bg-green-50/50 border border-green-200 rounded-xl p-6 mb-8 flex gap-6 items-center animate-in fade-in slide-in-from-bottom-2">
                      <div className="w-24 h-24 bg-white rounded-lg p-1 shadow-sm shrink-0">
                           <img src={order.installationProof} className="w-full h-full object-cover rounded border border-gray-100 cursor-pointer hover:opacity-80"/>
                      </div>
                      <div className="flex-1">
                          <h4 className="font-bold text-green-800 text-sm mb-1 flex items-center gap-2"><ImageIcon size={16}/> Iklan Telah Tayang!</h4>
                          <p className="text-xs text-gray-600 mb-3">Laporan lapangan tersedia. Klik tombol di bawah untuk mengunduh dokumentasi lengkap.</p>
                          <a href={order.installationProof} target="_blank" className="text-[10px] bg-white text-green-700 font-bold px-3 py-2 rounded border border-green-200 shadow-sm inline-flex items-center gap-1 hover:bg-green-100 hover:border-green-300 transition">
                              <Download size={12}/> Lihat/Unduh Foto
                          </a>
                      </div>
                  </div>
              )}


              {/* INFO DETAIL BAWAH */}
              <div className="bg-gray-50 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-center md:items-start border border-gray-200">
                  <img src={order.billboard.mainImage} alt={order.billboard.title} className="w-24 h-24 rounded-xl object-cover border border-gray-300" />
                  <div className="flex-1 text-center md:text-left">
                      <h4 className="font-bold text-gray-800 text-lg">{order.billboard.title}</h4>
                      <p className="text-xs text-gray-500 flex items-center justify-center md:justify-start gap-1 mt-1 mb-3">
                        <MapPin size={12}/> {order.billboard.address}
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-3 md:w-1/2">
                          <div>
                              <p className='text-[10px] font-bold text-gray-400 uppercase'>Total Tagihan</p>
                              <p className='font-bold text-utero'>Rp {angkaRupiah(order.totalPrice)}</p>
                          </div>
                          <div>
                              <p className='text-[10px] font-bold text-gray-400 uppercase'>Durasi</p>
                              <p className='font-bold text-gray-700'>{order.duration} Bulan</p>
                          </div>
                      </div>

                      <div className="flex gap-2 mt-4 justify-center md:justify-start">
                           <a href={`/invoice/${order.id}`} target='_blank' rel="noopener noreferrer" className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-100 transition shadow-sm">
                              Lihat Invoice
                           </a>
                           <Link href={`/billboard/${order.billboard.slug}`} className="px-5 py-2.5 bg-gray-900 border border-black text-white text-xs font-bold rounded-lg hover:bg-black transition shadow-sm">
                              Lihat Paket Lagi
                           </Link>
                      </div>
                  </div>
              </div>

          </div>
      </div>
    </div>
  )
}