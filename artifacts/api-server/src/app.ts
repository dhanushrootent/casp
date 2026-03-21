import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://casp-tu0m.onrender.com",
    ],
    // GET /api/auth/me sends Authorization → browser preflight must allow it
    allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);
export default app;
