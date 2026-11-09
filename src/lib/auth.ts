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