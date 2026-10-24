import type { DefaultSession } from "next-auth";

type AppRole = "ADMIN" | "STAFF";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: AppRole;
      employeeId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    username: string;
    role: AppRole;
    employeeId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: AppRole;
    employeeId?: string | null;
  }
}
