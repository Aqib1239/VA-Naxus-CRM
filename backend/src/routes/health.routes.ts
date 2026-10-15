import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { ApiResponse } from "../utils/response";
import { env } from "../config/env";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: "VibhAnu CRM API is running",
  });
});

export default router;
