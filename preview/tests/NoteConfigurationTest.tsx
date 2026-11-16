import {useState, type PropsWithChildren} from "react";
import {noteConfiguration} from "@research-assistant/note-manager-preview/configuration";
import {PluginConfigurationProvider} from "@research-assistant/workbench-preview/configuration-provider";
import {createPluginConfigurations} from "@research-assistant/workbench-preview/configuration";
import {getAppStorage} from "@research-assistant/workbench-preview/app-storage";

/** The fixture supplies only the note plugin's declared settings and original storage mapping. */
export function NoteConfigurationTest({children}: PropsWithChildren) {
  const [configuration] = useState(() => createPluginConfigurations(getAppStorage(), [{
    owner: "note_manager", declaration: noteConfiguration,
    storage: {
      mode: {application: "research-assistant:workspace.v1:notes-mode"},
      scope: {application: "research-assistant:workspace.v1:notes-scope"},
      explorerOpen: {application: "research-assistant:workspace.v1:notes-explorer-open"},
      fullIndex: {application: "research-assistant:workspace.v1:notes-full-index"},
    },
  }]).get("note_manager")!);
  return <PluginConfigurationProvider value={configuration}>{children}</PluginConfigurationProvider>;
}
