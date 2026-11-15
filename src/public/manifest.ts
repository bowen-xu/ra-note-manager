import type {BuiltinPluginManifest} from "@research-assistant/workbench-sdk";

/** Pure build and application declaration; importing it cannot load the workspace. */
export const noteManagerManifest = {
  id: "note_manager",
  apiVersion: 1,
  dependencies: { required: [], optional: [{ id: "writing_projects", apiVersion: 1 }] },
  provides: [{ id: "notes.management", version: 1 }],
  consumes: {
    required: ["core.workbench", "core.notes", "core.notes.workspace-host", "core.editor", "core.hbs", "core.agent", "core.agent.tools", "core.resources", "core.platform", "core.platform.confirmation"]
      .map(id => ({ id, version: 1, provider: "core" })),
    optional: [{ id: "writing.note-catalog", version: 1, provider: "writing_projects" },
      ...["core.agent.skills", "core.agent.mcp"].map(id => ({id, version: 1, provider: "core"}))],
  },
} as const satisfies BuiltinPluginManifest;
