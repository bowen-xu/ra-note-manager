import {defineConfig, type Plugin} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";

const sdk = "@research-assistant/workbench-sdk";
const sharedPath = (id: string): string | undefined => {
  if (id === sdk) return "/sdk/v1/index.js";
  if (id.startsWith(sdk + "/")) return "/sdk/v1/" + id.slice(sdk.length + 1) + ".js";
  if (id === "@research-assistant/core/notes") return "/sdk/v1/core-notes.js";
  if (id === "@research-assistant/data/notes") return "/sdk/v1/data-notes.js";
  if (id === "react") return "/sdk/v1/react.js";
  if (id.startsWith("react/")) return "/sdk/v1/react-" + id.slice(6) + ".js";
  if (id === "react-dom") return "/sdk/v1/react-dom.js";
  if (id.startsWith("react-dom/")) return "/sdk/v1/react-dom-" + id.slice(10) + ".js";
};

function independentClosure(): Plugin {
  return {
    name: "note-manager-independent-closure",
    generateBundle() {
      const modules = [...this.getModuleIds()].filter(id => !id.startsWith("\0")).sort();
      const forbidden = modules.filter(id => /\/apps\/(?:web|desktop)\/|\/src\/(?:core|app)\/|\/node_modules\/(?:\.pnpm\/)?(?:react(?:@|\/)|react-dom(?:@|\/))|\/node_modules\/@research-assistant\/(?:core|data|workbench-sdk)\//u.test(id));
      if (forbidden.length) this.error("plugin_build_closure_violation:\n" + forbidden.join("\n"));
      this.emitFile({type: "asset", fileName: "source-closure.json", source: JSON.stringify({
        modules,
        sharedImports: modules.filter(id => sharedPath(id) !== undefined),
      }, null, 2)});
    },
  };
}

export default defineConfig({
  plugins: [react(), independentClosure()],
  build: {
    outDir: "build",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "entry.js",
      cssFileName: "style",
    },
    rolldownOptions: {
      external: id => sharedPath(id) !== undefined,
      output: {paths: id => sharedPath(id) ?? id},
    },
  },
});
