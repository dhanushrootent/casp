import { db, usersTable, classesTable } from "@workspace/db";
import { and, arrayContains, eq } from "drizzle-orm";

type DemoUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  password: string;
  role: "student" | "teacher" | "admin";
  grade: string | null;
  classIds: string[]; // always store an array (empty for non-students)
};

const demoUsers: DemoUser[] = [
  {
    id: "u1",
    username: "student1",
    name: "Alex Student",
    email: "alex@school.edu",
    password: "demo123",
    role: "student",
    grade: "8",
    classIds: ["c1"],
  },
  {
    id: "u2",
    username: "teacher1",
    name: "Sarah Jenkins",
    email: "sarah.j@school.edu",
    password: "demo123",
    role: "teacher",
    grade: null,
    classIds: [],
  },
  {
    id: "u3",
    username: "admin1",
    name: "Dr. Admin",
    email: "admin@school.edu",
    password: "demo123",
    role: "admin",
    grade: null,
    classIds: [],
  },
];

const demoClasses = [
  {
    id: "c1",
    name: "Math 8A",
    grade: "8",
    section: null as string | null,
  },
] as const;

async function upsertDemoUser(user: DemoUser) {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, user.username))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(usersTable).values(user);
    console.log(`✓ Seeded user: ${user.username}`);
    return;
  }

  const current = existing[0];

  const emailOk = current.email === user.email;
  if (!emailOk) {
    console.warn(
      `! User "${user.username}" exists but email differs; not updating email (${current.email} -> ${user.email}).`,
    );
  }

  // Keep username/email stable (avoid unique constraint issues), but bring the rest in sync.
  await db
    .update(usersTable)
    .set({
      // id is a primary key; we do not change it.
      name: user.name,
      password: user.password,
      role: user.role,
      grade: user.grade,
      classIds: user.classIds,
      ...(emailOk ? { email: user.email } : {}),
    })
    .where(eq(usersTable.username, user.username));

  console.log(`  Updated user: ${user.username}`);
}

async function seedDemoClasses() {
  // Seed/ensure classes exist.
  // We link teachers by username -> actual stored id (so this still works if users were created previously).
  const teacher = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, "teacher1"))
    .limit(1);

  if (!teacher[0]) {
    throw new Error("teacher1 user must exist before seeding classes");
  }

  for (const cls of demoClasses) {
    const existing = await db
      .select()
      .from(classesTable)
      .where(eq(classesTable.id, cls.id))
      .limit(1);

    const teacherId = teacher[0].id;
    if (existing.length === 0) {
      await db.insert(classesTable).values({
        id: cls.id,
        name: cls.name,
        grade: cls.grade,
        section: cls.section,
        teacherId,
        studentCount: 0, // will be recalculated below
      });
      console.log(`✓ Seeded class: ${cls.id}`);
    } else {
      await db
        .update(classesTable)
        .set({
          name: cls.name,
          grade: cls.grade,
          section: cls.section,
          teacherId,
        })
        .where(eq(classesTable.id, cls.id));
      console.log(`  Updated class: ${cls.id}`);
    }

    // Recalculate studentCount based on current users.classIds.
    const students = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "student"),
          arrayContains(usersTable.classIds as any, [cls.id]),
        ),
      );

    await db
      .update(classesTable)
      .set({ studentCount: students.length })
      .where(eq(classesTable.id, cls.id));
  }
}

async function seed() {
  for (const user of demoUsers) {
    await upsertDemoUser(user);
  }

  await seedDemoClasses();
  console.log("Done!");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
