const { app, BrowserWindow, globalShortcut, powerSaveBlocker } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const kiosk = !process.argv.includes('--windowed');
const devUrl = process.env.KDS_DEV_URL || '';
let sleepBlocker = null;
let kitchenServer = null;
let staticServer = null;

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('touch-events', 'enabled');

function distDirectory() {
  const packaged = path.join(process.resourcesPath, 'dist');
  const local = path.join(__dirname, '..', 'dist');
  if (app.isPackaged && fs.existsSync(path.join(packaged, 'index.html'))) return packaged;
  return local;
}

function contentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.ico': return 'image/x-icon';
    case '.webp': return 'image/webp';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.ttf': return 'font/ttf';
    default: return 'application/octet-stream';
  }
}

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const requested = (pathname.endsWith('/') ? `${pathname}index.html` : pathname).replace(/^\/+/, '');
      const file = path.normalize(path.join(root, requested || 'index.html'));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(file, (error, data) => {
        if (!error) {
          res.writeHead(200, { 'Content-Type': contentType(file) });
          res.end(data);
          return;
        }
        if (path.extname(requested)) {
          res.writeHead(404);
          res.end();
          return;
        }
        fs.readFile(path.join(root, 'index.html'), (fallbackError, html) => {
          if (fallbackError) {
            res.writeHead(404);
            res.end('Better Clover KDS web build was not found.');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function ensureKitchenServer() {
  const port = Number(process.env.KDS_PORT || 8787);
  if (await portOpen(port)) return;
  const serverFile = path.join(__dirname, '..', 'server', 'index.js');
  if (!fs.existsSync(serverFile)) return;
  kitchenServer = spawn(process.execPath, [serverFile], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
    stdio: 'inherit',
  });
}

function hideCursorWhenIdle(win) {
  win.webContents.executeJavaScript(`
    (() => {
      if (window.__kdsCursor) return;
      window.__kdsCursor = true;
      const style = document.createElement('style');
      style.textContent = 'html.kds-hide-cursor, html.kds-hide-cursor * { cursor: none !important; }';
      document.documentElement.appendChild(style);
      let timer;
      const arm = () => {
        document.documentElement.classList.remove('kds-hide-cursor');
        clearTimeout(timer);
        timer = setTimeout(() => document.documentElement.classList.add('kds-hide-cursor'), 4000);
      };
      window.addEventListener('pointermove', arm);
      arm();
    })();
  `).catch(() => {});
}

async function createWindow() {
  await ensureKitchenServer();
  const win = new BrowserWindow({
    title: 'Better Clover KDS',
    backgroundColor: '#121418',
    fullscreen: kiosk,
    kiosk,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.on('dom-ready', () => {
    if (kiosk) hideCursorWhenIdle(win);
  });

  if (devUrl) {
    await win.loadURL(devUrl);
    return;
  }

  const root = distDirectory();
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    win.loadURL('data:text/html,' + encodeURIComponent(
      '<body style="margin:0;background:#121418;color:#f7f8fa;font-family:sans-serif;padding:48px"><h1>Better Clover KDS</h1><p>The web build is missing. From the project folder run <code>npm run export:web</code>, then open the desktop app again.</p></body>'
    ));
    return;
  }

  staticServer = await startStaticServer(root);
  const { port } = staticServer.address();
  await win.loadURL(`http://127.0.0.1:${port}`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    sleepBlocker = powerSaveBlocker.start('prevent-display-sleep');
    if (kiosk && !process.argv.includes('--no-autostart')) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--kiosk'] });
    }
    globalShortcut.register('CommandOrControl+Shift+F', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      const next = !win.isKiosk();
      win.setKiosk(next);
      win.setFullScreen(next);
    });
    globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
    return createWindow();
  }).catch((error) => {
    console.error(error);
    app.quit();
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (sleepBlocker != null && powerSaveBlocker.isStarted(sleepBlocker)) {
    powerSaveBlocker.stop(sleepBlocker);
  }
  if (kitchenServer) kitchenServer.kill();
  if (staticServer) staticServer.close();
});

app.on('window-all-closed', () => {
  app.quit();
});
