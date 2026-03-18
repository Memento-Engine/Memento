import express from "express";
import registerDevice from "@/controllers/registerDevice.ts";

const unAuthorizedRouter = express.Router();

unAuthorizedRouter.post("/v1/registerDevice", registerDevice);

export default unAuthorizedRouter;
