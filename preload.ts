import { ipcRenderer } from "electron";

let previousTrack: Track = { title: null, artist: null };

interface Track {
  title: string | null;
  artist: string | null;
}

interface TrackInfo {
  title: string | null;
  artist: string | null;
  coverUrl: string | null;
}

function getTextByXPath(xpath: string): string | null {
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue?.textContent?.trim() || null;
}

function getCoverUrlByAlt(trackTitle: string | null): string | null {
  if (!trackTitle) return null;

  const xpath = `//img[@alt="${trackTitle}"]`;
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  const img = result.singleNodeValue as HTMLImageElement | null;

  return img?.src || null;
}

function clickByTestId(buttonId: string): void {
  const el = document.querySelector(`[data-testid^="${buttonId}"]`);
  if (el) {
    (el as HTMLElement).click();
  } else {
    console.warn(`Element not found for data-testid: ${buttonId}`);
  }
}

function getTrackInfo(): void {
  try {
    const title = getTextByXPath(
      '//*[@id="page_player"]/div/div[1]/div[2]/div/div[1]/div/div/div/p/a'
    );
    const artist = getTextByXPath(
      '//*[@id="page_player"]/div/div[1]/div[2]/div/div[2]/div/div/p/a'
    );

    if (previousTrack.title === title && previousTrack.artist === artist) {
      return;
    }

    previousTrack = { title, artist };
    const coverUrl = getCoverUrlByAlt(title);

    const trackInfo: TrackInfo = { title, artist, coverUrl };
    ipcRenderer.send("track-info", trackInfo);
  } catch (e) {
    console.error("❌ Error in getTrackInfo:", e);
  }
}

type ActionName =
  | "playButton"
  | "nextButton"
  | "prevButton"
  | "repeatButton"
  | "shuffleButton";

const buttonIdList: Record<ActionName, string> = {
  playButton: "play_button",
  nextButton: "next_track_button",
  prevButton: "previous_track_button",
  repeatButton: "repeat_button",
  shuffleButton: "shuffle_play_button",
};

function postController(actionName: ActionName): void {
  console.log(`🔧 Action demandée: ${actionName}`);
  const buttonId = buttonIdList[actionName];
  if (buttonId) {
    clickByTestId(buttonId);
  } else {
    console.warn(`Action ID not found: ${actionName}`);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  getTrackInfo();

  ipcRenderer.on("deezer-cmd", (event, actionName: ActionName) => {
    postController(actionName);
  });

  const observerTarget = document.body;

  if (observerTarget) {
    const observerCallback: MutationCallback = (mutationsList, observer) => {
      getTrackInfo();
    };

    const observer = new MutationObserver(observerCallback);

    const observerConfig: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    };

    observer.observe(observerTarget, observerConfig);
  } else {
    console.warn(
      "❌ Observer target not found. Track info updates may not work."
    );
  }
});
