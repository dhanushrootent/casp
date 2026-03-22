import * as dotenv from "dotenv";
dotenv.config({ path: "artifacts/api-server/.env" });
console.log("KEY IS:", process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
