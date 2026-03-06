import { RunnableConfig } from "@langchain/core/runnables";
import { plannerPrompt } from "../prompts/plannerPrompt";
import { AgentState, AgentStateType } from "../agentState";
import { config } from "dotenv";
import { PlannerStep } from "../planner/planner.schema";
import { llm } from "../planner/planner.node";

const frames = [
//   {
//     id: 1,
//     captured_at: "2026-03-06T09:10:21Z",
//     app_name: "Google Chrome",
//     window_title: "ChatGPT - OpenAI",
//     is_focused: true,
//     browser_url: "https://chat.openai.com",
//     window_x: 120,
//     window_y: 80,
//     window_width: 1280,
//     window_height: 720,
//     monitor_height: 1080,
//     monitor_width: 1920,
//     image_path: "/frames/frame_1.png",
//   },
//   {
//     id: 2,
//     captured_at: "2026-03-06T09:10:26Z",
//     app_name: "Visual Studio Code",
//     window_title: "plannerNode.ts - project",
//     is_focused: false,
//     browser_url: null,
//     window_x: 200,
//     window_y: 100,
//     window_width: 1200,
//     window_height: 800,
//     monitor_height: 1080,
//     monitor_width: 1920,
//     image_path: "/frames/frame_2.png",
//   },
  {
    id: 3,
    captured_at: "2026-03-06T09:10:31Z",
    app_name: "Google Chrome",
    window_title: "LangGraph Docs",
    is_focused: true,
    browser_url: "https://langchain-ai.github.io/langgraph/",
    window_x: 0,
    window_y: 0,
    window_width: 1366,
    window_height: 768,
    monitor_height: 1080,
    monitor_width: 1920,
    image_path: "/frames/frame_3.png",
  },
//   {
//     id: 4,
//     captured_at: "2026-03-06T09:10:36Z",
//     app_name: "Slack",
//     window_title: "Team Chat - Project Updates",
//     is_focused: false,
//     browser_url: null,
//     window_x: 300,
//     window_y: 120,
//     window_width: 1100,
//     window_height: 700,
//     monitor_height: 1080,
//     monitor_width: 1920,
//     image_path: "/frames/frame_4.png",
//   },
//   {
//     id: 5,
//     captured_at: "2026-03-06T09:10:41Z",
//     app_name: "Google Chrome",
//     window_title: "GitHub - Issue #759",
//     is_focused: true,
//     browser_url: "https://github.com/example/repo/issues/759",
//     window_x: 50,
//     window_y: 60,
//     window_width: 1400,
//     window_height: 820,
//     monitor_height: 1080,
//     monitor_width: 1920,
//     image_path: "/frames/frame_5.png",
//   },
];
export async function executorNode(state: AgentStateType): Promise<void> {
  const { plan } = state;
  if (!plan?.steps) {
    throw new Error("Plan step was not good");
  }

  const stepOutputs: Record<string, any> = {};

  for (const step of plan.steps) {
    if (step.kind !== "search") continue;

    console.log("Executing", step.id);

    // 1️⃣ Run DB query (mock for now)
    const dbResults = frames;

    // 2️⃣ Ask LLM to interpret results
    const output = await interpretStepOutput(step, dbResults);

    stepOutputs[step.id] = output;
    break;
  }

  //   return {
  //     ...state,
  //     stepOutputs
  //   };
}

async function interpretStepOutput(step: PlannerStep, dbResults: any[]) {
  const prompt = `
You are executing an agent step.

Step:
${JSON.stringify(step, null, 2)}

Database results:
${JSON.stringify(dbResults, null, 2)}

Expected output type:
${step.expectedOutput.type}

Return ONLY the result that satisfies the step.

Rules:
- If type = value → return a single primitive value
- If type = table → return relevant rows
- If type = list → return an array
- If type = object → return structured object

Return JSON only.
`;

  const response = await llm.invoke(prompt);

  console.log(JSON.stringify(response.content, null, 2));

}
