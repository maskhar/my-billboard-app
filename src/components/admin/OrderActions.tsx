// src/components/admin/OrderActions.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    CheckCircle, XCircle, Loader2, AlertTriangle, UploadCloud,
    Eye, Printer, Hammer, Palette, Truck, Banknote, Wallet
} from 'lucide-react';
import Link from 'next/link';
import { rupiah } from '@/lib/money';
import { alasanPenolakan, bacaJawaban } from '@/lib/baca-jawaban';
import { useToast } from '@/components/ui/Toast';
import { useKonfirmasi } from '@/components/ui/Konfirmasi';
// Tipe saja — terhapus saat build, jadi tidak ada Prisma di client bundle.
import type { Role } from '@prisma/client';

/**
 * Kolom pesanan yang benar-benar dibaca komponen ini.
 *
 * Sengaja TIDAK mengimpor `TransaksiUntukClient` dari `TransactionClient.tsx`:
 * file itulah satu-satunya pemanggil komponen ini, jadi impor baliknya akan
 * melingkar. Tipe di bawah adalah himpunan bagiannya, dan karena TypeScript
 * mencocokkan bentuk (bukan nama), `order={selected}` di sana tetap lolos —
 * sementara kolom yang salah tulis di SINI menjadi galat kompilasi.
 *
 * Sebelumnya prop ini `any`. Akibatnya bukan sekadar kerapian: `order.status`
 * dibandingkan dengan sebelas string status di file ini, dan satu salah ketik
 * ('PROCESS_REUND') membuat tombolnya hilang tanpa satu pun peringatan.
 */
export type PesananUntukAksi = {
  id: string;
  status: string;
  totalPrice: number;
  designOption: string | null;
  designFileUrl: string | null;
  refundProof: string | null;
  installationProof: string | null;
  userBankName: string | null;
  userBankAccount: string | null;
};

/**
 * Kolom tambahan yang diterima `/api/admin/update-order` selain `orderId` dan
 * `newStatus`.
 *
 * Route itu memakai allowlist, jadi kolom asing memang dibuang di server —
 * tapi `extraData: any` membuat salah tulis di sisi client (`refundProff`)
 * lolos `tsc` dan berakhir sebagai 422 "bukti transfer wajib" yang membingungkan.
 */
type DataTambahan = {
  reason?: string;
  refundProof?: string;
  installationProof?: string;
  isLocked?: boolean;
};

/**
 * Role yang benar-benar diterima ketiga route yang dipanggil komponen ini.
 *
 * `admin/update-order`, `admin/orders/record-payment`, dan
 * `admin/orders/add-charge` semuanya menolak dengan `['ADMIN', 'SUPER_ADMIN']`.
 * Sementara itu `admin/(dashboard)/layout.tsx` mengizinkan `CS` dan `OPERATOR`
 * masuk dashboard, jadi mereka melihat SELURUH tombol di kolom ini — dan setiap
 * penekanan berakhir 403 setelah `confirm()` yang menakutkan ("status REFUNDED
 * tidak bisa dibatalkan") sudah disetujui. Yang lebih buruk, `prompt()` alasan
 * pembatalan sudah terisi dan hilang bersama penolakannya.
 *
 * BENTUKNYA DIVALIDASI COMPILER, DAN ITU BUKAN KERAPIAN
 * ------------------------------------------------------
 * Daftar ini dulu `['ADMIN', 'SUPER_ADMIN']` polos dan `currentUserRole`
 * bertipe `string`. Dua-duanya membuat salah tulis **lolos kompilasi**: TypeScript
 * melebarkan array literal menjadi `string[]`, dan `string[].includes(string)`
 * menerima apa pun. Jadi `'SUPER_ADMINN'` tidak menghasilkan satu pun galat —
 * tombolnya sekadar berhenti muncul untuk peran itu, tanpa ada yang tahu.
 *
 * Anotasi `readonly Role[]` menutupnya tanpa mengimpor NILAI dari
 * `@prisma/client`: `import type` terhapus saat build, jadi client bundle tetap
 * bersih. Pola yang sama sudah dipakai `TransactionClient.tsx`.
 */
const ROLE_BOLEH_UBAH: readonly Role[] = ['ADMIN', 'SUPER_ADMIN'];

export default function OrderActions({
  order,
  currentUserRole,
  adaUangMasuk,
  nominalRefund,
  sisaPokok,
}: {
  order: PesananUntukAksi;
  /** Role sesi, dari server. Menentukan apakah tombol pengubah dirender. */
  currentUserRole: Role;
  /**
   * Apakah pesanan ini punya `Payment PAID` pokok — dihitung server dari ledger.
   *
   * Dulu disimpulkan di sini sebagai `order.status === 'PAID_CONFIRMED'`. Status
   * bukan fakta uang: pesanan yang sudah dibayar lalu masuk produksi tidak lagi
   * berstatus `PAID_CONFIRMED`, sehingga tombol Tolak menghanguskannya sebagai
   * `CANCELLED` — status buntu yang bukan titik awal refund. Uangnya ada di
   * rekening perusahaan tanpa satu pun tombol yang bisa mengeluarkannya.
   */
  adaUangMasuk: boolean;
  /** Nominal refund yang sudah tercatat server, atau null bila belum ada. */
  nominalRefund: number | null;
  /**
   * Sisa tagihan POKOK menurut ledger, dihitung server (`sisaTagihan`).
   *
   * Dipakai modal pencatatan pembayaran manual sebagai nominal awal dan sebagai
   * batas atasnya. Server tetap memeriksanya sendiri di dalam transaksi — angka
   * di sini hanya supaya admin tidak perlu menghitungnya di kepala.
   */
  sisaPokok: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const konfirmasi = useKonfirmasi();
  const [loading, setLoading] = useState(false);

  // STATE MODALS
  const [showTransferModal, setShowTransferModal] = useState(false); // Buat upload bukti trf
  const [showInstallModal, setShowInstallModal] = useState(false); // BUAT UPLOAD BUKTI TAYANG
  const [showDesignModal, setShowDesignModal] = useState(false); // BUAT LIHAT DESAIN USER
  const [showCatatModal, setShowCatatModal] = useState(false); // CATAT PEMBAYARAN MANUAL

  const [proofData, setProofData] = useState<string>("");
  const [installData, setInstallData] = useState<string>(""); // Data Foto Tayang
  const [nominalCatat, setNominalCatat] = useState<string>("");
  const [keteranganCatat, setKeteranganCatat] = useState<string>("");
  // Berkas sedang diunggah. Dipisah dari `loading` (yang menandai permintaan
  // ubah status) supaya tombol simpan di modal bisa dimatikan selama unggahan
  // berjalan tanpa ikut mematikan seluruh panel aksi.
  const [mengunggah, setMengunggah] = useState(false);

  useEffect(() => {
      setProofData(order.refundProof || "");
      setInstallData(order.installationProof || "");
  }, [order]);

  const updateStatus = async (newStatus: string, extraData: DataTambahan = {}) => {
      setLoading(true);
      try {
          const res = await fetch('/api/admin/update-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: order.id, newStatus, ...extraData })
          });
          const jawaban = await bacaJawaban(res);
          if (!res.ok) {
              toast.galat('Gagal memperbarui status: ' + alasanPenolakan(res, jawaban));
              return;
          }
          setShowTransferModal(false);
          setShowInstallModal(false);
          router.refresh();
      } catch (galat) {
          // Dicatat, bukan ditelan. `catch` di sini menangkap `fetch` yang
          // melempar — jaringan mati, permintaan dibatalkan — dan tanpa satu
          // baris log tidak ada cara tahu itu terjadi setelah admin melapor
          // "tombolnya tidak jalan".
          console.error('Gagal memperbarui status pesanan:', galat);
          toast.galat('Server tidak dapat dihubungi. Status tidak berubah.');
      } finally {
          setLoading(false);
      }
  };

  // --- HANDLERS HELPER ---
  // Berkas diunggah ke `/api/upload`, dan yang disimpan ke state adalah URL
  // hasilnya — BUKAN isi berkasnya.
  //
  // Sebelumnya fungsi ini memakai `FileReader.readAsDataURL` dan menaruh
  // `data:image/jpeg;base64,...` ke state, lalu mengirimkannya sebagai
  // `installationProof`/`refundProof`. Tiga lapisan di belakangnya menolak
  // bentuk itu tanpa memberi tahu siapa pun:
  //
  //   1. `urlBuktiSah()` di `src/lib/url-bukti.ts` MENOLAK skema `data:`
  //      (memang harus: `data:` di `src`/`href` adalah pembawa XSS).
  //   2. `api/admin/update-order/route.ts` hanya menulis kolomnya bila
  //      nilainya lolos — `if (buktiPasang)`.
  //   3. Perpindahan statusnya sendiri tetap berhasil.
  //
  // Hasilnya kegagalan yang paling mahal: pesanan berpindah ke `ACTIVE`,
  // admin membaca "Update Sukses", dan `installationProof` tetap kosong
  // selamanya. Tidak ada galat di layar, tidak ada baris di log. Bukti
  // pemasangan yang hilang baru ditemukan saat pembeli menagihnya.
  //
  // `/api/upload` sudah menjadi jalur yang benar dan dipakai
  // `components/ImageUpload.tsx`: ia memeriksa tipe MIME terhadap isi berkas,
  // membatasi ukuran, memasang jatah per pengguna, dan mengembalikan
  // `{ url: '/uploads/...' }` — bentuk yang `urlBuktiSah()` terima.
  const handleFileChange = async (
      e: React.ChangeEvent<HTMLInputElement>,
      setter: (url: string) => void,
  ) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Batasnya dinaikkan ke 10 MB supaya sama dengan `MAX_BYTES` di
      // `api/upload/route.ts`. Batas klien yang lebih ketat daripada server
      // hanya menolak berkas yang sebenarnya diterima.
      if (file.size > 10 * 1024 * 1024) {
          toast.galat('Berkas melebihi 10 MB. Perkecil dulu gambarnya, lalu unggah lagi.');
          return;
      }

      // Nilai input dikosongkan supaya memilih berkas yang SAMA setelah
      // kegagalan tetap memicu `onChange` lagi.
      e.target.value = '';

      setMengunggah(true);
      try {
          const formData = new FormData();
          formData.append('file', file);
          // `orderId` membuat route unggah memeriksa bahwa pemanggil memang
          // berhak atas pesanan ini.
          formData.append('orderId', order.id);

          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          // `bacaJawaban`, bukan `res.json().catch(() => ({}))`: badan 500 dari
          // Next.js berisi HTML, dan galat penguraiannya akan MENGGANTIKAN
          // pesan server yang sebenarnya. Sudah dipakai `updateStatus` di berkas
          // ini dan `ImageUpload.tsx` untuk route yang sama.
          const jawaban = await bacaJawaban(res);

          if (!res.ok) {
              toast.galat(alasanPenolakan(res, jawaban));
              return;
          }

          // Respons 200 tanpa `url` diperlakukan sebagai kegagalan. Menyetel
          // state ke teks kosong membuat tombol simpan tampak siap padahal
          // tidak ada apa pun untuk disimpan — persis cacat yang sedang
          // ditutup di sini.
          if (!jawaban.url) {
              toast.galat('Server tidak mengembalikan alamat berkas. Bukti belum tersimpan.');
              return;
          }

          setter(jawaban.url);
          toast.sukses('Berkas terunggah.');
      } catch (galat) {
          console.error('Gagal mengunggah bukti:', galat);
          toast.galat('Server tidak dapat dihubungi. Berkas belum terunggah.');
      } finally {
          setMengunggah(false);
      }
  };

  const handleForceCancel = async () => {
      const reason = await konfirmasi({
          judul: 'Batalkan paksa pesanan yang sedang tayang?',
          pesan:
              'Pesanan ini sudah ACTIVE. Membatalkannya memindahkannya ke alur ' +
              'pengembalian dana: pembeli diminta mengisi rekening, lalu Anda ' +
              'mentransfer pengembaliannya.',
          labelSetuju: 'Batalkan Paksa',
          labelTolak: 'Jangan',
          nada: 'bahaya',
          isian: {
              label: 'Alasan pembatalan paksa',
              placeholder: 'mis. billboard rusak tertimpa pohon',
              panjang: true,
          },
      });
      if (typeof reason !== 'string') return;
      updateStatus('WAITING_BANK', { reason });
  };

  // Tombol "Tolak" dulu selalu mengirim `CANCELLED`, baik pesanannya sudah
  // dibayar maupun belum — dan itu menjebak uang pembeli. `CANCELLED` adalah
  // status buntu yang juga bukan titik awal pengajuan refund, jadi pesanan
  // `PAID_CONFIRMED` yang ditolak berakhir tanpa satu pun jalur pengembalian
  // dana: uangnya ada di rekening perusahaan, tapi tidak ada tombol mana pun
  // yang bisa mengeluarkannya lagi. Lihat catatan di src/lib/transisi-status.ts.
  //
  // Sekarang jalurnya ditentukan oleh ada-tidaknya uang yang sudah masuk
  // menurut ledger `Payment PAID` — dihitung server, dikirim sebagai
  // `adaUangMasuk`. Pesanan yang belum dibayar benar-benar dibatalkan, pesanan
  // yang sudah dibayar masuk ke alur refund yang sudah ada.
  const handleReject = async () => {
      const sudahDibayar = adaUangMasuk;

      const reason = await konfirmasi({
          judul: sudahDibayar ? 'Tolak pesanan yang sudah dibayar?' : 'Tolak pesanan ini?',
          pesan: sudahDibayar
              ? 'Pesanan ini SUDAH DIBAYAR. Menolaknya berarti dananya harus dikembalikan ' +
                'ke pembeli.'
              : 'Pesanan belum dibayar, jadi penolakan langsung membatalkannya. Alasannya ' +
                'dikirimkan ke pembeli.',
          labelSetuju: 'Lanjutkan',
          nada: sudahDibayar ? 'bahaya' : 'biasa',
          isian: {
              label: sudahDibayar ? 'Alasan penolakan' : 'Alasan tolak',
              placeholder: 'mis. tanggal bentrok dengan pemasangan lain',
              panjang: true,
          },
      });
      if (typeof reason !== 'string') return;

      if (sudahDibayar) {
          // Langkah KEDUA, sengaja terpisah dari pengisian alasan: yang disetujui
          // di sini bukan penolakannya, melainkan konsekuensi uangnya.
          const setuju = await konfirmasi({
              judul: 'Masuk alur pengembalian dana',
              pesan:
                  'Pembeli akan diminta mengisi rekening, lalu Anda mentransfer 90% dari ' +
                  'uang yang sudah diterima (dipotong biaya admin 10%).',
              labelSetuju: 'Mulai Pengembalian Dana',
              nada: 'bahaya',
          });
          if (!setuju) return;
          updateStatus('WAITING_BANK', { reason });
          return;
      }

      updateStatus('CANCELLED', { reason });
  };

  // CATAT PEMBAYARAN MANUAL — uang yang masuk di luar gerbang pembayaran.
  //
  // Satu-satunya cara menulis `Payment PAID` selain webhook Xendit. Ada karena
  // tombol "Terima Manual" di bawah hanya memindahkan STATUS: sebelum route
  // pencatatan ini ada, pesanan yang dibayar lewat transfer langsung memasuki
  // tahap cetak dengan pembukuan kosong — uangnya tidak punya jejak, tidak masuk
  // laporan, dan tidak bisa dikembalikan lewat alur refund.
  //
  // `router.refresh()` dipanggil setelah berhasil supaya `adaUangMasuk` dan
  // `sisaPokok` yang dihitung server ikut diperbarui sebelum admin menekan
  // "Terima Manual".
  const handleCatatPembayaran = async () => {
      const nominal = Number(nominalCatat);
      if (!Number.isFinite(nominal) || nominal <= 0) {
          toast.galat('Nominal pembayaran harus angka lebih dari nol.');
          return;
      }
      if (!Number.isInteger(nominal)) {
          toast.galat('Nominal harus rupiah bulat, tanpa pecahan sen.');
          return;
      }
      if (nominal > sisaPokok) {
          toast.galat(
              `Nominal ${rupiah(nominal)} melebihi sisa tagihan pokok ${rupiah(sisaPokok)}.`
          );
          return;
      }

      const setuju = await konfirmasi({
          judul: `Catat pembayaran masuk ${rupiah(nominal)}?`,
          pesan:
              'Nominal ini akan tercatat sebagai uang yang sudah diterima perusahaan dan ' +
              'menjadi batas atas pengembalian dana bila pesanan ini direfund. Pastikan ' +
              'uangnya benar-benar sudah ada di rekening.',
          labelSetuju: 'Catat Pembayaran',
          nada: 'bahaya',
      });
      if (!setuju) return;

      setLoading(true);
      try {
          const res = await fetch('/api/admin/orders/record-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  orderId: order.id,
                  amount: nominalCatat,
                  keterangan: keteranganCatat,
              }),
          });
          const jawaban = await bacaJawaban(res);
          if (!res.ok) {
              toast.galat('Gagal mencatat pembayaran: ' + alasanPenolakan(res, jawaban));
              return;
          }
          toast.sukses(jawaban.pesan ?? 'Pembayaran tercatat.');
          setShowCatatModal(false);
          setNominalCatat("");
          setKeteranganCatat("");
          router.refresh();
      } catch (galat) {
          console.error('Gagal mencatat pembayaran manual:', galat);
          toast.galat('Server tidak dapat dihubungi. Pembayaran TIDAK tercatat.');
      } finally {
          setLoading(false);
      }
  };

  // --- HANDLER PROSES PRODUKSI (ALUR BARU) ---

  // 1. TERIMA BAYAR
  //
  // Tombol ini hanya memindahkan TAHAP, tidak mencatat uang. Server menolak
  // perpindahan dari `PENDING_PAYMENT` ke tahap sesudah pembayaran bila belum ada
  // `Payment PAID` (422 `UANG_BELUM_TERCATAT`), jadi jalurnya diperiksa di sini
  // lebih dulu — supaya admin diberi tahu langkah yang benar, bukan sekadar
  // ditolak setelah menekan `confirm()`.
  const handleApprovePayment = async () => {
      if (order.status === 'PENDING_PAYMENT' && !adaUangMasuk) {
          toast.galat(
              'Pesanan ini belum punya pembayaran yang tercatat, jadi belum bisa ' +
              'dipindahkan ke tahap produksi.\n\n' +
              'Bila uangnya sudah diterima di luar gerbang pembayaran (mis. transfer ' +
              'langsung), catat dulu lewat tombol "Catat Pembayaran Manual" agar ' +
              'nominalnya masuk pembukuan dan bisa dikembalikan lewat alur refund ' +
              'bila perlu.'
          );
          return;
      }

      const setuju = await konfirmasi({
          judul: 'Verifikasi pembayaran diterima?',
          pesan: 'Pesanan akan dipindahkan ke tahap berikutnya sesuai pilihan desain pembeli.',
          labelSetuju: 'Verifikasi',
      });
      if (!setuju) return;
      // Jika user pilih "Jasa Desain", langsung masuk Produksi.
      // Jika user "Upload Sendiri", masuk status menunggu desain / review desain.
      if (order.designOption === 'service') {
          updateStatus('IN_PRODUCTION'); // Langsung cetak karena kita yang desain
      } else {
          // Tunggu user upload atau kita verifikasi file mereka
          // Jika file sudah ada, masuk produksi. Jika belum, biarkan di fase desain.
          updateStatus(order.designFileUrl ? 'IN_PRODUCTION' : 'DESIGN_RECEIVED');
      }
  };

  // 2. VERIFIKASI DESAIN & MULAI CETAK
  const handleStartPrinting = async () => {
      const setuju = await konfirmasi({
          judul: 'Mulai proses cetak?',
          pesan: 'Pastikan file desain dari pembeli sudah diperiksa dan layak cetak.',
          labelSetuju: 'Mulai Cetak',
      });
      if (!setuju) return;
      updateStatus('IN_PRODUCTION');
  };

  // 3. MULAI PEMASANGAN
  const handleStartInstall = async () => {
      const setuju = await konfirmasi({
          judul: 'Mulai pengiriman & pemasangan?',
          pesan: 'Pastikan banner sudah selesai dicetak.',
          labelSetuju: 'Kirim & Pasang',
      });
      if (!setuju) return;
      updateStatus('INSTALLATION');
  };

  // 4. SELESAI TAYANG (Upload Bukti)
  const handleFinishInstall = () => {
      if (!installData) {
          toast.galat('Wajib unggah foto bukti tayang sebelum pesanan diaktifkan.');
          return;
      }
      updateStatus('ACTIVE', { installationProof: installData });
  };

  // 5. SELESAIKAN REFUND (Upload Bukti Transfer)
  //
  // `setShowTransferModal(true)` sudah dipanggil sejak lama, tapi modalnya tidak
  // pernah dirender — jadi tidak ada jalur mana pun untuk mengirim
  // `refundProof`. Sekarang server menolak `REFUNDED` tanpa bukti transfer (422),
  // sehingga tanpa modal ini alur refund tidak punya langkah terakhir.
  //
  // Hanya URL http/https yang diterima: `refundProof` dirender sebagai `src`
  // gambar di dashboard pelanggan, dan server menolak skema lain — termasuk
  // `data:` hasil unggah berkas.
  const handleFinishRefund = async () => {
      const bukti = proofData.trim();
      if (!bukti) {
          toast.galat('Wajib isi tautan bukti transfer.');
          return;
      }

      let sah = false;
      try {
          const url = new URL(bukti);
          sah = url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
          sah = false;
      }
      if (!sah) {
          toast.galat('Tautan bukti transfer harus berupa URL http:// atau https://.');
          return;
      }

      const setuju = await konfirmasi({
          judul: `Tandai refund SELESAI sebesar ${rupiah(nominalRefund)}?`,
          pesan:
              'Pastikan transfer sudah benar-benar dilakukan. Status REFUNDED tidak bisa ' +
              'dibatalkan.',
          labelSetuju: 'Tandai Selesai',
          nada: 'bahaya',
      });
      if (!setuju) return;

      updateStatus('REFUNDED', { refundProof: bukti });
  };


  if (loading) return <Loader2 className="animate-spin text-gray-400 mx-auto" size={18} />;

  // CS dan OPERATOR hanya melihat tombol cetak invoice. Server tetap yang
  // memutuskan — ini menghindarkan mereka dari `prompt()`/`confirm()` yang
  // pasti berakhir 403.
  const bolehUbah = ROLE_BOLEH_UBAH.includes(currentUserRole);

  // Daftar yang sama dipakai server (`STATUS_BOLEH_BAYAR_LANJUTAN` di
  // `src/lib/pembayaran.ts`) untuk memutuskan bolehkah setoran dicatat. Ditulis
  // ulang di sini sebagai teks karena komponen client tidak pernah menerima enum
  // Prisma; server tetap yang memutuskan — ini hanya menyembunyikan tombol yang
  // pasti ditolak.
  const bolehCatatSetoran =
      bolehUbah &&
      sisaPokok > 0 &&
      ['PENDING_PAYMENT', 'PAID_CONFIRMED', 'DESIGN_RECEIVED', 'IN_PRODUCTION', 'INSTALLATION', 'ACTIVE']
          .includes(order.status);

  // ===============================================
  // BAGIAN UI TOMBOL DINAMIS
  // ===============================================
  
  const renderButtons = () => {
    // Pengamat (CS/OPERATOR) melihat statusnya saja. Tombol yang ada di sini
    // seluruhnya memanggil route yang menolak role mereka.
    if (!bolehUbah) {
        return <span className="text-[10px] text-gray-400">Hanya lihat</span>;
    }

    // 1. BELUM BAYAR / KONFIRMASI BAYAR
    if (order.status === 'PENDING_PAYMENT' || order.status === 'PAID_CONFIRMED') {
        const isPaid = order.status === 'PAID_CONFIRMED';
        return (
            <div className="flex gap-2 justify-center">
                <button 
                    onClick={handleApprovePayment} 
                    className={`p-1.5 rounded transition flex items-center gap-1 ${isPaid ? 'bg-green-600 text-white shadow-lg animate-pulse' : 'bg-green-50 text-green-700 hover:bg-green-200'}`}
                    title={isPaid ? "Klik untuk Verifikasi" : "Terima Manual"}
                >
                    <CheckCircle size={16} strokeWidth={isPaid ? 3 : 2}/>
                    {isPaid && <span className="text-[10px] font-bold">Verifikasi</span>}
                </button>
                
                {/* Pesanan yang sudah dibayar diarahkan ke alur refund, bukan
                    dihanguskan — lihat `handleReject`. */}
                <button onClick={handleReject} className="bg-red-50 text-red-700 p-1.5 rounded hover:bg-red-600 hover:text-white transition" title={isPaid ? "Tolak & Kembalikan Dana" : "Tolak"}>
                    <XCircle size={16} />
                </button>
            </div>
        );
    }

    // 2. TAHAP DESAIN (User sudah bayar, tapi file belum dicek/diproses)
    if (order.status === 'DESIGN_RECEIVED') {
         return (
             <div className="flex gap-2">
                 <button onClick={() => setShowDesignModal(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded border border-blue-200" title="Lihat Desain User"><Eye size={16}/></button>
                 <button onClick={handleStartPrinting} className="flex items-center gap-1 bg-purple-100 text-purple-700 px-3 py-1.5 rounded text-[10px] font-bold hover:bg-purple-600 hover:text-white transition">
                     <Palette size={14}/> Acc & Cetak
                 </button>
             </div>
         )
    }

    // 3. TAHAP CETAK (Sedang Produksi)
    if (order.status === 'IN_PRODUCTION') {
        return (
             <button onClick={handleStartInstall} className="flex items-center gap-1 bg-orange-100 text-orange-700 px-3 py-1.5 rounded text-[10px] font-bold hover:bg-orange-600 hover:text-white transition w-full justify-center">
                 <Truck size={14}/> Kirim Pasang
             </button>
        )
    }

    // 4. TAHAP PEMASANGAN (Sedang di lapangan)
    if (order.status === 'INSTALLATION') {
        return (
             <button onClick={() => setShowInstallModal(true)} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition w-full justify-center shadow-md animate-bounce">
                 <Hammer size={14}/> Selesai & Upload
             </button>
        )
    }

    // 5. SUDAH TAYANG / REFUND (Flow selesai)
    if (order.status === 'ACTIVE') return (
        <button onClick={handleForceCancel} className="text-gray-400 hover:text-red-600 border border-gray-100 p-2 rounded flex gap-1 items-center transition text-[10px] bg-white shadow-sm hover:shadow" title="Batal Paksa"><AlertTriangle size={14}/> Batal</button>
    );

    // Flow Refund (Tetap Sama)
    if (order.status === 'WAITING_BANK') return <span className="text-[10px] text-orange-600 bg-orange-100 px-2 py-1 rounded">Wait User...</span>;
    if (order.status === 'REVIEW_REFUND') return (<div className="flex gap-2"><button onClick={() => updateStatus('WAITING_BANK')} className="bg-blue-50 text-blue-600 px-2 text-[10px] font-bold rounded">✅ OK</button><button onClick={() => updateStatus('ACTIVE')} className="bg-red-50 text-red-600 px-2 text-[10px] font-bold rounded">❌</button></div>);
    
    if (order.status === 'REFUNDED') {
        // Bukti refund yang tersimpan selalu URL http/https — server menolak
        // skema lain — jadi cukup dibuka di tab baru.
        return (
            <div className='flex gap-1'>
                <span className="p-1 text-green-600 bg-green-50 border rounded text-[10px]">Refunded</span>
                {order.refundProof && (
                    <a
                        href={order.refundProof}
                        target="_blank"
                        rel="noopener noreferrer"
                        className='p-1 border rounded text-gray-500 hover:text-gray-800'
                        title="Lihat bukti transfer"
                    >
                        <Eye size={14}/>
                    </a>
                )}
            </div>
        );
    }

    if (order.status === 'PROCESS_REFUND') {
        return (
            <button
                onClick={() => { setProofData(order.refundProof || ""); setShowTransferModal(true); }}
                className="bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-green-700 transition"
            >
                Trf Sekarang
            </button>
        );
    }
    
    return <span className="text-gray-300">-</span>;
  };


  return (
    <>
        <div className="flex items-center justify-center gap-2">
            {renderButtons()}

            {/* Tersedia di SETIAP tahap yang masih menerima pembayaran, bukan
                hanya `PENDING_PAYMENT`: pembeli DP yang melunasi sisanya lewat
                transfer langsung bisa melakukannya kapan saja selama pesanannya
                berjalan, dan tanpa tombol ini uang itu tidak punya jalur masuk
                pembukuan. */}
            {bolehCatatSetoran && (
                <button
                    onClick={() => { setNominalCatat(String(sisaPokok)); setShowCatatModal(true); }}
                    className="p-1.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition"
                    title={`Catat Pembayaran Manual (sisa ${rupiah(sisaPokok)})`}
                >
                    <Wallet size={16} />
                </button>
            )}

            {order.status !== 'CANCELLED' && (
                <div className="h-6 w-px bg-gray-200 mx-1"></div>
            )}

            {order.status !== 'CANCELLED' && (
                <Link href={`/invoice/${order.id}`} target="_blank" className="p-2 text-gray-400 hover:text-utero hover:bg-gray-50 rounded transition"><Printer size={16}/></Link>
            )}
        </div>

        {/* MODAL INSTALLATION PROOF (BARU) */}
        {showInstallModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-indigo-50 px-4 py-3 border-b flex justify-between items-center text-indigo-900 font-bold">
                        <span><Hammer size={16} className='inline mr-2'/>Bukti Pemasangan</span>
                        <button onClick={() => setShowInstallModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="border-2 border-dashed p-6 text-center rounded-xl cursor-pointer hover:bg-indigo-50 transition relative">
                             <input
                                type="file"
                                accept="image/*"
                                disabled={mengunggah}
                                onChange={(e) => handleFileChange(e, setInstallData)}
                                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
                             />
                             {/* `<img>` biasa, bukan `next/image`: sumbernya jalur unggahan
                                 (`/uploads/...`) atau `secure_url` Cloudinary, dan host
                                 Cloudinary tidak seluruhnya terdaftar di `remotePatterns`.
                                 `next/image` MELEMPAR pada sumber di luar daftar itu, yang
                                 akan menjatuhkan seluruh panel aksi admin.

                                 Arahan `disable-next-line` di bawah HARUS menempel langsung
                                 di atas `<img>`-nya. Sebelumnya ia berada di atas `{mengunggah`,
                                 tiga baris lebih tinggi, jadi yang dibungkamnya adalah baris
                                 pembuka ternary yang tidak pernah dilaporkan apa pun —
                                 sementara `<img>`-nya sendiri tetap memicu peringatan. Dua
                                 peringatan sekaligus: satu untuk `<img>` yang tidak tertutup,
                                 satu untuk arahan yang tidak menutup apa-apa. */}
                             {mengunggah
                                ? <p className="text-xs text-gray-500">Mengunggah…</p>
                                : installData
                                    ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={installData} alt="Pratinjau foto hasil pemasangan" className="max-h-32 mx-auto rounded shadow-sm"/>
                                      )
                                    : <><UploadCloud className="mx-auto text-indigo-300 mb-2"/><p className="text-xs text-gray-500">Upload Foto Hasil Pasang</p></>}
                        </div>
                        {/* Dimatikan sampai ada bukti yang benar-benar terunggah. Tanpa ini
                            admin bisa menekan "Tayangkan & Aktifkan" pada modal kosong,
                            dan satu-satunya penolakan datang dari `handleFinishInstall`
                            sebagai toast — sesudah tombolnya tampak menerima tekanan. */}
                        <button
                            onClick={handleFinishInstall}
                            disabled={loading || mengunggah || !installData}
                            className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-indigo-700 disabled:bg-gray-300 transition"
                        >
                            Tayangkan &amp; Aktifkan
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL BUKTI TRANSFER REFUND
            Langkah terakhir alur refund: admin sudah mentransfer, lalu mencatat
            buktinya. Unggah berkas TIDAK disediakan di sini — `refundProof`
            hanya menerima URL http/https, dan hasil `FileReader` adalah
            `data:` URL yang ditolak server tanpa jejak. */}
        {showTransferModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-green-50 px-4 py-3 border-b flex justify-between items-center text-green-900 font-bold">
                        <span><Banknote size={16} className='inline mr-2'/>Bukti Transfer Refund</span>
                        <button onClick={() => setShowTransferModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs space-y-1 text-gray-600">
                            <div className="flex justify-between">
                                <span>Nominal transfer</span>
                                <span className="font-bold text-gray-900">{rupiah(nominalRefund)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Bank tujuan</span>
                                <span className="font-bold text-gray-900">{order.userBankName || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>No. rekening</span>
                                <span className="font-mono font-bold text-gray-900">{order.userBankAccount || '-'}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Tautan bukti transfer
                            </label>
                            <input
                                type="url"
                                value={proofData}
                                onChange={(e) => setProofData(e.target.value)}
                                placeholder="https://drive.google.com/..."
                                className="w-full border rounded-md p-2 text-xs"
                            />
                            <p className="mt-1 text-[10px] text-gray-400">
                                Unggah tangkapan layar transfer ke penyimpanan Anda, lalu tempel tautannya di sini.
                            </p>
                        </div>

                        <button
                            onClick={handleFinishRefund}
                            disabled={!proofData.trim()}
                            className="w-full bg-green-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-green-700 disabled:bg-gray-300 transition"
                        >
                            Tandai Refund Selesai
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL CATAT PEMBAYARAN MANUAL
            Menulis `Payment PAID` untuk uang yang masuk di luar gerbang
            pembayaran. Tidak memindahkan status pesanan: pencatatan uang dan
            perpindahan tahap adalah dua keputusan berbeda, dan menyatukannya di
            satu tombol adalah sebab pesanan bisa memasuki produksi dengan
            pembukuan kosong. */}
        {showCatatModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-amber-50 px-4 py-3 border-b flex justify-between items-center text-amber-900 font-bold">
                        <span><Wallet size={16} className='inline mr-2'/>Catat Pembayaran Manual</span>
                        <button onClick={() => setShowCatatModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        <p className="text-[11px] leading-relaxed text-gray-500">
                            Untuk uang yang diterima <b>di luar</b> gerbang pembayaran — mis. transfer
                            langsung ke rekening perusahaan. Nominal yang dicatat di sini menjadi
                            batas atas pengembalian dana bila pesanan direfund, jadi isi sesuai uang
                            yang benar-benar masuk.
                        </p>

                        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs space-y-1 text-gray-600">
                            <div className="flex justify-between">
                                <span>Harga pokok</span>
                                <span className="font-bold text-gray-900">{rupiah(order.totalPrice)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Sisa tagihan pokok</span>
                                <span className="font-bold text-gray-900">{rupiah(sisaPokok)}</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Nominal diterima (Rp)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={sisaPokok}
                                step={1}
                                value={nominalCatat}
                                onChange={(e) => setNominalCatat(e.target.value)}
                                className="w-full border rounded-md p-2 text-sm font-mono"
                            />
                            <p className="mt-1 text-[10px] text-gray-400">
                                Rupiah bulat, tanpa pecahan sen. Setoran sebagian akan tercatat sebagai
                                DP dan sisanya otomatis diterbitkan tagihan pelunasannya.
                            </p>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                                Keterangan (opsional)
                            </label>
                            <input
                                type="text"
                                value={keteranganCatat}
                                onChange={(e) => setKeteranganCatat(e.target.value)}
                                placeholder="Transfer BCA a/n Budi, 27 Sep"
                                className="w-full border rounded-md p-2 text-xs"
                            />
                        </div>

                        <button
                            onClick={handleCatatPembayaran}
                            disabled={!nominalCatat.trim()}
                            className="w-full bg-amber-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-amber-700 disabled:bg-gray-300 transition"
                        >
                            Catat Pembayaran
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL LIHAT DESAIN USER */}
        {showDesignModal && (
            <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl p-0 overflow-hidden">
                    <div className="bg-blue-50 px-4 py-3 border-b flex justify-between items-center text-blue-900 font-bold">
                        <span><Eye size={16} className='inline mr-2'/>Desain dari User</span>
                        <button onClick={() => setShowDesignModal(false)}>✕</button>
                    </div>
                    <div className="p-5 space-y-4">
                        {/* `designFileUrl` boleh `null` di status DESIGN_RECEIVED: pembeli
                            yang memilih "upload sendiri" sampai di tahap ini sebelum
                            berkasnya masuk. Sebelum penjaga ini, modalnya merender gambar
                            rusak dan sebuah tombol "Download Desain" tanpa `href` — yang
                            di browser justru menavigasi ke halaman ini sendiri, sehingga
                            admin menyangka berkasnya ada tapi gagal diunduh. */}
                        {order.designFileUrl ? (
                            <>
                                <div className="bg-gray-100 p-4 rounded-lg flex justify-center items-center">
                                    {/* `<img>` biasa, bukan `next/image`: desain diunggah pembeli
                                        dan `designFileUrl` boleh berupa tautan ke penyimpanan
                                        mana pun. `next/image` menolak host yang tidak terdaftar
                                        di `remotePatterns` next.config.ts saat dijalankan, jadi
                                        mengubahnya membuat modal ini gagal merender setiap
                                        desain yang tidak diunggah lewat form kami. */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={order.designFileUrl} alt="Desain yang dikirim pembeli" className="max-w-full max-h-[60vh] rounded shadow-md"/>
                                </div>
                                {/*
                                  `download` SENGAJA tanpa nama berkas. Atribut ini
                                  diabaikan browser pada tautan lintas-domain, dan
                                  `design-<id>.jpg` yang dulu dipaksakan di sini berbohong
                                  soal formatnya: berkas PNG atau PDF tersimpan dengan
                                  akhiran .jpg dan gagal dibuka di mesin admin.
                                */}
                                <a
                                    href={order.designFileUrl}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-blue-700 flex items-center justify-center gap-2"
                                >
                                    <UploadCloud size={14} />
                                    Download Desain
                                </a>
                            </>
                        ) : (
                            <p className="bg-gray-50 border rounded-lg p-6 text-center text-xs text-gray-500">
                                Pembeli belum mengunggah berkas desain.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>
  );
}