import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, users, userRoles, roles } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/permissions";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        const roleRows = await db
          .select({ name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, user.id));
        token.roles = roleRows.map((r) => r.name ?? "").filter(Boolean);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as SessionUser).id = token.id as string;
        (session.user as SessionUser).roles = (token.roles as string[]) ?? [];
      }
      return session;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const [userRow] = await db
          .select()
          .from(users)
          .where(eq(users.email, String(credentials.email)))
          .limit(1);
        if (!userRow?.passwordHash) return null;
        const ok = await bcrypt.compare(String(credentials.password), userRow.passwordHash);
        if (!ok) return null;
        return {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name,
          image: userRow.image,
        };
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
});
