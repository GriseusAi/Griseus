import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/palantir-atoms-schema";  // FAZ 0: register Palantir-level operational atoms

createRoot(document.getElementById("root")!).render(<App />);
