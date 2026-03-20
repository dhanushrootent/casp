import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, classesTable } from "@workspace/db";
import { eq, and, arrayContains, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

router.get("/users", async (req: Request, res: Response) => {
  const { role, classId } = req.query;
  let query = db.select().from(usersTable);

  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, role as "student" | "teacher" | "admin"));
  if (classId) conditions.push(arrayContains(usersTable.classIds as any, [classId as string]));

  const users = conditions.length > 0
    ? await db.select().from(usersTable).where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : await query;

  const classIdsList = [...new Set(users.flatMap(u => u.classIds || []))];
  const classes = classIdsList.length > 0
    ? await db.select().from(classesTable).where(inArray(classesTable.id, classIdsList))
    : [];
  
  const classMap = Object.fromEntries(classes.map(c => [c.id, c.name]));

  return res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    grade: u.grade,
    classIds: u.classIds,
    className: u.classIds && u.classIds.length > 0 ? u.classIds.map(id => classMap[id]).filter(Boolean).join(", ") : null,
    createdAt: u.createdAt,
  })));
});

router.post("/users", async (req: Request, res: Response) => {
  const { username, name, email, password, role, grade, classIds } = req.body;

  const id = uuidv4();
  const [user] = await db.insert(usersTable).values({
    id,
    username,
    name,
    email,
    password,
    role,
    grade: grade ?? null,
    classIds: classIds ?? null,
  }).returning();

  return res.status(201).json({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    grade: user.grade,
    classIds: user.classIds,
    className: null,
    createdAt: user.createdAt,
  });
});

router.get("/users/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId as string)).limit(1);
  const user = users[0];

  if (!user) {
    return res.status(404).json({ error: "not_found", message: "User not found" });
  }

  return res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    grade: user.grade,
    classIds: user.classIds,
    className: null,
    createdAt: user.createdAt,
  });
});

router.patch("/users/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { classIds, grade } = req.body;

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId as string)).limit(1);
  const user = users[0];

  if (!user) {
    return res.status(404).json({ error: "not_found", message: "User not found" });
  }

  // Handle class changing logic for student counts
  const oldClassIds = user.classIds || [];
  const newClassIds = classIds !== undefined ? (classIds || []) : oldClassIds;

  const [updatedUser] = await db
    .update(usersTable)
    .set({
      classIds: classIds !== undefined ? classIds : user.classIds,
      grade: grade !== undefined ? grade : user.grade,
    })
    .where(eq(usersTable.id, userId as string))
    .returning();

  // If classes changed, update counts
  const addedClasses = newClassIds.filter((id: string) => !oldClassIds.includes(id));
  const removedClasses = oldClassIds.filter((id: string) => !newClassIds.includes(id));

  const updatePromises = [];
  for (const cid of [...addedClasses, ...removedClasses]) {
    updatePromises.push((async () => {
      const classUsers = await db.select().from(usersTable).where(and(arrayContains(usersTable.classIds, [cid]), eq(usersTable.role, 'student')));
      await db.update(classesTable).set({ studentCount: classUsers.length }).where(eq(classesTable.id, cid));
    })());
  }
  await Promise.all(updatePromises);

  return res.json({
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    grade: updatedUser.grade,
    classIds: updatedUser.classIds,
    className: null,
    createdAt: updatedUser.createdAt,
  });
});

router.get("/classes", async (_req: Request, res: Response) => {
  const classes = await db.select().from(classesTable);
  const teachers = await db.select().from(usersTable).where(eq(usersTable.role, "teacher"));
  const teacherMap = Object.fromEntries(teachers.map(t => [t.id, t.name]));

  return res.json(classes.map(c => ({
    id: c.id,
    name: c.name,
    grade: c.grade,
    section: c.section,
    teacherId: c.teacherId,
    teacherName: teacherMap[c.teacherId] ?? "Unknown",
    studentCount: c.studentCount,
    createdAt: c.createdAt,
  })));
});

router.post("/classes", async (req: Request, res: Response) => {
  const { name, grade, section, teacherId } = req.body;
  const id = uuidv4();
  const [cls] = await db.insert(classesTable).values({ id, name, grade, section: section || null, teacherId, studentCount: 0 }).returning();
  const teacher = await db.select().from(usersTable).where(eq(usersTable.id, teacherId)).limit(1);

  return res.status(201).json({
    id: cls.id,
    name: cls.name,
    grade: cls.grade,
    section: cls.section,
    teacherId: cls.teacherId,
    teacherName: teacher[0]?.name ?? "Unknown",
    studentCount: cls.studentCount,
    createdAt: cls.createdAt,
  });
});

export default router;
