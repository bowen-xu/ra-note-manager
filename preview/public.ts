/** Public development-preview entry. Consumers use the built package. */
export {default as packageMetadata} from "../package.json";
export {activate, configuration} from "../src/index.ts";
export {noteManagerManifest} from "../src/public/manifest.ts";
export {inspectReadingNoteResource, verifyNoteManagerContinuity, verifyReadingNoteSearchWorkflow} from "./src/app/notes/NoteManagerContinuity.browser.tsx";
