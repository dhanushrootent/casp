import { db, usersTable } from "../lib/db/src";
import { eq } from "drizzle-orm";

async function seed() {
  const demoUsers = [
    {
      id: "u1",
      username: "student1",
      name: "Alex Student",
      email: "alex@school.edu",
      password: "demo123",
      role: "student" as const,
      grade: "8",
    },
    {
      id: "u2",
      username: "teacher1",
      name: "Sarah Jenkins",
      email: "sarah.j@school.edu",
      password: "demo123",
      role: "teacher" as const,
    },
    {
      id: "u3",
      username: "admin1",
      name: "Dr. Admin",
      email: "admin@school.edu",
      password: "demo123",
      role: "admin" as const,
    },
  ];

  for (const user of demoUsers) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.username, user.username)).limit(1);
    if (existing.length === 0) {
      console.log(`Seeding user: ${user.username}`);
      await db.insert(usersTable).values({
        ...user,
        classIds: [],
      });
    } else {
      console.log(`User already exists: ${user.username}`);
    }
  }
}

seed().catch(console.error).finally(() => process.exit());
