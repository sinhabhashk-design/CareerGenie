import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerRouter from "./career";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(careerRouter);

export default router;
