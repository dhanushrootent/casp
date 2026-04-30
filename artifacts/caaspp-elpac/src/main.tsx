import { configureApiClient } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import { API_BASE_URL } from "./config/api";
import App from "./App";
import "./index.css";
import "./portal-theme.css";

configureApiClient({ baseUrl: API_BASE_URL });

createRoot(document.getElementById("root")!).render(<App />);
