// Pop Reveal's built-in help overlay the first time a deck is opened in a tab.
//
// Astromotion adds key bindings a viewer has no way to discover --- `W` for the
// whiteboard, `T` for the clock --- and `?` only helps someone who already
// suspects there's help. Showing the overlay once, unprompted, is the cheapest
// way to teach them.
//
// Scoped to sessionStorage rather than localStorage: a "seen" flag that
// outlives the tab would suppress the overlay months later for someone who has
// long forgotten the keys, and would need invalidating every time a binding is
// added. Per-tab means a fresh tab is treated as a fresh viewer, and a reload
// (which sessionStorage survives) isn't.

// Structural slice of the Reveal API, mirroring the clock's and whiteboard's
// --- keeps this module decoupled from reveal.js's awkward default-export
// typings.
//
// The two predicates are optional and called optionally on purpose. reveal.js
// 6.0.1 ships a `dist/reveal.d.ts` that still declares the 5.x
// `isPrintingPDF()`, which no longer exists at runtime --- calling it throws,
// and inside the `initialize().then()` chain that rejection is swallowed, so
// the deck looks fine while this module silently never runs. Optional calls
// mean a future rename degrades to "guard skipped" rather than "help never
// shows"; `print-pdf` in the URL backstops the print-view case regardless.
interface RevealHelp {
  isSpeakerNotes?: () => boolean;
  isPrintView?: () => boolean;
  toggleHelp(override?: boolean): void;
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
// sandboxed iframes) would otherwise re-show the overlay on every single load.
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

export function isSuppressedView(search: string): boolean {
  return new URLSearchParams(search).has("print-pdf");
}

// Call after every other key binding is registered: Reveal builds the overlay's
// table from the bindings present at the moment it's shown, so a binding
// registered later won't be listed.
export function initFirstRunHelp(deck: RevealHelp): void {
  // The speaker view loads the deck in an iframe, and ?print-pdf renders every
  // slide at once --- neither wants an overlay.
  if (deck.isSpeakerNotes?.() || deck.isPrintView?.()) return;
  if (isSuppressedView(location.search)) return;
  if (!claimFirstView(sessionStore(), helpSeenKey(location.pathname))) return;
  deck.toggleHelp(true);
}
