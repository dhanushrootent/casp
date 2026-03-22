import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config({ path: "artifacts/api-server/.env" });

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
});

async function run() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello",
    });
    console.log("SUCCESS:", res.text);
  } catch (e: any) {
    console.error("ERROR 2.0:", e?.message);
  }
}
run();
