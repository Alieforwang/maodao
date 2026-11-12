import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-500.css";
import "@fontsource/noto-sans-sc/chinese-simplified-600.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import "./app.css";
import { App } from "./App";
import { ToastApp } from "./Toast";
import { TrayApp } from "./Tray";

const root = document.getElementById("root");
if (!root) throw new Error("缺少根节点");
const hash = window.location.hash;
document.documentElement.dataset.window = hash.startsWith("#/toast") ? "toast" : hash.startsWith("#/tray") ? "tray" : "main";
if (hash.startsWith("#/toast")) createRoot(root).render(<ToastApp />);
else if (hash.startsWith("#/tray")) createRoot(root).render(<TrayApp />);
else createRoot(root).render(<App />);
