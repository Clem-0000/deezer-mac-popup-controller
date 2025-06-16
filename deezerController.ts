import {
  Menu,
  BrowserWindow,
  nativeImage,
  ipcMain,
  Tray,
  NativeImage,
  app,
} from "electron";
import * as https from "https";
import * as path from "path";
import { TrackInfo } from "./preload";

interface CurrentTrack {
  title: string;
  artist: string;
  coverImage: NativeImage;
  isPlaying: boolean;
}

type ActionName =
  | "playButton"
  | "prevButton"
  | "nextButton"
  | "repeatButton"
  | "shuffleButton";

class DeezerController {
  private tray: Tray;
  private appIconPath: string;
  private userAgent: string;
  private isUpdatingMenu: boolean;
  private deezerWindow: BrowserWindow | null;
  private currentTrack: CurrentTrack;
  private lastTrackInfo: TrackInfo | null = null;
  private menuOpenForFirstTime: boolean;

  constructor(tray: Tray, appIconPath: string, userAgent: string) {
    this.tray = tray;
    this.appIconPath = appIconPath;
    this.userAgent = userAgent;
    this.isUpdatingMenu = false;
    this.menuOpenForFirstTime = false;

    this.deezerWindow = null;

    const emptyBuffer = Buffer.alloc(192 * 192 * 4, 96);
    const skeletonImage = nativeImage.createFromBuffer(emptyBuffer, {
      width: 192,
      height: 192,
    });
    this.currentTrack = {
      title: "Loading...",
      artist: "",
      coverImage: skeletonImage,
      isPlaying: false,
    };
  }

  init(): void {
    this.createDeezerWindow();
    this.setupIPCListeners();
    this.buildTrayMenu();
  }

  createDeezerWindow(): void {
    this.deezerWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.deezerWindow.loadURL("https://www.deezer.com", {
      userAgent: this.userAgent,
    });

    this.deezerWindow.on("close", (event: Electron.Event) => {
      event.preventDefault();
      if (this.deezerWindow) {
        this.deezerWindow.hide();
      }
    });
  }

  async setupIPCListeners(): Promise<void> {
    ipcMain.on("track-info", async (event, track: TrackInfo) => {
      console.log("📡 Track info received:", track);
      await this.updateTrackInfo(track);
    });
  }

  async useFallbackCover(): Promise<void> {
    const emptyBuffer = Buffer.alloc(192 * 192 * 4, 96);
    this.currentTrack.coverImage = nativeImage.createFromBuffer(emptyBuffer, {
      width: 192,
      height: 192,
    });
    await this.buildTrayMenu();
  }

  async updateTrackInfo(track: TrackInfo): Promise<void> {
    // Avoid unnecessary updates if the track info hasn't changed
    if (
      this.lastTrackInfo &&
      this.lastTrackInfo.title === track.title &&
      this.lastTrackInfo.artist === track.artist &&
      this.lastTrackInfo.coverUrl === track.coverUrl &&
      this.lastTrackInfo.isPlaying === track.isPlaying
    ) {
      return;
    }

    if (this.lastTrackInfo === null && track.artist !== "") {
      this.menuOpenForFirstTime = true;
    }

    this.lastTrackInfo = track;
    if (this.isUpdatingMenu) {
      return;
    }
    this.isUpdatingMenu = true;

    this.currentTrack.title = track.title || "Unknown Track";
    this.currentTrack.artist = track.artist || "Unknown Artist";
    this.currentTrack.isPlaying = track.isPlaying || false;

    // Only way to get the cover image is by downloading it using the URL
    if (track.coverUrl) {
      https
        .get(track.coverUrl, (res) => {
          if (res.statusCode !== 200) {
            console.error(
              `Error downloading cover image: ${res.statusCode} ${res.statusMessage}`
            );
            res.resume();
            this.useFallbackCover();
            this.isUpdatingMenu = false;
            return;
          }

          const data: Buffer[] = [];
          res.on("data", (chunk: Buffer) => data.push(chunk));
          res.on("end", async () => {
            try {
              const buffer = Buffer.concat(data);
              const newCoverImage = nativeImage.createFromBuffer(buffer);
              if (newCoverImage.isEmpty()) {
                console.error("Cover image is empty or invalid.");
                this.useFallbackCover();
              } else {
                this.currentTrack.coverImage = newCoverImage.resize({
                  width: 192,
                  height: 192,
                });
                await this.buildTrayMenu();
              }
            } catch (e) {
              console.error("Error processing cover image buffer:", e);
              this.useFallbackCover();
            } finally {
              this.isUpdatingMenu = false;
            }
          });
        })
        .on("error", (err) => {
          console.error("Error downloading cover image:", err);
          this.useFallbackCover();
          this.isUpdatingMenu = false;
        });
    } else {
      this.useFallbackCover();
      this.isUpdatingMenu = false;
    }
  }

  breakText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.length > maxLen ? text.substring(0, maxLen - 1) + "…" : text;
  }

  async getIcon(iconName: string): Promise<NativeImage | null> {
    const iconPath = path.join(__dirname, `./assets/icons/${iconName}`);

    try {
      const iconRef = nativeImage.createFromPath(iconPath);
      if (iconRef.isEmpty()) {
        console.error(`Icon not found or empty: ${iconName} at ${iconPath}`);
        return null;
      }
      const resizedIcon = iconRef.resize({ width: 22, height: 22 });
      resizedIcon.setTemplateImage(true);
      return resizedIcon;
    } catch (error) {
      console.error(`Error loading icon ${iconName}:`, error);
      return null;
    }
  }

  async buildTrayMenu(): Promise<void> {
    console.log("Rebuilding tray menu with current track:", this.currentTrack);

    const playIcon = await this.getIcon(
      this.currentTrack.isPlaying ? "stopIcon.png" : "playIcon.png"
    );
    const prevIcon = await this.getIcon("prevIcon.png");
    const nextIcon = await this.getIcon("nextIcon.png");
    const repeatIcon = await this.getIcon("repeatIcon.png");
    const shuffleIcon = await this.getIcon("shuffleIcon.png");
    const openDeezerIcon = await this.getIcon("openDeezerIcon.png");
    const quitIcon = await this.getIcon("quitIcon.png");

    const menuItems: Electron.MenuItemConstructorOptions[] = [
      {
        label: ``,
        icon: this.currentTrack.coverImage,
        enabled: false,
      },
      {
        label: this.breakText(this.currentTrack.title, 30),
        sublabel: this.currentTrack.artist,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Previous",
        icon: prevIcon || undefined,
        click: () => this.sendCommand("prevButton"),
      },
      {
        label: this.currentTrack.isPlaying ? "Stop" : "Play",
        icon: playIcon || undefined,
        click: () => this.sendCommand("playButton"),
      },
      {
        label: "Next",
        icon: nextIcon || undefined,
        click: () => this.sendCommand("nextButton"),
      },
      {
        label: "Repeat",
        icon: repeatIcon || undefined,
        click: () => this.sendCommand("repeatButton"),
      },
      {
        label: "Shuffle",
        icon: shuffleIcon || undefined,
        click: () => this.sendCommand("shuffleButton"),
      },
      { type: "separator" },
      {
        label: "Open Deezer",
        icon: openDeezerIcon || undefined,
        click: () => this.openDeezerFull(),
      },
      {
        label: "Quit",
        icon: quitIcon || undefined,
        click: () => {
          if (this.deezerWindow && !this.deezerWindow.isDestroyed()) {
            this.deezerWindow.destroy();
          }
          if (this.tray && !this.tray.isDestroyed()) {
            this.tray.destroy();
          }
          app.quit();
        },
      },
    ];

    const contextMenu = Menu.buildFromTemplate(
      menuItems.map((item) => {
        if (item.icon === null) delete item.icon;
        return item;
      })
    );

    if (this.menuOpenForFirstTime) {
      this.tray.closeContextMenu();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    this.tray.setContextMenu(contextMenu);

    if (this.menuOpenForFirstTime) {
      this.tray.popUpContextMenu(contextMenu);
      this.menuOpenForFirstTime = false;
    }
  }

  sendCommand(actionName: ActionName): void {
    if (
      this.deezerWindow &&
      this.deezerWindow.webContents &&
      !this.deezerWindow.isDestroyed()
    ) {
      this.deezerWindow.webContents.send("deezer-cmd", actionName);
    } else {
      console.warn(
        "Deezer window or webContents not available for sendCommand:",
        actionName
      );
    }
  }

  openDeezerFull(): void {
    if (this.deezerWindow && !this.deezerWindow.isDestroyed()) {
      this.deezerWindow.show();
      if (this.deezerWindow.isMinimized()) {
        this.deezerWindow.restore();
      }
      this.deezerWindow.focus();
    } else {
      console.warn("Deezer window not available to open.");
    }
  }
}

export default DeezerController;
