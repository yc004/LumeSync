'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(`teacher:${channel}`, payload);
const event = channel => callback => {
  const listener = () => callback();
  ipcRenderer.on(`teacher:${channel}`, listener);
  return () => ipcRenderer.removeListener(`teacher:${channel}`, listener);
};
const removeEvent = channel => callback => ipcRenderer.removeAllListeners(`teacher:${channel}`);

contextBridge.exposeInMainWorld('teacherHost', {
  getSession: () => invoke('session'),
  bootstrapSession: () => invoke('session')
});
contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => invoke('minimize'),
  maximizeWindow: () => invoke('maximize'),
  closeWindow: () => invoke('close'),
  setFullscreen: enabled => invoke('fullscreen', !!enabled),
  toggleDevTools: () => invoke('devtools'),
  onWindowMaximized: event('maximized'),
  onWindowUnmaximized: event('unmaximized'),
  removeWindowMaximizedListener: removeEvent('maximized'),
  removeWindowUnmaximizedListener: removeEvent('unmaximized'),
  importCourse: () => invoke('import-course'),
  exportCourse: options => invoke('export-course', options),
  saveGeneratedPdf: options => invoke('save-pdf', options),
  selectSubmissionDir: () => invoke('submission-dir'),
  openLogDir: () => invoke('open-logs'),
  getSettings: () => invoke('get-settings'),
  saveSettings: value => invoke('save-settings', value),
  setAdminPassword: hash => invoke('admin-password', hash),
  classStarted: () => invoke('class-started'),
  classEnded: () => invoke('class-ended'),
  beginWindowDrag: () => invoke('window-drag')
});
