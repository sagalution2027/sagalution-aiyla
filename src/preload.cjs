const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiyla", {
  getState: () => ipcRenderer.invoke("state:get"),
  createRecord: (collection, input) => ipcRenderer.invoke("record:create", collection, input),
  updateRecord: (collection, recordId, patch) => ipcRenderer.invoke("record:update", collection, recordId, patch),
  deleteRecord: (collection, recordId) => ipcRenderer.invoke("record:delete", collection, recordId),
  askAiyla: (raw) => ipcRenderer.invoke("command:run", raw),
  getAiStatus: () => ipcRenderer.invoke("ai:status"),
  stopCurrentWork: () => ipcRenderer.invoke("work:stop"),
  setReady: () => ipcRenderer.invoke("work:ready"),
  createProposal: (input) => ipcRenderer.invoke("proposal:create", input),
  respondToApproval: (approvalId, action, patch = {}) => ipcRenderer.invoke("approval:respond", approvalId, action, patch),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  openDashboard: () => ipcRenderer.invoke("orbit:openDashboard"),
  showOrbit: () => ipcRenderer.invoke("orbit:show"),
  hideToOrbit: () => ipcRenderer.invoke("app:hideToOrbit"),
  quit: () => ipcRenderer.invoke("app:quit"),
  onStateChanged: (callback) => {
    const listener = (_event, nextState) => callback(nextState);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  }
});
