const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('betterCloverKds', {
  shell: 'electron',
});
