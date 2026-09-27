// src/lib/tipe-chat.ts
//
// Bentuk data percakapan yang MENYEBERANG dari server ke kotak masuk CS.
//
// Ini bukan kerapian tipe. `CS_InboxLayout` sebelumnya mengetik setiap
// propnya `any`, dan dua akibatnya nyata:
//
//  1. Tidak ada yang menuntut kolomnya dipilih. `getChatSessions` memakai
//     `include`, yang mengambil SELURUH kolom `ChatSession`; props komponen
//     client ditanam di HTML halaman, jadi setiap kolom baru pada tabel itu
//     ikut menyeberang ke browser dengan sendirinya. Pada tabel yang menyimpan
//     nama, email, dan nomor telepon tamu, "dengan sendirinya" bukan sifat yang
//     boleh dimiliki.
//  2. `session.guestName?.charAt(0)` dan `msg.sender === 'USER'` tidak pernah
//     diperiksa terhadap apa pun. Nama kolom yang salah tulis di sini lolos
//     compiler dan muncul sebagai `undefined` di layar CS — bukan sebagai galat
//     build.
//
// Tanggalnya `string`, bukan `Date`: pesan yang datang lewat socket
// (`chat-server`) membawa `createdAt` hasil `toISOString()`, sedangkan pesan
// dari database membawa objek `Date`. Keduanya berakhir di satu array `messages`
// yang sama, jadi bentuknya disamakan di batas server — bukan diserahkan ke
// pembaca untuk menebak yang mana.

export type PesanChat = {
  id: string;
  sessionId: string;
  sender: string;
  message: string;
  createdAt: string;
};

export type SesiChat = {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  status: string;
  createdAt: string;
  /** Hanya pesan TERAKHIR, untuk pratinjau di daftar. */
  messages: PesanChat[];
};

/** Sesi dengan seluruh riwayatnya, hasil membuka satu percakapan. */
export type SesiChatLengkap = Omit<SesiChat, 'messages'> & {
  messages: PesanChat[];
  /**
   * Riwayat dipotong pada batas ini dan masih ada pesan yang lebih lama.
   *
   * Dipakai kotak masuk untuk mengatakannya kepada CS. Percakapan yang
   * dipotong tanpa pemberitahuan lebih buruk daripada percakapan yang lambat:
   * CS membaca dari pesan ke-200 dan menyimpulkan itu awal pembicaraan.
   */
  adaRiwayatLebihLama: boolean;
};
