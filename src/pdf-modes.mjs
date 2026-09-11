// Which artefacts one `astromotion-pdf` run produces, and where each goes.
//
// A mode flag is present either bare (`--notes`) or carrying its own output
// path (`--notes=guide.pdf`). Naming none of them means the projection deck,
// which is what every invocation meant before the other modes existed.
//
// The positional output path names one file. When several modes are asked for
// there is nothing for it to name, and quietly applying it to one of them
// would write the others to paths the caller never asked for --- so that
// combination is refused rather than guessed at.

// The suffix each mode's default filename takes, and the order a multi-mode
// run emits in: fixed here rather than taken from the order the flags were
// typed, so the same request always produces the same sequence of files.
export const MODE_SUFFIXES = { slides: "", notes: "-notes", handout: "-handout" };

export const MODES = Object.keys(MODE_SUFFIXES);

export function hasModeFlag(flags, name) {
  return flags.some((f) => f === `--${name}` || f.startsWith(`--${name}=`));
}

/**
 * Resolve the requested modes and their output paths.
 *
 * Returns `{ modes, outputs }` on success, or `{ error }` with a message to
 * print. `resolvePath` is `node:path`'s `resolve` in the bin, and identity in
 * the tests so the assertions stay platform-independent.
 */
export function resolveModes({ flags, positionalOutput, slug, flagValue, resolvePath }) {
  const modes = MODES.filter((m) => hasModeFlag(flags, m));
  if (modes.length === 0) modes.push("slides");

  if (positionalOutput && modes.length > 1) {
    return {
      error:
        `${modes.length} modes were asked for, so the positional output path is ambiguous.\n` +
        `  Give each mode its own: ${modes.map((m) => `--${m}=<path>`).join(" ")}`,
    };
  }

  const outputs = Object.fromEntries(
    modes.map((m) => [
      m,
      resolvePath(flagValue(m) ?? positionalOutput ?? `${slug}${MODE_SUFFIXES[m]}.pdf`),
    ]),
  );
  return { modes, outputs };
}
