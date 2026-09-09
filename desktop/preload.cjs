const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('nexaDesktop', {
  getDriveStatus: () => ipcRenderer.invoke('drive:status'),
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:info'),
  initializeStorage: () => ipcRenderer.invoke('storage:initialize'),
  listCandidates: () => ipcRenderer.invoke('candidates:list'),
  syncContactedCandidates: () => ipcRenderer.invoke('candidates:sync-contacted'),
  createCandidate: (candidate) => ipcRenderer.invoke('candidates:create', candidate),
  getWorkspace: (candidateId) => ipcRenderer.invoke('workspace:get', candidateId),
  ensureSession: (candidateId, sessionNumber) => ipcRenderer.invoke('sessions:ensure', { candidateId, sessionNumber }),
  importMedia: (payload) => ipcRenderer.invoke('media:import', payload),
  replaceMedia: (payload) => ipcRenderer.invoke('media:replace', payload),
  deleteMedia: (mediaId) => ipcRenderer.invoke('media:delete', mediaId),
  startPoseTimer: (poseId) => ipcRenderer.invoke('pose-timer:start', poseId),
  stopPoseTimer: (poseId) => ipcRenderer.invoke('pose-timer:stop', poseId),
  resetPoseTimer: (poseId) => ipcRenderer.invoke('pose-timer:reset', poseId),
  saveEvaluation: (payload) => ipcRenderer.invoke('evaluation:save', payload),
  exportPdf: (fileName) => ipcRenderer.invoke('report:export', fileName),
  showExportedReportInFolder: () => ipcRenderer.invoke('report:show-in-folder'),
  pathForFile: (file) => webUtils.getPathForFile(file),
})
