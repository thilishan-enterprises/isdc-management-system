import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Username and Password",

      credentials: {
        username: {
          label: "Username",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;

        if (
          typeof username !== "string" ||
          typeof password !== "string" ||
          !username.trim() ||
          !password
        ) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            username: username.trim(),
          },
          include: {
            employee: true,
          },
        });

        if (!user || !user.isActive) {
          return null;
        }

        if (user.employee && !user.employee.isActive) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(
          password,
          user.passwordHash,
        );

        if (!passwordMatches) {
          return null;
        }

        return {
          id: user.id,
          name: user.username,
          username: user.username,
          role: user.role,
          employeeId: user.employeeId,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.employeeId = user.employeeId;
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = String(token.id ?? token.sub ?? "");
      session.user.username = String(token.username ?? session.user.name ?? "");

      const role = token.role;
      session.user.role = role === "ADMIN" || role === "STAFF" ? role : "STAFF";

      const employeeId = token.employeeId;
      session.user.employeeId =
        typeof employeeId === "string" ? employeeId : null;

      return session;
    },
  },
});
