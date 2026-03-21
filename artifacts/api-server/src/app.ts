import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "https://casp-tu0m.onrender.com",
        ],
    }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);
export default app;
