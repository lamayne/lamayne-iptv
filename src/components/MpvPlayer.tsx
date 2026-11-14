import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  init,
  destroy,
  command,
  setProperty,
  observeProperties,
  setVideoMarginRatio,
  type MpvObservableProperty,
} from "tauri-plugin-libmpv-api";
import {
  getCurrentWindow,
  currentMonitor,
} from "@tauri-apps/api/window";
import {
  LogicalSize,
  PhysicalPosition,
  type PhysicalSize,
} from "@tauri-apps/api/dpi";
import {
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import CastMenu from "@/components/CastMenu";
import { getChannelPresentation } from "@/utils/channelPresentation";
import { cleanMovieTitle } from "@/utils/titleClean";
import {
  getPlaybackProgress,
  savePlaybackProgress,
  canResumePlayback,
  formatPlaybackTime,
  type PlaybackIdentity,
  type PlaybackProgress,
} from "@/utils/playbackProgress";
import {
  getPlayerPreferences,
  savePlayerPreferences,
  type TrackPreference,
} from "@/utils/playerPreferences";


let mpvLifecycleQueue: Promise<void> = Promise.resolve();


function enqueueMpvLifecycle(task: () => Promise<void>) {
  const next = mpvLifecycleQueue.then(task);
  mpvLifecycleQueue = next.catch(() => {});
  return next;
}


type MpvTrack = {
  id: number;
  type: "audio" | "sub" | "video";
  title?: string;
  lang?: string;
  selected?: boolean;
  // Champs fournis par mpv (track-list).
  codec?: string;
  default?: boolean;
};


type Props = {
  url: string;
  isLive?: boolean;
  onPreviousChannel?: () => void;
  onNextChannel?: () => void;
  playback?: PlaybackIdentity;
  onEnded?: () => void;
  onProgress?: (position: number, duration: number) => void;
    title?: string;
};


type PlaybackSession = {
  identity: PlaybackIdentity | null;
  position: number;
  duration: number;
  loaded: boolean;
  hasPosition: boolean;
  enabled: boolean;
  awaitingChoice: boolean;
  restoring: boolean;
  completed: boolean;
  endedHandled: boolean;
  storageWarningShown: boolean;
};


const OBSERVED_PROPERTIES = [
  ["pause", "flag"],
  ["time-pos", "double", "none"],
  ["duration", "double", "none"],
  ["volume", "int64"],
  ["track-list", "node", "none"],
  ["eof-reached", "flag"],
] as const satisfies MpvObservableProperty[];


// Flux en direct : au-delà de ce délai sans progression, « lecture » relance
// la connexion au lieu de simplement basculer la pause.
const LIVE_RECONNECT_MS = 5000;
// Flux figé depuis ce délai : reconnexion automatique (3 essais d'affilée).
const LIVE_STALL_MS = 15000;

// La piste audio que l'appareil Google jouera : celle marquée « par défaut »
// dans le fichier, sinon la première (le choix fait dans le lecteur n'est pas
// transmis à l'appareil).
function audioForCast(tracks: MpvTrack[]) {
  const audio = tracks.filter((track) => track.type === "audio");
  const track = audio.find((item) => item.default) ?? audio[0];

  if (!track) return null;

  return {
    codec: track.codec ?? "",
    language: track.lang ?? "",
    title: track.title ?? "",
    count: audio.length,
  };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}


function normalizeLanguage(value: string | undefined): string {
  const language = (value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");


  const aliases: Record<string, string> = {
    fra: "fr",
    fre: "fr",
    eng: "en",
    spa: "es",
    deu: "de",
    ger: "de",
    ita: "it",
    por: "pt",
    jpn: "ja",
    kor: "ko",
    zho: "zh",
    chi: "zh",
    ara: "ar",
    rus: "ru",
    nld: "nl",
    dut: "nl",
  };


  const parts = language.split("-");
  parts[0] = aliases[parts[0]] || parts[0];


  return parts.join("-");
}


function normalizeTitle(value: string | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}


function findPreferredTrack(
  tracks: MpvTrack[],
  preference: TrackPreference | null
): MpvTrack | null {
  if (!preference) return null;


  const language = normalizeLanguage(preference.language);
  const title = normalizeTitle(preference.title);


  if (language) {
    const matches = tracks.filter(
      (track) => normalizeLanguage(track.lang) === language
    );


    if (!matches.length) return null;


    return (
      matches.find(
        (track) =>
          title && normalizeTitle(track.title) === title
      ) ||
      matches[0]
    );
  }


  if (title) {
    return (
      tracks.find(
        (track) => normalizeTitle(track.title) === title
      ) || null
    );
  }


  return null;
}


function trackPreference(track: MpvTrack): TrackPreference {
  return {
    language: track.lang?.trim().toLowerCase() || "",
    title: track.title?.trim() || "",
  };
}


function ControlButton({
  title,
  
  onClick,
  disabled = false,
  active = false,
  compact = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex ${compact ? "h-7 w-7" : "h-10 w-10"} items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? "border-accent-400/60 bg-accent-500/25 text-white shadow-accent-glow"
          : "border-white/10 bg-white/5 text-surface-100 hover:border-accent-400/40 hover:bg-accent-500/15 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}


export default function MpvPlayer({
  url,
  isLive = false,
  onPreviousChannel,
  onNextChannel,
  playback,
  onEnded,
  onProgress,
  title,
}: Props) {
  const { activeProfile, defaultVolume, t } = useApp();


  const preferenceProfileId =
    playback?.profileId || activeProfile?.id || "";


  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [tracks, setTracks] = useState<MpvTrack[]>([]);
  const [audioId, setAudioId] =
    useState<number | "auto">("auto");
  const [subId, setSubId] =
    useState<number | "no">("no");
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(defaultVolume);
  const [muted, setMuted] = useState(false);
  const [timePos, setTimePos] =
    useState<number | null>(null);
  const [duration, setDuration] =
    useState<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  // Mode théâtre : la vidéo remplit la fenêtre, sans le menu ni le reste de la page
  // (la fenêtre n'est pas passée en plein écran).
  const [isTheatre, setIsTheatre] = useState(false);
  const [resumeOffer, setResumeOffer] =
    useState<PlaybackProgress | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
    const [osd, setOsd] = useState<"play" | "pause" | null>(null);
  const [titleFlash, setTitleFlash] = useState(false);
  const osdTimer = useRef<number | null>(null);
    const [started, setStarted] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(1);
  const [loadFailed, setLoadFailed] = useState(false);
  const retryLoadRef = useRef<(() => void) | null>(null);


  const initialized = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const clickTimer = useRef<number | null>(null);
  const transitionBusyRef = useRef(false);
  const videoRectRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const resumeBusyRef = useRef(false);
  const playbackRef = useRef(playback);
  const endedCallbackRef = useRef(onEnded);
  const progressCallbackRef = useRef(onProgress);
  const volumeRef = useRef(defaultVolume);
  const manualAudioRef = useRef(false);
  const manualSubRef = useRef(false);


  playbackRef.current = playback;
  endedCallbackRef.current = onEnded;
  progressCallbackRef.current = onProgress;


  const playbackKey = playback
    ? JSON.stringify([
        playback.profileId,
        playback.sourceKey,
        playback.kind,
        playback.itemId,
      ])
    : "";


  const pipRef = useRef<{
    size: PhysicalSize;
    pos: PhysicalPosition;
    maximized: boolean;
  } | null>(null);


  function persistSession(session: PlaybackSession): boolean {
    if (
      !session.identity ||
      !session.enabled ||
      session.awaitingChoice ||
      session.restoring ||
      !session.hasPosition
    ) {
      return true;
    }


    return savePlaybackProgress(
      session.identity,
      session.position,
      session.duration,
      session.completed
    );
  }


  useEffect(() => {
    document.documentElement.classList.toggle(
      "mpv-active",
      ready
    );

    return () => {
      document.documentElement.classList.remove("mpv-active");
    };
  }, [ready]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "mpv-fullscreen",
      isFullscreen
    );


    return () => {
      document.documentElement.classList.remove(
        "mpv-fullscreen"
      );
    };
  }, [isFullscreen]);


  useEffect(() => {
    document.documentElement.classList.toggle(
      "mpv-pip",
      isPip
    );


    return () => {
      document.documentElement.classList.remove("mpv-pip");
    };
  }, [isPip]);


  useEffect(() => {
    document.documentElement.classList.toggle(
      "mpv-theatre",
      isTheatre
    );


    return () => {
      document.documentElement.classList.remove("mpv-theatre");
    };
  }, [isTheatre]);


  useEffect(() => {
    let cancelled = false;
    let ownsInstance = false;
    let loadRequested = false;
    let unlisten: (() => void) | null = null;
    let trackQueue: Promise<void> = Promise.resolve();
    let audioSignature = "";
    let subtitleSignature = "";


    const preferences =
      getPlayerPreferences(preferenceProfileId);


    const initialVolume = volumeRef.current;


    const identity =
      !isLive && playbackRef.current
        ? { ...playbackRef.current }
        : null;


    const saved = identity
      ? getPlaybackProgress(identity)
      : null;


    const offer = canResumePlayback(saved) ? saved : null;


    const session: PlaybackSession = {
      identity,
      position: 0,
      duration: 0,
      loaded: false,
      hasPosition: false,
      enabled: false,
      awaitingChoice: Boolean(offer),
      restoring: false,
      completed: false,
      endedHandled: false,
      storageWarningShown: false,
    };


    sessionRef.current = session;
    initialized.current = false;
    resumeBusyRef.current = false;
    manualAudioRef.current = false;
    manualSubRef.current = false;


    setReady(false);
    setError(null);
    setNotice("");
    setTracks([]);
    setAudioId("auto");
    setSubId("no");
    setTimePos(null);
    setDuration(null);
    setResumeOffer(offer);
    setResumeBusy(false);
        setStarted(false);
    setLoadAttempt(1);
    setLoadFailed(false);

    const MAX_ATTEMPTS = 3;
    const LOAD_TIMEOUT_MS = 15000;
    let attempt = 1;
    let loadTimer: number | null = null;

    function clearLoadTimer() {
      if (loadTimer !== null) {
        window.clearTimeout(loadTimer);
        loadTimer = null;
      }
    }

    function watchLoad() {
      clearLoadTimer();

      loadTimer = window.setTimeout(async () => {
        if (cancelled || session.hasPosition) return;

        if (attempt >= MAX_ATTEMPTS) {
          setLoadFailed(true);
          return;
        }

        attempt += 1;
        setLoadAttempt(attempt);

        try {
          await command("loadfile", [url, "replace"]);
        } catch {
          // Le prochain essai réessaiera.
        }

        if (!cancelled) watchLoad();
      }, LOAD_TIMEOUT_MS);
    }

    retryLoadRef.current = () => {
      if (cancelled || !initialized.current) return;

      attempt = 1;
      setLoadAttempt(1);
      setLoadFailed(false);

      void (async () => {
        try {
          await command("loadfile", [url, "replace"]);
        } catch {
          // Le délai gérera l'échec.
        }

        if (!cancelled) watchLoad();
      })();
    };

    function saveCurrent() {
      const success = persistSession(session);


      if (
        !success &&
        !cancelled &&
        !session.storageWarningShown
      ) {
        session.storageWarningShown = true;
        setNotice(
          t("player.progressSaveFailed")
        );
      }
    }


    function handleEnd() {
      if (
        cancelled ||
        isLive ||
        !session.loaded ||
        !session.hasPosition ||
        !session.enabled ||
        session.awaitingChoice ||
        session.restoring ||
        session.endedHandled
      ) {
        return;
      }


      if (
        session.duration > 0 &&
        session.duration - session.position > 5
      ) {
        saveCurrent();
        setNotice(
          t("player.streamEndedEarly")
        );
        return;
      }


      session.endedHandled = true;
      session.completed = true;
      saveCurrent();
      setShowControls(true);


      try {
        endedCallbackRef.current?.();
      } catch {
        setNotice(
          t("player.nextFailed")
        );
      }
    }


    function applyTrackPreferences(nextTracks: MpvTrack[]) {
      if (isLive || cancelled || !loadRequested) return;


      const audioTracks = nextTracks.filter(
        (track) => track.type === "audio"
      );
      const subtitleTracks = nextTracks.filter(
        (track) => track.type === "sub"
      );


      const nextAudioSignature = JSON.stringify(
        audioTracks.map((track) => [
          track.id,
          track.lang,
          track.title,
        ])
      );


      const nextSubtitleSignature = JSON.stringify(
        subtitleTracks.map((track) => [
          track.id,
          track.lang,
          track.title,
        ])
      );


      if (
        audioTracks.length > 0 &&
        nextAudioSignature !== audioSignature
      ) {
        audioSignature = nextAudioSignature;


        const preferred = findPreferredTrack(
          audioTracks,
          preferences.audio
        );


        const target = preferred?.id ?? "auto";


        trackQueue = trackQueue
          .then(async () => {
            if (cancelled || manualAudioRef.current) return;


            await command("set", ["aid", target]);


            if (!cancelled && !manualAudioRef.current) {
              setAudioId(target);
            }
          })
          .catch(() => {});
      }


      if (
        subtitleTracks.length > 0 &&
        nextSubtitleSignature !== subtitleSignature
      ) {
        subtitleSignature = nextSubtitleSignature;


        const preferred = findPreferredTrack(
          subtitleTracks,
          preferences.subtitles
        );


        const target =
          preferences.subtitlesMode === "off"
            ? "no"
            : preferences.subtitlesMode === "auto"
            ? "auto"
            : preferred?.id ?? "no";


        trackQueue = trackQueue
          .then(async () => {
            if (cancelled || manualSubRef.current) return;


            await command("set", ["sid", target]);


            if (!cancelled && !manualSubRef.current) {
              setSubId(
                typeof target === "number" ? target : "no"
              );
            }
          })
          .catch(() => {});
      }
    }


    void enqueueMpvLifecycle(async () => {
      if (cancelled) return;


      try {
        await init({
          initialOptions: {
            vo: "gpu-next",
            hwdec: "auto-safe",
            "keep-open": "yes",
            "force-window": "yes",
            pause: "yes",
            ...(!isLive
              ? {
                  sid: "no",
                  alang: preferences.audio?.language || "",
                }
              : {}),
          },
          observedProperties: OBSERVED_PROPERTIES,
        });


        ownsInstance = true;
        initialized.current = true;


        if (cancelled) return;


        for (const [name, value] of [
          ["sub-use-margins", "no"],
          ["sub-ass-force-margins", "no"],
          ["sub-font-size", 36],
        ] as const) {
          try {
            await command("set", [name, value]);
          } catch {
            // Option facultative selon la version de MPV.
          }


          if (cancelled) return;
        }


        const stop = await observeProperties(
          OBSERVED_PROPERTIES,
          (event) => {
            if (cancelled) return;


            if (event.name === "pause") {
              setPaused(Boolean(event.data));


              if (event.data === true) {
                saveCurrent();
              }
            }


            if (
              event.name === "time-pos" &&
              typeof event.data === "number" &&
              Number.isFinite(event.data) &&
              event.data >= 0 &&
              loadRequested
            ) {
              session.position = event.data;
              session.hasPosition = true;
              session.loaded = true;
              setTimePos(event.data);
              lastProgressRef.current = Date.now();
                            clearLoadTimer();
              setStarted(true);


              if (
                session.enabled &&
                !session.awaitingChoice &&
                !session.restoring
              ) {
                progressCallbackRef.current?.(
                  event.data,
                  session.duration
                );
              }
            }


            if (
              event.name === "duration" &&
              typeof event.data === "number" &&
              Number.isFinite(event.data) &&
              event.data > 0 &&
              loadRequested
            ) {
              session.duration = event.data;
              session.loaded = true;
              setDuration(event.data);
            }


            if (
              event.name === "volume" &&
              typeof event.data === "number"
            ) {
              volumeRef.current = event.data;
              setVolume(event.data);
            }


            if (
              event.name === "track-list" &&
              Array.isArray(event.data)
            ) {
              const nextTracks = event.data as MpvTrack[];
              setTracks(nextTracks);


              const selectedAudio = nextTracks.find(
                (track) =>
                  track.type === "audio" && track.selected
              );


              const selectedSubtitle = nextTracks.find(
                (track) =>
                  track.type === "sub" && track.selected
              );


              setAudioId(selectedAudio?.id ?? "auto");
              setSubId(selectedSubtitle?.id ?? "no");


              applyTrackPreferences(nextTracks);
            }


            if (
              event.name === "eof-reached" &&
              event.data === true
            ) {
              handleEnd();
            }
          }
        );


        if (cancelled) {
          stop();
          return;
        }


        unlisten = stop;


        await setProperty("volume", initialVolume);
        if (cancelled) return;


        loadRequested = true;
        await command("loadfile", [url, "replace"]);
        if (cancelled) return;
                watchLoad();


        await setProperty("pause", Boolean(offer));
        if (cancelled) return;


        session.enabled = !offer;
        setPaused(Boolean(offer));
        setReady(true);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : String(caught)
          );
        }
      }
    });


    const saveTimer = window.setInterval(
      saveCurrent,
      5000
    );


    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveCurrent();
      }
    };


    window.addEventListener("pagehide", saveCurrent);
    document.addEventListener(
      "visibilitychange",
      onVisibilityChange
    );


    return () => {
      saveCurrent();
      cancelled = true;
            clearLoadTimer();
      retryLoadRef.current = null;
      initialized.current = false;
            document.documentElement.classList.remove("mpv-active");



      if (sessionRef.current === session) {
        sessionRef.current = null;
      }


      window.clearInterval(saveTimer);
      window.removeEventListener("pagehide", saveCurrent);
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );


      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }


      const stop = unlisten;
      unlisten = null;
      stop?.();


      void enqueueMpvLifecycle(async () => {
        if (!ownsInstance) return;


        try {
          await trackQueue;
          await destroy();
        } catch {
          // L'instance peut déjà avoir été supprimée.
        } finally {
          ownsInstance = false;
          initialized.current = false;
        }
      });
    };
  }, [url, playbackKey, isLive, preferenceProfileId, t]);


  useEffect(() => {
    return () => {
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
      }


      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current);
      }


      const win = getCurrentWindow();
      const previous = pipRef.current;
      pipRef.current = null;


      void (async () => {
        try {
          await win.setFullscreen(false);


          if (previous) {
            await win.setAlwaysOnTop(false);
            await win.setDecorations(true);
            await win.setSize(previous.size);
            await win.setPosition(previous.pos);


            if (previous.maximized) {
              await win.maximize();
            }
          }
        } catch {
          // La fenêtre peut être en cours de fermeture.
        }
      })();
    };
  }, []);


  useEffect(() => {
    const element = videoRectRef.current;
    if (!element || !ready) return;

    let cancelled = false;
    let frame = 0;
    let running = false;
    let pending = false;
    let lastGeometry = "";

    async function flush() {
      if (running || cancelled || !initialized.current) return;
      running = true;

      try {
        while (pending && !cancelled && initialized.current) {
          pending = false;
          const rect = element!.getBoundingClientRect();
          const width = window.innerWidth;
          const height = window.innerHeight;

          if (width <= 0 || height <= 0 || rect.width <= 0 || rect.height <= 0) {
            continue;
          }

          const geometry = [
            width, height, rect.left, rect.top, rect.right, rect.bottom,
          ].map((value) => Math.round(value * 10) / 10).join(":");

          if (geometry === lastGeometry) continue;

          const clamp = (value: number) => Math.max(0, Math.min(1, value));

          try {
            await setVideoMarginRatio({
              left: clamp(rect.left / width),
              right: clamp(1 - rect.right / width),
              top: clamp(rect.top / height),
              bottom: clamp(1 - rect.bottom / height),
            });
            if (!cancelled) lastGeometry = geometry;
          } catch {
            // Réessai au prochain changement de géométrie.
          }
        }
      } finally {
        running = false;
      }
    }

    const schedule = () => {
      if (cancelled || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        pending = true;
        void flush();
      });
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();

    return () => {
      cancelled = true;
      pending = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [ready, isFullscreen, isPip, isTheatre]);

  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    let stop: (() => void) | undefined;
    let checking = false;
    let pending = false;

    async function syncWindow() {
      pending = true;
      if (checking) return;
      checking = true;
      try {
        while (pending && !cancelled) {
          pending = false;
          const fullscreen = await win.isFullscreen();
          if (!cancelled) setIsFullscreen(fullscreen);
        }
      } catch {
        // La fenêtre peut être en cours de fermeture.
      } finally {
        checking = false;
      }
    }

    void win.onResized(() => void syncWindow()).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    }).catch(() => {});

    void syncWindow();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  function revealControls() {
    setShowControls(true);

    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
    }


    hideTimer.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }


  useEffect(() => {
    revealControls();
  }, [url, playbackKey]);

    useEffect(() => {
    setTitleFlash(true);

    const timer = window.setTimeout(() => {
      setTitleFlash(false);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [title, url]);

  async function runAction(
    action: () => Promise<unknown>
  ) {
    if (!initialized.current) return;


    try {
      setNotice("");
      await action();
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : String(caught)
      );
    }


    revealControls();
  }


  async function startAt(position: number) {
    const session = sessionRef.current;


    if (
      !session ||
      !initialized.current ||
      resumeBusyRef.current
    ) {
      return;
    }


    resumeBusyRef.current = true;
    session.restoring = true;
    setResumeBusy(true);
    setNotice("");


    const isCurrent = () =>
      sessionRef.current === session &&
      initialized.current;


    try {
      const loadDeadline = Date.now() + 20000;


      while (isCurrent() && !session.loaded) {
        if (Date.now() > loadDeadline) {
          throw new Error(
            t("player.mediaNotReady")
          );
        }


        await delay(100);
      }


      if (!isCurrent()) return;


      const target =
        session.duration > 0
          ? Math.max(
              0,
              Math.min(position, session.duration - 3)
            )
          : Math.max(0, position);


      await setProperty("pause", true);
      if (!isCurrent()) return;


      await command("seek", [
        target,
        "absolute+exact",
      ]);
      if (!isCurrent()) return;


      const seekDeadline = Date.now() + 15000;


      while (
        isCurrent() &&
        (!session.hasPosition ||
          Math.abs(session.position - target) > 3)
      ) {
        if (Date.now() > seekDeadline) {
          throw new Error(
            t("player.seekNotConfirmed")
          );
        }


        await delay(100);
      }


      if (!isCurrent()) return;


      await setProperty("pause", false);
      if (!isCurrent()) return;


      session.awaitingChoice = false;
      session.restoring = false;
      session.enabled = true;
      session.completed = false;
      session.endedHandled = false;


      setResumeOffer(null);
      setPaused(false);


      if (!persistSession(session)) {
        setNotice(
          t("player.startedButProgressFailed")
        );
      }
    } catch (caught) {
      if (isCurrent()) {
        setNotice(
          caught instanceof Error
            ? caught.message
            : String(caught)
        );
      }
    } finally {
      if (sessionRef.current === session) {
        session.restoring = false;
        resumeBusyRef.current = false;
        setResumeBusy(false);
        revealControls();
      }
    }
  }


  useEffect(() => {
    setOsd(null);
    return () => {
      if (osdTimer.current !== null) {
        window.clearTimeout(osdTimer.current);
        osdTimer.current = null;
      }
    };
  }, [url]);

  function showOsd(kind: "play" | "pause") {
    setOsd(kind);

    if (osdTimer.current !== null) {
      window.clearTimeout(osdTimer.current);
    }

    osdTimer.current = window.setTimeout(() => {
      osdTimer.current = null;
      setOsd(null);
    }, 800);
  }

  function togglePause() {
    if (
      !ready ||
      resumeOffer ||
      resumeBusyRef.current
    ) {
      return;
    }

    // En direct, « lecture » reconnecte au flux si la lecture est restée en
    // pause ou figée : un flux IPTV mis en pause ne reprend pas tout seul.
    if (
      isLive &&
      Date.now() - lastProgressRef.current > LIVE_RECONNECT_MS
    ) {
      reconnectLive();
      return;
    }

    if (sessionRef.current?.completed) {
      showOsd("play");
      void startAt(0);
      return;
    }

    showOsd(paused ? "play" : "pause");

    void runAction(() =>
      command("cycle", ["pause"])
    );
  }

  function seek(seconds: number) {
    if (
      isLive ||
      !ready ||
      resumeOffer ||
      resumeBusyRef.current
    ) {
      return;
    }


    void runAction(() =>
      command("seek", [seconds, "relative"])
    );
  }


  function seekToRatio(ratio: number) {
    if (
      isLive ||
      !ready ||
      resumeOffer ||
      resumeBusyRef.current ||
      !duration ||
      !Number.isFinite(duration)
    ) {
      return;
    }


    const target = Math.max(
      0,
      Math.min(duration, duration * ratio)
    );


    void runAction(() =>
      command("seek", [target, "absolute"])
    );
  }


  function changeVolume(value: number) {
    volumeRef.current = value;
    setVolume(value);


    void runAction(() =>
      setProperty("volume", value)
    );
  }


  function toggleMute() {
    const next = !muted;


    setMuted(next);


    void runAction(() =>
      setProperty("mute", next)
    );


    revealControls();
  }


  async function restorePipWindow() {
    const previous = pipRef.current;
    if (!previous) return;


    const win = getCurrentWindow();


    await win.setAlwaysOnTop(false);
    await win.setDecorations(true);
    await win.setSize(previous.size);
    await win.setPosition(previous.pos);


    if (previous.maximized) await win.maximize();


    pipRef.current = null;
    setIsPip(false);
  }


  async function toggleFullscreen() {
    if (transitionBusyRef.current) return;
    transitionBusyRef.current = true;


    try {
      setNotice("");


      if (pipRef.current) {
        await restorePipWindow();
      }


      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());


      await win.setFullscreen(next);
      setIsFullscreen(next);
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : String(caught)
      );
    } finally {
      transitionBusyRef.current = false;
      revealControls();
    }
  }


  // Mode théâtre : plus de menu autour de la vidéo, mais la fenêtre reste telle quelle
  // (ni plein écran, ni PiP). Échap ou la touche T pour revenir.
  async function toggleTheatre() {
    if (transitionBusyRef.current) return;
    transitionBusyRef.current = true;


    try {
      setNotice("");


      // Le PiP est une petite fenêtre : on la quitte d'abord.
      if (pipRef.current) {
        await restorePipWindow();
      }


      setIsTheatre((current) => !current);
    } finally {
      transitionBusyRef.current = false;
      revealControls();
    }
  }


  // En PiP, on peut déplacer la fenêtre en tirant n'importe où sur la vidéo.
  // Un simple clic (play/pause) reste un clic : le déplacement ne démarre
  // qu'après quelques pixels de mouvement bouton enfoncé.
  const pipPressRef = useRef<{ x: number; y: number } | null>(null);

  function handlePipMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isPip || event.button !== 0) return;

    pipPressRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePipMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    const press = pipPressRef.current;

    if (!press || !isPip) return;

    if (event.buttons !== 1) {
      pipPressRef.current = null;
      return;
    }

    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) {
      return;
    }

    pipPressRef.current = null;

    void getCurrentWindow()
      .startDragging()
      .catch(() => {});
  }

  async function togglePip() {
    if (transitionBusyRef.current) return;
    transitionBusyRef.current = true;


    try {
      setNotice("");


      if (pipRef.current) {
        await restorePipWindow();
        return;
      }


      const win = getCurrentWindow();


      setIsTheatre(false);


      if (await win.isFullscreen()) {
        await win.setFullscreen(false);
        setIsFullscreen(false);
      }


      const maximized = await win.isMaximized();
      if (maximized) await win.unmaximize();


      pipRef.current = {
        size: await win.innerSize(),
        pos: await win.outerPosition(),
        maximized,
      };


      const scale = await win.scaleFactor();
      const monitor = await currentMonitor();


      await win.setMinSize(
        new LogicalSize(320, 180)
      );
      await win.setDecorations(false);
      await win.setAlwaysOnTop(true);
      await win.setSize(
        new LogicalSize(480, 300)
      );


      if (monitor) {
        await win.setPosition(
          new PhysicalPosition(
            Math.round(
              monitor.position.x +
                monitor.size.width -
                500 * scale
            ),
            Math.round(
              monitor.position.y +
                monitor.size.height -
                360 * scale
            )
          )
        );
      }


      setIsPip(true);
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : String(caught)
      );


      if (pipRef.current) {
        try {
          await restorePipWindow();
        } catch {
          // Le bouton PiP permet de réessayer.
        }
      }
    } finally {
      transitionBusyRef.current = false;
      revealControls();
    }
  }


  // Dernier instant où la lecture a avancé : sert à repérer un flux figé.
  const lastProgressRef = useRef(Date.now());

  // Relance le flux (retour au direct).
  function reconnectLive() {
    if (!retryLoadRef.current) return;

    lastProgressRef.current = Date.now();
    showOsd("play");
    void runAction(() => setProperty("pause", false));
    retryLoadRef.current();
  }

  const watchdogRef = useRef({
    paused,
    started,
    resumeOffer: Boolean(resumeOffer),
    reconnect: reconnectLive,
  });

  watchdogRef.current = {
    paused,
    started,
    resumeOffer: Boolean(resumeOffer),
    reconnect: reconnectLive,
  };

  // Un flux en direct qui reste figé est relancé tout seul.
  useEffect(() => {
    if (!isLive || !ready) return;

    let strikes = 0;

    const timer = window.setInterval(() => {
      const state = watchdogRef.current;

      if (
        state.paused ||
        !state.started ||
        state.resumeOffer ||
        Date.now() - lastProgressRef.current < LIVE_STALL_MS
      ) {
        if (Date.now() - lastProgressRef.current < LIVE_STALL_MS) {
          strikes = 0;
        }

        return;
      }

      if (strikes >= 3) return;

      strikes += 1;
      state.reconnect();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [isLive, ready]);

  // Raccourcis clavier du lecteur (mêmes touches que YouTube et VLC) :
  //   Espace / K  lecture - pause        ← / → ou J / L  reculer / avancer de 10 s
  //   Maj + ← / →  ±60 s                 ↑ / ↓  volume    M  muet
  //   F  plein écran    P  image dans l'image    T  mode théâtre
  //   Échap  quitter plein écran / théâtre / PiP
  //   Page haut / bas  chaîne précédente / suivante (en direct)
  const shortcutsRef = useRef({
    togglePause,
    seek,
    changeVolume,
    toggleMute,
    toggleFullscreen,
    togglePip,
    toggleTheatre,
    changeChannel,
    revealControls,
    volume,
    isLive,
    isFullscreen,
    isPip,
    isTheatre,
    resumeOffer: Boolean(resumeOffer),
  });

  shortcutsRef.current = {
    togglePause,
    seek,
    changeVolume,
    toggleMute,
    toggleFullscreen,
    togglePip,
    toggleTheatre,
    changeChannel,
    revealControls,
    volume,
    isLive,
    isFullscreen,
    isPip,
    isTheatre,
    resumeOffer: Boolean(resumeOffer),
  };

  // Bouton « précédent » de la souris : quitte le plein écran, le mode théâtre ou le PiP
  // (hors de ces modes, c'est l'application qui revient à la page précédente).
  useEffect(() => {
    function onMouseUp(event: MouseEvent) {
      if (event.button !== 3) return;

      const s = shortcutsRef.current;

      if (s.isFullscreen) void s.toggleFullscreen();
      else if (s.isTheatre) void s.toggleTheatre();
      else if (s.isPip) void s.togglePip();
    }

    window.addEventListener("mouseup", onMouseUp);

    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  useEffect(() => {
    let spaceHandled = false;

    function onKey(event: KeyboardEvent) {
      const s = shortcutsRef.current;

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const onRange =
        target instanceof HTMLInputElement && target.type === "range";

      // On ne vole pas les touches à un champ de saisie ; le curseur de
      // volume garde ses flèches mais l'Espace reste « pause ».
      if (
        target &&
        !onRange &&
        target.closest(
          'input, textarea, select, [contenteditable="true"]'
        )
      ) {
        return;
      }

      if (event.key === "Escape") {
        if (s.isFullscreen) void s.toggleFullscreen();
        else if (s.isTheatre) void s.toggleTheatre();
        else if (s.isPip) void s.togglePip();

        return;
      }

      // La boîte « reprendre la lecture » garde le clavier pour elle.
      if (s.resumeOffer) return;

      if (onRange && event.key.startsWith("Arrow")) return;

      const key =
        event.key.length === 1 ? event.key.toLowerCase() : event.key;

      switch (key) {
        case " ":
        case "k":
          if (event.repeat) return;

          if (key === " ") spaceHandled = true;

          // Évite qu'Espace n'active en plus le bouton qui a le focus.
          event.preventDefault();
          s.togglePause();
          s.revealControls();
          return;

        case "ArrowLeft":
        case "j":
          if (s.isLive) return;

          event.preventDefault();
          s.seek(event.shiftKey ? -60 : -10);
          s.revealControls();
          return;

        case "ArrowRight":
        case "l":
          if (s.isLive) return;

          event.preventDefault();
          s.seek(event.shiftKey ? 60 : 10);
          s.revealControls();
          return;

        case "ArrowUp":
          event.preventDefault();
          s.changeVolume(Math.min(130, s.volume + 5));
          s.revealControls();
          return;

        case "ArrowDown":
          event.preventDefault();
          s.changeVolume(Math.max(0, s.volume - 5));
          s.revealControls();
          return;

        case "m":
          if (event.repeat) return;

          s.toggleMute();
          return;

        case "f":
          if (event.repeat) return;

          event.preventDefault();
          void s.toggleFullscreen();
          return;

        case "p":
          if (event.repeat) return;

          void s.togglePip();
          return;

        case "t":
          if (event.repeat) return;

          void s.toggleTheatre();
          return;

        case "PageUp":
          if (!s.isLive) return;

          event.preventDefault();
          s.changeChannel("previous");
          return;

        case "PageDown":
          if (!s.isLive) return;

          event.preventDefault();
          s.changeChannel("next");
          return;

        default:
          return;
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key === " " && spaceHandled) {
        spaceHandled = false;
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);


  function handleVideoClick() {
    if (resumeOffer) return;


    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
    }


    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      togglePause();
    }, 250);
  }


  function handleDoubleClick() {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }


    if (isPip) void togglePip();
    else void toggleFullscreen();
  }


  function changeChannel(
    direction: "previous" | "next"
  ) {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }


    if (direction === "previous") {
      onPreviousChannel?.();
    } else {
      onNextChannel?.();
    }


    revealControls();
  }


  function selectAudio(value: string) {
    if (!ready || isLive) return;


    const id =
      value === "auto" ? "auto" : Number(value);
    const session = sessionRef.current;


    manualAudioRef.current = true;


    void runAction(async () => {
      await command("set", ["aid", id]);


      if (sessionRef.current !== session) return;


      setAudioId(id);


      if (!preferenceProfileId) return;


      const current =
        getPlayerPreferences(preferenceProfileId);


      const track = tracks.find(
        (item) =>
          item.type === "audio" && item.id === id
      );


      const success = savePlayerPreferences(
        preferenceProfileId,
        {
          ...current,
          audio: track ? trackPreference(track) : null,
        }
      );


      if (!success) {
        setNotice(
          t("player.audioPrefFailed")
        );
      }
    });
  }


  function selectSub(value: string) {
    if (!ready || isLive) return;


    const id =
      value === "no" ? "no" : Number(value);
    const session = sessionRef.current;


    manualSubRef.current = true;


    void runAction(async () => {
      await command("set", ["sid", id]);


      if (sessionRef.current !== session) return;


      setSubId(id);


      if (!preferenceProfileId) return;


      const current =
        getPlayerPreferences(preferenceProfileId);


      const track = tracks.find(
        (item) =>
          item.type === "sub" && item.id === id
      );


      const success = savePlayerPreferences(
        preferenceProfileId,
        {
          ...current,
          subtitlesMode: id === "no" ? "off" : "preferred",
          subtitles:
            id === "no"
              ? current.subtitles
              : track
              ? trackPreference(track)
              : null,
        }
      );


      if (!success) {
        setNotice(
          t("player.subPrefFailed")
        );
      }
    });
  }


  function trackLabel(track: MpvTrack) {
    const language = track.lang
      ? ` (${track.lang.toUpperCase()})`
      : "";


    return `${
      track.title || `${t("player.track")} ${track.id}`
    }${language}`;
  }


  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-br from-surface-950 via-surface-900 to-surface-800 px-6 text-center text-sm text-red-400">
        {t("player.mpvError")} : {error}
      </div>
    );
  }


  return (
    <div
      className={
        isFullscreen || isPip || isTheatre
          ? "mpv-root fixed inset-0 z-[100] overflow-hidden bg-transparent"
          : "mpv-root relative h-full w-full overflow-hidden rounded-2xl bg-transparent"
      }
      style={{
        cursor:
          showControls || resumeOffer
            ? "default"
            : "none",
      }}
      onMouseMove={revealControls}
      onClick={revealControls}
    >
      <div
        ref={videoRectRef}
        className={`absolute inset-0 ${
          isPip && showControls ? "cursor-move" : ""
        }`}
        onClick={handleVideoClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handlePipMouseDown}
        onMouseMove={handlePipMouseMove}
        onMouseLeave={() => {
          pipPressRef.current = null;
        }}
        onMouseUp={() => {
          pipPressRef.current = null;
        }}
      />

      {title && !isPip && !resumeOffer && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/70 to-transparent px-6 pb-12 pt-5 transition-opacity duration-300 ${
            showControls || titleFlash
              ? "opacity-100"
              : "opacity-0"
          }`}
        >
          <p className="truncate text-lg font-semibold text-white drop-shadow">
            {isLive
              ? getChannelPresentation(title, true).name
              : cleanMovieTitle(title)}
          </p>
        </div>
      )}

      {osd && !resumeOffer && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <div
            key={osd}
            className="mpv-osd-feedback flex h-20 w-20 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md"
          >
            {osd === "pause" ? (
              <Pause className="h-9 w-9" />
            ) : (
              <Play className="h-9 w-9" />
            )}
          </div>
        </div>
      )}

      {isPip && !resumeOffer && (
        <div
          onMouseDown={(event) => {
            if (event.button !== 0) return;


            void getCurrentWindow()
              .startDragging()
              .catch(() => {});
          }}
          className={`absolute inset-x-0 top-0 z-30 h-8 cursor-move bg-gradient-to-b from-black/70 to-transparent transition-opacity ${
            showControls
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        />
      )}


      {(!ready || !started) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-br from-surface-950 via-surface-900 to-surface-800 text-sm text-surface-300">
          {loadFailed ? (
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <p className="text-sm text-red-300">
                {t("player.loadFailed")}
              </p>

              <button
                type="button"
                onClick={() => retryLoadRef.current?.()}
                className="rounded-full bg-accent-600 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-500"
              >
                {t("player.retry")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-surface-900/70 px-4 py-2 backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
              {loadAttempt > 1
                ? `${t("player.retrying")} (${loadAttempt}/3)`
                : t("player.loading")}
            </div>
          )}
        </div>
      )}


      {ready && resumeOffer && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resume-title"
            className="w-full max-w-md rounded-3xl border border-white/10 bg-surface-900/85 p-6 text-white shadow-card backdrop-blur-2xl"
          >
            <h2
              id="resume-title"
              className="text-lg font-semibold"
            >
              {t("player.resumeTitle")}
            </h2>


            <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
              {resumeOffer.title}
            </p>


            <p className="mt-3 text-sm text-zinc-200">
              {t("player.resumeText")}{" "}
              {formatPlaybackTime(
                resumeOffer.position
              )}.
            </p>


            {notice && (
              <p
                role="alert"
                className="mt-3 text-xs leading-5 text-amber-300"
              >
                {notice}
              </p>
            )}


            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={resumeBusy}
                onClick={() =>
                  void startAt(
                    resumeOffer.position
                  )
                }
                className="rounded-full bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-40"
              >
                {resumeBusy
                  ? t("settings.loading")
                  : `${t("player.resume")} ${formatPlaybackTime(
                      resumeOffer.position
                    )}`}
              </button>


              <button
                type="button"
                disabled={resumeBusy}
                onClick={() => void startAt(0)}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-40"
              >
                {t("player.restart")}
              </button>
            </div>
          </div>
        </div>
      )}


      {!resumeOffer && (
        <div
          className={`absolute inset-x-0 bottom-0 z-30 ${
            isPip ? "px-2 pb-2 pt-8" : "px-4 pb-4 pt-16"
          } transition-opacity duration-300 ${
            showControls
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          {notice && (
            <p
              role="alert"
              className="mx-auto mb-3 max-w-5xl rounded-lg bg-black/80 p-2 text-xs text-amber-300"
            >
              {notice}
            </p>
          )}


          <div
            className={`mx-auto max-w-5xl border border-white/10 bg-surface-900/70 shadow-card backdrop-blur-xl ${
              isPip ? "rounded-xl p-1.5" : "rounded-2xl p-3"
            }`}
          >
            {!isLive && (
              <div
                className={`flex items-center text-xs text-zinc-300 ${
                  isPip ? "mb-1.5 gap-2" : "mb-3 gap-3"
                }`}
              >
                <span>
                  {formatPlaybackTime(timePos ?? 0)}
                </span>


                <div
                  className="relative h-4 flex-1 cursor-pointer"
                  onClick={(event) => {
                    const rect =
                      event.currentTarget.getBoundingClientRect();


                    if (rect.width > 0) {
                      seekToRatio(
                        (event.clientX - rect.left) /
                          rect.width
                      );
                    }
                  }}
                >
                  <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent-600 via-accent-500 to-accent-300"
                      style={{
                        width:
                          duration && duration > 0
                            ? `${Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((timePos ?? 0) /
                                    duration) *
                                    100
                                )
                              )}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>


                <span>
                  {formatPlaybackTime(duration ?? 0)}
                </span>
              </div>
            )}


            <div
              className={`flex items-center ${
                isPip ? "gap-1" : "flex-wrap gap-2"
              }`}
            >
              <ControlButton compact={isPip}
                title={
                  isLive
                    ? t("player.previousChannel")
                    : t("player.back10")
                }
                disabled={
                  isLive
                    ? !onPreviousChannel
                    : !ready
                }
                onClick={() =>
                  isLive
                    ? changeChannel("previous")
                    : seek(-10)
                }
              >
                {isLive ? (
                  <SkipBack className="h-4 w-4" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </ControlButton>


              <ControlButton compact={isPip}
                title={t("player.playPause")}
                disabled={!ready || resumeBusy}
                onClick={togglePause}
              >
                {paused ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </ControlButton>


              <ControlButton compact={isPip}
                title={
                  isLive
                    ? t("player.nextChannel")
                    : t("player.forward10")
                }
                disabled={
                  isLive ? !onNextChannel : !ready
                }
                onClick={() =>
                  isLive
                    ? changeChannel("next")
                    : seek(10)
                }
              >
                {isLive ? (
                  <SkipForward className="h-4 w-4" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
              </ControlButton>


              <div className="ml-1 flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  title={
                    muted
                      ? t("player.unmute")
                      : t("player.mute")
                  }
                  aria-label={
                    muted
                      ? t("player.unmute")
                      : t("player.mute")
                  }
                  onClick={toggleMute}
                  className={`flex items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/20 hover:text-white ${
                    isPip ? "h-7 w-7" : "h-8 w-8"
                  }`}
                >
                  {muted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>


                <input
                  aria-label={t("player.volume")}
                  type="range"
                  min={0}
                  max={130}
                  value={volume}
                  disabled={!ready}
                  onChange={(event) =>
                    changeVolume(
                      Number(event.target.value)
                    )
                  }
                  className={`h-2 w-20 cursor-pointer accent-accent-500 sm:w-24 ${
                    isPip ? "hidden" : ""
                  }`}
                />
              </div>


              {isLive && (
                <span
                  title={t("player.live")}
                  className="ml-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-red-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {!isPip && t("player.live")}
                </span>
              )}


              {!isLive && !isPip && (
                <>
                  <select
                    aria-label={t("player.audio")}
                    value={String(audioId)}
                    disabled={!ready}
                    onChange={(event) =>
                      selectAudio(event.target.value)
                    }
                    className="max-w-40 rounded-lg border border-white/20 bg-surface-900 px-2 py-1.5 text-xs text-white outline-none disabled:opacity-40"
                  >
                    <option value="auto">
                      {t("player.defaultAudio")}
                    </option>


                    {tracks
                      .filter(
                        (track) =>
                          track.type === "audio"
                      )
                      .map((track) => (
                        <option
                          key={track.id}
                          value={track.id}
                        >
                          {trackLabel(track)}
                        </option>
                      ))}
                  </select>


                  <select
                    aria-label={t("player.subtitles")}
                    value={String(subId)}
                    disabled={!ready}
                    onChange={(event) =>
                      selectSub(event.target.value)
                    }
                    className="max-w-40 rounded-lg border border-white/20 bg-surface-900 px-2 py-1.5 text-xs text-white outline-none disabled:opacity-40"
                  >
                    <option value="no">
                      {t("player.subtitlesOff")}
                    </option>


                    {tracks
                      .filter(
                        (track) =>
                          track.type === "sub"
                      )
                      .map((track) => (
                        <option
                          key={track.id}
                          value={track.id}
                        >
                          {trackLabel(track)}
                        </option>
                      ))}
                  </select>
                </>
              )}


              <div
                className={`ml-auto flex items-center ${
                  isPip ? "gap-1" : "gap-2"
                }`}
              >
                {!isPip && (
                  <CastMenu
                    streamUrl={url}
                    isLive={isLive}
                    audio={isLive ? null : audioForCast(tracks)}
                    onStarted={() => {
                      if (!paused) togglePause();
                    }}
                  />
                )}

                <ControlButton compact={isPip}
                  title={t("player.theatre")}
                  active={isTheatre}
                  onClick={() => void toggleTheatre()}
                >
                  {/* Un écran large : avec le menu à droite quand il est affiché,
                      seul quand le menu est masqué. */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    {!isTheatre && <line x1="16" y1="5" x2="16" y2="19" />}
                  </svg>
                </ControlButton>


                <ControlButton compact={isPip}
                  title={t("player.pip")}
                  active={isPip}
                  onClick={() => void togglePip()}
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </ControlButton>


                <ControlButton compact={isPip}
                  title={t("player.fullscreen")}
                  onClick={() =>
                    void toggleFullscreen()
                  }
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </ControlButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}