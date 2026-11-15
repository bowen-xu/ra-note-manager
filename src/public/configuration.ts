import type {NoteCategory, NoteIndexView} from "@research-assistant/core/notes";
import type {ConfigurationSetting, PluginConfigurationDeclaration} from "@research-assistant/workbench-sdk/configuration";

export const noteModeSetting: ConfigurationSetting<NoteCategory> = {
  key: "mode", defaultValue: "all", schema: {type: "string", enum: ["all", "independent", "dependent"]}, scopes: ["application"], effect: "immediate",
};
export const noteScopeSetting: ConfigurationSetting<NoteIndexView> = {
  key: "scope", defaultValue: "recent", schema: {type: "string", enum: ["recent", "favorites", "archive", "trash"]}, scopes: ["application"], effect: "immediate",
};
export const noteExplorerSetting: ConfigurationSetting<boolean> = {
  key: "explorerOpen", defaultValue: false, schema: {type: "boolean"}, scopes: ["application"], effect: "immediate",
};
export const noteFullIndexSetting: ConfigurationSetting<boolean> = {
  key: "fullIndex", defaultValue: false, schema: {type: "boolean"}, scopes: ["application"], effect: "immediate",
};
export const noteConfiguration = {owner: "note_manager", settings: [noteModeSetting, noteScopeSetting, noteExplorerSetting, noteFullIndexSetting]} satisfies PluginConfigurationDeclaration;
