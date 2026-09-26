'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (name, payload) => ipcRenderer.invoke(`editor:${name}`, payload);
const listen = (channel, callback) => {
  if (typeof callback !== 'function') throw new TypeError('callback required');
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('lumeEditor', Object.freeze({
  getState: () => invoke('state'),
  createCourse: title => invoke('new-course', { title }),
  dispatch: (command, expectedRevision) => invoke('dispatch', { command, expectedRevision }),
  undo: expectedRevision => invoke('undo', { expectedRevision }),
  redo: expectedRevision => invoke('redo', { expectedRevision }),
  getPreview: pageId => invoke('preview', { pageId }),
  openCourse: () => invoke('open-course'),
  importComponentPack: () => invoke('import-component-pack'),
  saveCourse: saveAs => invoke('save-course', { saveAs: Boolean(saveAs) }),
  saveModelProfile: (profile, apiKey) => invoke('save-model-profile', { profile, apiKey }),
  testModel: () => invoke('test-model'),
  startAgent: prompt => invoke('agent-start', { prompt }),
  cancelAgent: requestId => invoke('agent-cancel', { requestId }),
  acceptCandidate: expectedRevision => invoke('candidate-accept', { expectedRevision }),
  discardCandidate: () => invoke('candidate-discard'),
  onAgentEvent: callback => listen('editor:agent-event', callback)
}));
