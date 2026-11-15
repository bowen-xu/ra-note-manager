// One production implementation is shared by independent package builds and
// the transitional static application through the public plugin subpaths.
import {createElement} from "react";
import type {PluginActivationContext} from "@research-assistant/workbench-sdk/activation";
import {NotesWorkspace} from "./public/workspace";

export {NotesWorkspace};
export function activate(context: PluginActivationContext): void {
  const view = context.registerView({id: "notes", title: "笔记", priority: 200, render: props => createElement(NotesWorkspace, props)});
  context.onDispose(() => view.dispose());
}
export type {NoteWorkspacePort} from "./public/contracts";
export {noteManagerManifest} from "./public/manifest";
export {
  noteConfiguration as configuration,
  noteExplorerSetting,
  noteFullIndexSetting,
  noteModeSetting,
  noteScopeSetting,
} from "./public/configuration";
