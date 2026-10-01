import { Effect, Layer } from "effect";
import { Command, Flag } from "effect/cli";

import { buildMcpLayer } from "./mcp-command/build-mcp-layer.ts";

export const mcpCommand = Command.make("mcp", {
  repoPath: Flag.String("repo").pipe(
    Flag.withDefault("."),
    Flag.withDescription(
      "Path to the git repository whose metrics cube to expose (defaults to the current directory)",
    ),
  ),
}).pipe(
  Command.withDescription(
    "Serve the metrics cube over the Model Context Protocol (stdio) so AI agents can query it",
  ),
  Command.withHandler((config) =>
    Effect.gen(function* () {
      const layer = yield* buildMcpLayer(config.repoPath);
      yield* Layer.launch(layer);
    }),
  ),
);
