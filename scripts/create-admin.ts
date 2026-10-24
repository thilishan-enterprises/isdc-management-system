import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Set ADMIN_USERNAME and ADMIN_PASSWORD before running this script.",
    );
  }

  if (password.length < 12) {
    throw new Error("Use an admin password of at least 12 characters.");
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new Error(
        `The username "${username}" already exists. No changes were made.`,
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: "ADMIN",
      },
    });

    console.log(`Administrator "${username}" created successfully.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Admin setup failed:", error.message);
  process.exitCode = 1;
});
