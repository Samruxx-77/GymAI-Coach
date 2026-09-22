import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        {/* AuthProvider lives in App.tsx — a second one here used to mount
            duplicate auth subscriptions and double-fetch the session. */}
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
