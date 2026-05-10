import React from "react";
import ReactDOM from "react-dom/client";
import { GlobalStyle } from "@/styles";
import { AppRouter } from "@/app/router";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <GlobalStyle />
    <AppRouter />
  </React.StrictMode>,
);
