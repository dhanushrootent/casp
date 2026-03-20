import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, classesTable } from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.post("/auth/login", async (req: Request, res: Response) => {
  console.log("Login request received");
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "bad_request", message: "Username and password required" });
  }

  // Allow login with either username or email
  const users = await db.select().from(usersTable)
    .where(or(eq(usersTable.username, username), eq(usersTable.email, username)))
    .limit(1);
  const user = users[0];

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
  }

  let className: string | null = null;
  if (user.classIds && user.classIds.length > 0) {
    const classes = await db.select().from(classesTable).where(inArray(classesTable.id, user.classIds));
    className = classes.map(c => c.name).join(", ");
  }

  const token = Buffer.from(`${user.id}:${user.role}`).toString("base64");
  return res.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      grade: user.grade,
      classIds: user.classIds,
      className,
      createdAt: user.createdAt,
    },
    token,
  });
});

router.post("/auth/logout", (_req: Request, res: Response) => {
  return res.json({ success: true, message: "Logged out" });
});

router.get("/auth/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
  }

  const token = authHeader.replace("Bearer ", "");
  const decoded = Buffer.from(token, "base64").toString("utf-8");
  const userId = decoded.split(":")[0];

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];

  if (!user) {
    return res.status(401).json({ error: "unauthorized", message: "User not found" });
  }

  let className: string | null = null;
  if (user.classIds && user.classIds.length > 0) {
    const classes = await db.select().from(classesTable).where(inArray(classesTable.id, user.classIds));
    className = classes.map(c => c.name).join(", ");
  }

  return res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    grade: user.grade,
    classIds: user.classIds,
    className,
    createdAt: user.createdAt,
  });
});

export default router;
