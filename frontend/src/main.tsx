import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// A deploy replaces hashed chunks; if a stale page asks for a missing one, reload once to pick up the new build.
window.addEventListener("vite:preloadError", (event) => {
  const k = "rankcrew-chunk-reload";
  if (sessionStorage.getItem(k)) return;
  sessionStorage.setItem(k, "1");
  event.preventDefault();
  window.location.reload();
});
window.addEventListener("load", () => setTimeout(() => sessionStorage.removeItem("rankcrew-chunk-reload"), 5000));

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
