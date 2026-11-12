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
    // LOGIKA LOGIN GOOGLE: hanya akun USER yang boleh masuk lewat Google.
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') {
        return true;
      }

      const googleProfile = (profile ?? {}) as {
        email?: string | null;
        email_verified?: boolean | null;
        name?: string | null;
        picture?: string | null;
      };

      // Email dipakai apa adanya dari Google (tidak diubah kapitalisasinya).
      const email = googleProfile.email ?? user.email ?? null;
      const googleName = user.name ?? googleProfile.name ?? null;
      const googleImage = user.image ?? googleProfile.picture ?? null;

      // Tolak email kosong atau email Google yang belum terverifikasi.
      if (!email || googleProfile.email_verified !== true) {
        return false;
      }

      const fillMissingProfileFields = async (existingUser: {
        id: string;
        name: string | null;
        image: string | null;
      }) => {
        const data: { name?: string; image?: string } = {};
        if (!existingUser.name && googleName) data.name = googleName;
        if (!existingUser.image && googleImage) data.image = googleImage;

        if (Object.keys(data).length > 0) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data,
          });
        }
      };

      const authorizeExistingUser = async (existingUser: {
        id: string;
        role: string;
        name: string | null;
        image: string | null;
      }) => {
        // Staf/admin wajib login lewat /admin/login.
        if (existingUser.role !== 'USER') {
          return false;
        }

        // Role, authProvider, isVerified, dan password TIDAK diubah.
        await fillMissingProfileFields(existingUser);
        return true;
      };

      try {
        const existingUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, name: true, image: true },
        });

        if (existingUser) {
          return await authorizeExistingUser(existingUser);
        }

        try {
          await prisma.user.create({
            data: {
              name: googleName,
              email,
              role: 'USER',
              password: null,
              image: googleImage,
              authProvider: 'GOOGLE',
              isVerified: true,
            },
          });
        } catch (error) {
          // P2002 = unique constraint (race dua login paralel dengan email sama).
          if ((error as { code?: string }).code === 'P2002') {
            const racedUser = await prisma.user.findUnique({
              where: { email },
              select: { id: true, role: true, name: true, image: true },
            });

            if (!racedUser) {
              return false;
            }

            return await authorizeExistingUser(racedUser);
          }

          throw error;
        }

        return true;
      } catch (error) {
        console.error('Error pada login Google:', error);
        return false;
      }
    },

        async session({ session, token }) {
      if (token && session.user) {
        const sessionUser = session.user as typeof session.user & {
          id?: string;
          role?: string;
        };
        sessionUser.id = token.id as string;
        sessionUser.role = token.role as string;
        session.user.image = token.picture;
      }
      return session;
    },
    
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update' && session) {
        const updatedUser =
          (session as { user?: { name?: string; image?: string } }).user ?? {};
        if (updatedUser.name) token.name = updatedUser.name;
        if (updatedUser.image) token.picture = updatedUser.image;
        return token;
      }

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