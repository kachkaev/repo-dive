import "./styles.css";

import { BrowserHost } from "@effect/ui/html";
import { Effect, Layer } from "effect";

import { App } from "./app.ts";

const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

Layer.launch(BrowserHost.mount(App, {}, rootElement)).pipe(Effect.runFork);
