import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AssistantProvider } from "./ai/assistant";
import { AiConfigProvider } from "./ai/config";
import { LibraryProvider } from "./lib/library";
import { ProgressProvider } from "./lib/progress";
import { NotesProvider } from "./rag/notes";
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
            <AiConfigProvider>
              <NotesProvider>
                <ProgressProvider>
                  <AssistantProvider>
                    <AppActionsProvider>
                      <App />
                    </AppActionsProvider>
                  </AssistantProvider>
                </ProgressProvider>
              </NotesProvider>
            </AiConfigProvider>
          </LibraryProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
