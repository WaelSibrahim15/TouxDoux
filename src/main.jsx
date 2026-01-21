import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Apply theme before rendering to avoid flash
const savedTheme = localStorage.getItem("touxdoux_theme_v1") || "cinnamon";
document.documentElement.setAttribute("data-theme", savedTheme);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
