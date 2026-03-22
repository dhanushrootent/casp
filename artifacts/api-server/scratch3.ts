import { ai } from "@workspace/integrations-gemini-ai";

async function run() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash", // Reverting to gemini-2.0-flash which I deployed!
      contents: "Hello",
    });
    console.log("SUCCESS:", res.text?.substring(0, 10));
  } catch (e: any) {
    console.error("ERROR 2.0:", e?.message);
  }
}
run();
