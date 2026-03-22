import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY! });
async function run() {
  try {
    const res = await ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent("Hello");
    console.log("SUCCESS 1.5:", res.response.text().substring(0, 10));
  } catch (e: any) {
    console.error("ERROR 1.5:", e?.message);
  }
}
run();
