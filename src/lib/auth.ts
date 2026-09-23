// src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google"; // 1. Import Google
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { Role, sahRole } from "@/lib/enum-guard";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Email dan Password wajib diisi");
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });
        if (!user || !user.password) {
           throw new Error("Email tidak terdaftar atau password salah");
        }
        const isPasswordValid = await compare(credentials.password, user.password);
        if (!isPasswordValid) {
            throw new Error("Password salah");
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
    
    async jwt({ token, user, account, profile }) {
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