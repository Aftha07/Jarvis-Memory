import { Router, type IRouter } from "express";
import healthRouter from "./health";
import memoriesRouter from "./memories";
import assistantRouter from "./assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(memoriesRouter);
router.use(assistantRouter);

export default router;
