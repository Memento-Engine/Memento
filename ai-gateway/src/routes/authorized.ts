import express, { Response } from 'express';
import { validateUserRequest } from 'src/middlewares/auth.ts';
import { RequestContext } from 'src/types/request-context.ts';


const authorizedRouter = express.Router();

authorizedRouter.post("/v1/chat", validateUserRequest, (req : RequestContext, res: Response) => {
    res.status(200).json({ message: "Authorized access to chat endpoint" });
});

export default authorizedRouter;