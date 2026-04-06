import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import assessmentsRouter from "./assessments";
import resultsRouter from "./results";
import syllabusRouter from "./syllabus";
import analyticsRouter from "./analytics";
import writingRouter from "./writing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(assessmentsRouter);
router.use(resultsRouter);
router.use(syllabusRouter);
router.use(writingRouter);
router.use(analyticsRouter);

export default router;
