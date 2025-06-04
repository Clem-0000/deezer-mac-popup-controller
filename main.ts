import { app, Tray, session, nativeImage, NativeImage } from "electron";
import * as path from "path";
import * as fs from "fs";
import DeezerController from "./deezerController";

let tray: Tray | null = null;
let deezerController: DeezerController | null = null;

const appIconPath = path.join(__dirname, "./assets/icons/appIcon.png");
const modernUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

app.whenReady().then(() => {
  if (!fs.existsSync(appIconPath)) {
    console.error("Icon file not found at path:", appIconPath);
    app.quit();
    return;
  }

  let trayIcon: NativeImage = nativeImage.createFromPath(appIconPath);

  if (trayIcon.isEmpty()) {
    console.error("Empty icon at path:", appIconPath);
    app.quit();
    return;
  }

  trayIcon = trayIcon.resize({ width: 22, height: 22 });
  trayIcon.setTemplateImage(true);

  session.defaultSession.setUserAgent(modernUserAgent);
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["User-Agent"] = modernUserAgent;
    details.requestHeaders["Accept-Language"] = "fr-FR,fr;q=0.9,en;q=0.8";
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  tray = new Tray(trayIcon);
  tray.setToolTip("Lecteur Deezer");

  deezerController = new DeezerController(tray, appIconPath, modernUserAgent);
  deezerController.init();
});

process.on("unhandledRejection", (reason: any) => {
  console.error("Unhandled Rejection:", reason);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
