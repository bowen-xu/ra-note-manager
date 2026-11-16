import {resolveBuiltinPlugins} from "@research-assistant/workbench-sdk/composition";
import {coreCapabilities} from "@research-assistant/workbench-preview/core-capabilities";
import {noteManagerManifest} from "../src/public/manifest";
import {noteConfiguration} from "../src/public/configuration";
import type {ConfigurationRegistration} from "@research-assistant/workbench-preview/configuration";

const resolution = resolveBuiltinPlugins([noteManagerManifest], [noteManagerManifest.id], coreCapabilities);
const prefix = "research-assistant:workspace.v1:";
const configurations: readonly ConfigurationRegistration[] = [{
  owner: "note_manager", declaration: noteConfiguration, storage: {
    mode: {application: prefix + "notes-mode"}, scope: {application: prefix + "notes-scope"},
    explorerOpen: {application: prefix + "notes-explorer-open"}, fullIndex: {application: prefix + "notes-full-index"},
  },
}];
export const notePreviewCatalog = {bindings: resolution.bindings, configurations};
