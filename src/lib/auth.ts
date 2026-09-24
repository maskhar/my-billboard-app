// src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google"; // 1. Import Google
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs"; 

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
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
    // 3. LOGIKA OTOMATIS REGISTER JIKA LOGIN GOOGLE
    async signIn({ user, account, profile }) {
        if (account?.provider === 'google') {
            try {
                // Cek apakah user sudah ada di database?
                const existingUser = await prisma.user.findUnique({
                    where: { email: user.email! }
                });

                                if (existingUser) {
                    // Jika user sudah ada, cukup return true
                    return true;
                } else {
                    // Kalau belum ada, buatkan akun baru otomatis
                    await prisma.user.create({
                        data: {
                            name: user.name,
                            email: user.email!,
                            role: 'USER', // Default User
                            password: '', // Tidak butuh password karena login google
                            image: user.image,
                            authProvider: "GOOGLE",
                            isVerified: true // Langsung verified
                        }
                    });
                }
                return true; // Izinkan masuk
            } catch (error) {
                console.error("Error creating user from Google:", error);
                return false;
            }
        }
        return true;
    },

        async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.image = token.picture; 
      }
      return session;
    },
    
    async jwt({ token, user, account, profile, trigger, session }) {
      if (trigger === 'update' && session) {
        const updatedUser = (session as any).user ?? {};
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