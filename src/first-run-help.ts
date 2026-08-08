// Greet the first view of a deck in a tab with a short note saying what this
// page is and how to drive it.
//
// The obvious implementation --- popping Reveal's own help overlay via
// `toggleHelp(true)` --- teaches the bindings but reads as an error dialog: a
// full-screen black sheet of a shortcut table, unstyled by the deck's theme,
// dumped on someone who has just clicked a link. This shows a small themed
// card instead, names the two keys that matter, and points at `?` for the rest,
// which is where the exhaustive table belongs.
//
// The card is deliberately not a real modal: no focus trap, no `<dialog>`,
// nothing that intercepts keys. Reveal listens for navigation on `document`,
// so pressing an arrow both dismisses the card and advances the slide --- the
// hint gets out of the way by being obeyed.
//
// Scoped to sessionStorage rather than localStorage: a "seen" flag that
// outlives the tab would suppress the note months later for someone who has
// long forgotten the keys. Per-tab means a fresh tab is treated as a fresh
// viewer, and a reload (which sessionStorage survives) isn't.

// Structural slice of the Reveal API, mirroring the clock's and whiteboard's
// --- keeps this module decoupled from reveal.js's awkward default-export
// typings.
//
// The two predicates are optional and called optionally on purpose. reveal.js
// 6.0.1 ships a `dist/reveal.d.ts` that still declares the 5.x
// `isPrintingPDF()`, which no longer exists at runtime --- calling it throws,
// and inside the `initialize().then()` chain that rejection is swallowed, so
// the deck looks fine while this module silently never runs. Optional calls
// mean a future rename degrades to "guard skipped" rather than "hint never
// shows"; `print-pdf` in the URL backstops the print-view case regardless.
interface RevealHelp {
  isSpeakerNotes?: () => boolean;
  isPrintView?: () => boolean;
}

type ViewedStore = Pick<Storage, "getItem" | "setItem">;

export function helpSeenKey(pathname: string): string {
  return `astromotion:help-seen:${pathname}`;
}

// Keyed by pathname so a second deck opened in the same tab still gets its one
// showing --- decks are usually arrived at one link at a time.
//
// Claim-and-record in one step: returns true only for the first caller, and
// false whenever storage is unavailable. Failing closed matters more than
// failing open here; a browser that rejects sessionStorage (private modes,
// sandboxed iframes) would otherwise re-show the card on every single load.
export function claimFirstView(storage: ViewedStore | undefined, key: string): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

function sessionStore(): ViewedStore | undefined {
  // Reading the property itself throws in some sandboxed iframes, so this can't
  // wait for the getItem call inside claimFirstView.
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
}

// Two different "this isn't a human reading a deck" URL flags, easy to conflate:
// `print-pdf` is Reveal's own print view, which astromotion doesn't use, and
// `astromotion-export` is what `astromotion-pdf` actually loads a deck with.
// The card doesn't swallow keys the way Reveal's overlay did, so it no longer
// truncates a decktape export --- but it would still be painted over the first
// page of every PDF, so both stay suppressed.
export function isSuppressedView(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has("print-pdf") || params.has("astromotion-export");
}

// Any browser being driven programmatically --- decktape, `astromotion-check`,
// a consumer's screenshot job --- is not a viewer who needs teaching the key
// bindings, and a card over the first slide would be read as slide content.
function isAutomatedView(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

// Long enough to read twice at a glance, short enough that a deck left up on a
// projector while the room fills is clean by the time anyone looks at it.
const AUTO_DISMISS_MS = 12_000;

function buildHint(): HTMLElement {
  const el = document.createElement("div");
  el.className = "astromotion-help-hint";
  // A polite live region rather than a dialog: there is nothing to focus and
  // nothing to trap, so announcing it once and moving on is the honest
  // semantic, and it keeps the tab order the deck's own.
  el.setAttribute("role", "status");

  const card = document.createElement("div");
  card.className = "astromotion-help-hint-card";
  card.innerHTML = `
    <p class="astromotion-help-hint-lead">This is a <strong>reveal.js</strong> slide deck.</p>
    <p class="astromotion-help-hint-keys">
      Use <kbd>&larr;</kbd> <kbd>&rarr;</kbd> to move through the slides,
      or press <kbd>?</kbd> for all the shortcuts.
    </p>
    <p class="astromotion-help-hint-dismiss">press any key or click to continue</p>
  `;
  el.appendChild(card);
  return el;
}

export function initFirstRunHelp(deck: RevealHelp): void {
  // The speaker view loads the deck in an iframe, and ?print-pdf renders every
  // slide at once --- neither wants the card.
  if (deck.isSpeakerNotes?.() || deck.isPrintView?.()) return;
  if (isSuppressedView(location.search) || isAutomatedView()) return;
  if (!claimFirstView(sessionStore(), helpSeenKey(location.pathname))) return;

  const el = buildHint();
  document.body.appendChild(el);

  let timeout: ReturnType<typeof setTimeout> | undefined;

  const dismiss = () => {
    clearTimeout(timeout);
    document.removeEventListener("keydown", dismiss, true);
    document.removeEventListener("pointerdown", dismiss, true);
    el.dataset.leaving = "";
    // Remove on the fade's own event rather than a matching timeout, so a
    // theme that shortens (or a reduced-motion setting that removes) the
    // transition doesn't leave a transparent overlay sitting over the slide.
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 1000);
  };

  // Capture phase, so the card is gone the moment a key is pressed even if
  // something downstream stops the event; Reveal's own document listener still
  // sees the key and acts on it.
  document.addEventListener("keydown", dismiss, true);
  document.addEventListener("pointerdown", dismiss, true);
  timeout = setTimeout(dismiss, AUTO_DISMISS_MS);

  // Paint one frame with the card in its entry state so the fade-in actually
  // runs; adding the class in the same frame as the element is a no-op.
  requestAnimationFrame(() => {
    el.dataset.shown = "";
  });
}
