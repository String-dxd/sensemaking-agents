# saves/

`island.json` here is the repo-saved island written by the editor's Save button
through the dev-server middleware (`server/islandSavePlugin.ts`); the Load
button reads it back. It is meant to be committed — until the first Save, Load
reports that no island has been saved yet.
