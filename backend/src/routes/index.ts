import { Router } from "express";
import authRoutes from "./auth.routes";
import leadRoutes from "./lead.routes";
import dashboardRoutes from "./dashboard.routes";
import adminRoutes from "./admin.routes";
import healthRoutes from "./health.routes";
import aiRoutes from "./ai.routes";
import transcriptionRoutes from "./transcription.routes";

const apiRouter = Router();

apiRouter.use("/", healthRoutes);
apiRouter.use("/auth", authRoutes);
apiRouter.use("/leads", leadRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/admin", adminRoutes);
apiRouter.use("/ai", aiRoutes);
apiRouter.use("/transcription", transcriptionRoutes);

export default apiRouter;
