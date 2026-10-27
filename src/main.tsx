import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LibraryProvider } from "./lib/library";
import { SettingsProvider } from "./lib/settings";
import { AppActionsProvider } from "./ui/AppActions";
import { ConfirmProvider } from "./ui/Confirm";
import { ToastProvider } from "./ui/Toasts";
import "katex/dist/katex.min.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <ConfirmProvider>
          <LibraryProvider>
            <AppActionsProvider>
              <App />
            </AppActionsProvider>
          </LibraryProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
