import {createRoot} from "react-dom/client";
import {decodePluginManifest, WORKBENCH_UI_RUNTIME} from "@research-assistant/workbench-sdk";
import {resolveBuiltinPlugins} from "@research-assistant/workbench-sdk/composition";
import {PreviewWorkbench} from "@research-assistant/workbench-preview/preview-workbench";
import {coreCapabilities} from "@research-assistant/workbench-preview/core-capabilities";
import {selectAppRuntime} from "@research-assistant/workbench-preview/app-runtime";
import {AppRuntimeProvider} from "@research-assistant/workbench-preview/app-runtime-provider";
import {ProductionWorkbenchRoot} from "@research-assistant/workbench-preview/production-workbench-root";
import {DeveloperModeProvider} from "@research-assistant/workbench-preview/developer-mode";
import {ApplicationScrollbars} from "@research-assistant/workbench-preview/application-scrollbars";
import {noteManagerManifest} from "../src/public/manifest";
import {activate, configuration} from "../src/index";
import "@research-assistant/workbench-preview/styles/global";

const manifest = decodePluginManifest({...noteManagerManifest, formatVersion: 1, version: "0.1.0",
  entry: "index.js", styles: [], uiRuntime: WORKBENCH_UI_RUNTIME});
async function loadPlugins() {
  const resolution = resolveBuiltinPlugins([manifest], [manifest.id], coreCapabilities);
  return {plugins: [{manifest, module: {activate, configuration}, entryUrl: "/preview-api/note-manager/index.js", styles: []}],
    bindings: resolution.bindings, unavailableOptional: resolution.unavailableOptional};
}
const runtime = {mode: "browser" as const, storage: window.localStorage, gateways: {}, dispose() {}};
selectAppRuntime(runtime);
createRoot(document.getElementById("root")!).render(<AppRuntimeProvider runtime={runtime}><DeveloperModeProvider>
  <ApplicationScrollbars/><ProductionWorkbenchRoot><PreviewWorkbench loadPlugins={loadPlugins} initialLocation={{view: "notes"}}/>
  </ProductionWorkbenchRoot></DeveloperModeProvider></AppRuntimeProvider>);
