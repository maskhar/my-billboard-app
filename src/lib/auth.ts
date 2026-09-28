// src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google"; // 1. Import Google
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { Role, sahRole } from "@/lib/enum-guard";
import { rateLimit } from "@/lib/rate-limit";
import { asalDariRecord } from "@/lib/asal-permintaan";

// PINTU LOGIN DULU TIDAK DIBATASI SAMA SEKALI.
//
// Enam route API di repo ini memakai `rateLimit`, tapi jalur yang paling jelas
// menjadi sasaran justru tidak: `authorize` di bawah menerima percobaan
// email/password sebanyak apa pun. Satu skrip bisa menebak password satu akun
// tanpa pernah tertahan, dan setiap percobaan menghabiskan ~230 ms CPU di
// `compare` — jadi percobaan yang sama sekaligus menjadi cara menghabiskan
// proses Node tanpa perlu menebak dengan benar.
//
// DUA KUNCI, DUA SERANGAN YANG BERBEDA:
//
//   - Per akun menahan penebakan password satu akun (brute force).
//   - Per alamat asal menahan satu penyerang yang menyebar percobaan ke banyak
//     akun (credential stuffing), yang tidak tersentuh batas per akun.
//
// Batas per akun sengaja dihitung untuk SEMUA percobaan, bukan hanya yang
// gagal: penghitung yang hanya naik saat gagal tidak menahan biaya CPU-nya, dan
// penghitung yang naik sebelum akun dicari memastikan pesan "terlalu banyak
// percobaan" tidak ikut memberitahu apakah akunnya ada.
//
// Angkanya jauh di atas pemakaian manusia — seseorang yang lupa passwordnya
// mencoba tiga sampai lima kali, bukan sepuluh.
const BATAS_LOGIN_PER_AKUN = 10;
const BATAS_LOGIN_PER_ASAL = 30;
const JENDELA_LOGIN_MS = 15 * 60 * 1000;

// Hash bcrypt atas teks acak yang sudah dibuang dan tidak pernah dicatat.
//
// Dipakai HANYA sebagai beban banding saat akunnya tidak ada, supaya jawaban
// "email tidak terdaftar" memakan waktu yang sama dengan "password salah".
// Tanpa ini, selisihnya 230 ms lawan ~0 ms: siapa pun bisa memisahkan alamat
// yang terdaftar dari yang tidak hanya dengan mengukur waktu jawaban, walaupun
// pesan galatnya sudah diseragamkan. Nilai ini tidak pernah membuka akun mana
// pun — tidak ada baris User yang memuatnya.
const HASH_UMPAN = '$2b$12$.hH6QMG4u2PeN86qE0yBBuh1Hufpvu2Rj4nX7Gq/h1VJNGkWPx0zi';

// Satu pesan untuk "email tidak terdaftar" DAN "password salah".
//
// Sebelumnya keduanya dibedakan ("Email tidak terdaftar atau password salah"
// lawan "Password salah"). Kedua halaman login sudah meringkasnya menjadi satu
// kalimat di browser, tapi `POST /api/auth/callback/credentials` bisa dipanggil
// langsung dan membalas pesan aslinya — sehingga siapa pun bisa menguji satu
// daftar alamat email dan tahu mana yang punya akun di sini. Itu data yang
// berguna untuk penipuan bertarget, terpisah dari passwordnya.
const PESAN_KREDENSIAL_SALAH = 'Email atau password salah';

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // Sebelumnya tidak diset: sesi tidak pernah kedaluwarsa, sehingga token
    // yang bocor berlaku selamanya. 7 hari, disegarkan tiap 24 jam.
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: '/login',
  },

  providers: [
    // 2. PROVIDER GOOGLE BARU
    GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),

    // PROVIDER LAMA (Manual Email/Pass)
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Email dan Password wajib diisi");
        }

        // Dinormalkan sebelum dijadikan kunci pembatas, sama seperti
        // `api/register` menormalkannya sebelum menyimpan. Tanpa ini
        // `Budi@X.test` dan `budi@x.test` memakai dua penghitung terpisah untuk
        // satu akun yang sama, dan batasnya tinggal dilipatgandakan dengan
        // mengubah besar-kecil huruf.
        const email = credentials.email.trim().toLowerCase();

        const asal = asalDariRecord(req?.headers as Record<string, string> | undefined);
        if (asal) {
          const batasAsal = rateLimit({
            key: `login-asal:${asal}`,
            limit: BATAS_LOGIN_PER_ASAL,
            windowMs: JENDELA_LOGIN_MS,
          });
          if (!batasAsal.success) {
            throw new Error(
              `Terlalu banyak percobaan login. Coba lagi dalam ${batasAsal.retryAfterSeconds} detik.`
            );
          }
        }

        // Dihitung SEBELUM akun dicari: pesan penolakannya karena itu tidak
        // memberitahu apakah alamat ini punya akun, dan beban `compare` ikut
        // tertahan.
        const batasAkun = rateLimit({
          key: `login-akun:${email}`,
          limit: BATAS_LOGIN_PER_AKUN,
          windowMs: JENDELA_LOGIN_MS,
        });
        if (!batasAkun.success) {
          throw new Error(
            `Terlalu banyak percobaan login. Coba lagi dalam ${batasAkun.retryAfterSeconds} detik.`
          );
        }

        const user = await prisma.user.findUnique({
          where: { email },
          // Kolom diambil satu per satu. `findUnique` tanpa `select` membawa
          // seluruh baris — termasuk `ktp`, `npwp`, dan `xenditCustomerId` —
          // ke memori pada setiap percobaan login, juga yang gagal.
          select: { id: true, email: true, name: true, role: true, password: true },
        });

        // Akun yang ada tanpa password (mendaftar lewat Google) diperlakukan
        // sama dengan akun yang tidak ada: sama-sama tidak bisa dibuka dengan
        // password, dan membedakannya akan memberitahu cara seseorang mendaftar.
        const hashDibanding = user?.password ?? HASH_UMPAN;

        // `compare` SELALU dijalankan, juga saat akunnya tidak ada. Hasilnya
        // dibuang pada jalur itu; yang dibutuhkan hanyalah waktunya.
        const passwordCocok = await compare(credentials.password, hashDibanding);

        if (!user || !user.password || !passwordCocok) {
          throw new Error(PESAN_KREDENSIAL_SALAH);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role, 
        };
      }
    })
  ],
  
  callbacks: {
    // Registrasi otomatis saat login Google.
    //
    // Dua pemeriksaan keamanan ditambahkan di sini:
    //
    // 1. `email_verified` wajib true. Tanpa ini, penyedia identitas yang
    //    mengembalikan alamat email tak terverifikasi bisa dipakai untuk
    //    mengklaim alamat milik orang lain.
    //
    // 2. Penautan otomatis ke akun email/password yang sudah ada DITOLAK.
    //    Sebelumnya, akun yang sudah ada langsung diloloskan apa pun cara
    //    daftarnya. Artinya siapa pun yang menguasai alamat email seseorang
    //    di sisi Google bisa masuk ke akun email/password milik orang itu
    //    tanpa pernah tahu passwordnya. Penautan akun harus dilakukan secara
    //    sadar oleh pemilik akun setelah login, bukan diam-diam saat login.
    async signIn({ user, account, profile }) {
        if (account?.provider !== 'google') {
            return true;
        }

        const googleProfile = profile as { email_verified?: boolean } | undefined;
        if (!googleProfile?.email_verified) {
            return '/login?error=EmailNotVerified';
        }

        if (!user.email) {
            return '/login?error=NoEmail';
        }

        try {
            const existingUser = await prisma.user.findUnique({
                where: { email: user.email },
                select: { id: true, authProvider: true },
            });

            if (existingUser) {
                // Hanya loloskan bila akun itu memang akun Google.
                if (existingUser.authProvider !== 'GOOGLE') {
                    return '/login?error=AccountExists';
                }
                return true;
            }

            await prisma.user.create({
                data: {
                    name: user.name,
                    email: user.email,
                    role: 'USER',
                    password: null, // login Google tidak memakai password
                    image: user.image,
                    authProvider: 'GOOGLE',
                    isVerified: true,
                },
            });

            return true;
        } catch (error) {
            console.error('Gagal membuat user dari Google:', error);
            return false;
        }
    },

        async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        // Role di sesi kini bertipe enum, bukan teks bebas. Token JWT yang
        // sudah beredar di browser bisa membawa role tulisan lama yang tidak
        // ada lagi di daftar; dipaksa lewat `as string` nilai itu akan lolos
        // ke seluruh pemeriksaan izin. Yang tidak dikenali diturunkan ke USER.
        session.user.role = sahRole(token.role) ? token.role : Role.USER;
        session.user.image = token.picture; 
      }
      return session;
    },
    
    // `account` dan `profile` dibuang dari daftar parameter: keduanya tidak
    // dibaca, dan seluruh isi token diambil ulang dari database lewat `user.email`
    // di bawah. Menuliskannya memberi kesan callback ini membedakan provider
    // (Google vs kredensial) padahal tidak — dan penulis berikutnya yang percaya
    // itu akan menambahkan cabang berdasarkan `account.provider` yang selalu
    // `undefined` pada pemanggilan refresh token.
    async jwt({ token, user }) {
      if (user) {
        // Ambil data lengkap dari DB saat login
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.picture = dbUser.image || user.image;
        }
      }
      return token;
    }
  }
};