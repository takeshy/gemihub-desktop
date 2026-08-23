// Compatibility adapter for the existing Wails v2-shaped frontend API.
// Wails v3 exposes module-based calls and events instead of window.go and
// window.runtime, so keeping the translation here avoids coupling the app to
// generated binding IDs.
import { Call, Events } from "/wails/runtime.js";

const service = new Proxy({}, {
  get: (_target, method) => (...args) => Call.ByName(`main.App.${String(method)}`, ...args),
});

globalThis.window.go = { main: { App: service } };

let fileDropOff = null;
globalThis.window.runtime = {
  EventsOn: (name, callback) => Events.On(name, (event) => callback(event.data)),
  OnFileDrop: (callback) => {
    fileDropOff?.();
    fileDropOff = Events.On("wails:file-drop", (event) => {
      const data = event.data || {};
      callback(data.x || 0, data.y || 0, data.paths || []);
    });
  },
  OnFileDropOff: () => {
    fileDropOff?.();
    fileDropOff = null;
  },
};
