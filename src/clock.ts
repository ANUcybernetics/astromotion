// Subtle wall clock for the presenter, bottom-right of the slides.
//
// Presenting on a single (or mirrored) screen means Reveal's speaker view ---
// which carries its own clock --- isn't on show, so there's nowhere to glance
// for the time. `T` toggles a small fixed overlay; it starts hidden, so a deck
// viewed on the web (or exported to PDF) never shows one unless the presenter
// asks for it. Hours and minutes only: seconds tick distractingly in the
// audience's peripheral vision, and "am I running late" is a minute-grained
// question.
//
// The overlay is appended to <body> (so it survives Reveal hiding off-screen
// slides) and positioned in viewport pixels, outside the scaled 1280x720
// canvas --- it stays the same discreet size whatever the display.

// Structural slice of the Reveal API, mirroring the whiteboard's --- keeps
// this module decoupled from reveal.js's awkward default-export typings.
interface RevealKeyBindings {
  addKeyBinding(
    binding: { keyCode: number; key: string; description: string },
    callback: (event: KeyboardEvent) => void,
  ): void;
}

export function formatClock(date: Date): string {
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

// Sleep until the minute actually rolls over rather than polling every second.
// The 50ms cushion keeps a timer that fires a hair early from re-rendering the
// minute it just showed and then waiting a further full minute to catch up.
export function msUntilNextMinute(date: Date): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + 50;
}

export function initClock(deck: RevealKeyBindings): void {
  const el = document.createElement("div");
  el.className = "astromotion-clock";
  el.hidden = true;
  // Decorative for the presenter, and a per-minute live region would be noise.
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);

  let timeout: ReturnType<typeof setTimeout> | undefined;

  const tick = () => {
    const now = new Date();
    el.textContent = formatClock(now);
    timeout = setTimeout(tick, msUntilNextMinute(now));
  };

  const stop = () => {
    clearTimeout(timeout);
    timeout = undefined;
  };

  deck.addKeyBinding({ keyCode: 84, key: "T", description: "Toggle clock" }, () => {
    el.hidden = !el.hidden;
    if (el.hidden) stop();
    else tick();
  });

  // Backgrounded tabs throttle timers, and a laptop that slept wakes with a
  // stale minute on screen --- re-render (and re-arm) as soon as we're visible.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || el.hidden) return;
    stop();
    tick();
  });
}
