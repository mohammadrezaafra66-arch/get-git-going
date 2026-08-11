import { Generator, getConfig } from "@tanstack/router-generator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = await getConfig({
  routesDirectory: "./src/routes",
  generatedRouteTree: "./src/routeTree.gen.ts",
  routeFileIgnorePrefix: "-",
  quoteStyle: "single",
});

const generator = new Generator({ config, root });
await generator.run();
console.log("routeTree regenerated");
