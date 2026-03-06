import express, { Request, Response } from "express";
import cors from "cors";

import { graph } from "../src/agent";

const app = express();

app.use(cors());
app.use(express.json());

const router = express.Router();

interface AgentRequest {
  goal: string;
}

interface AgentResponse {
  result: unknown;
}

router.post(
  "/agent",
  async (req: Request<{}, AgentResponse, AgentRequest>, res: Response) => {
    try {
      const { goal } = req.body;

      if (!goal) {
        return res.status(400).json({
          result: "Goal is required",
        });
      }

      const result = await graph.invoke({
        goal,
      });

      return res.status(200).json({ result });
    } catch (error) {
      console.error("Agent error:", error);

      return res.status(500).json({
        result: "Agent execution failed",
      });
    }
  },
);

router.get("/healthz", async (req: Request, res: Response) => {
  try {
    return res.status(200).json({ data: true });
  } catch (error) {
    console.error("health Status error:", error);
    return res.status(500).json({
      result: "Health status execution failed",
    });
  }
});

const PORT = 4173;

app.use("/api/v1", router);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Agent server running on http://127.0.0.1:${PORT}/api/v1`);
});
