/**
 * Client-side elapsed re-tick for the working line.
 *
 * The projection is event-driven: the host pushes a value when a committed
 * event folds, and `view` renders at read time. The TUI creates its own
 * cadence by re-reading; a browser cannot, so between folds the shipped
 * `line` ages — measured on the rc.2 corridor, one turn carried three
 * pushes, freezing the elapsed text for the length of a tool. While `live`
 * is true, the dock row therefore re-ticks the ONE moving segment locally:
 * the elapsed counter.
 *
 * Safety: a segment is replaced only when it matches the shapes the host
 * emits (`总1m23s` / `total 5s` / a bare `87ms`). Any format drift on the
 * host side makes the matcher miss and the row falls back to the host's
 * (aging) text — stale, but never wrong. Settled `✓` lines carry a fixed
 * duration, not a counter, and are left alone. This module is deliberately
 * dependency-free: the host's `phrases.ts` reaches node builtins for
 * language detection, which the client bundle's purity gate rejects.
 * @module @deepseek-ai/dsh-working-activity/client/elapsed
 */
/** What the caller knows about the value whose line is displayed. */
export interface ElapsedTickView {
    /** Current phase; only live phases carry a moving counter. */
    readonly phase: 'idle' | 'waiting' | 'thinking' | 'tool' | 'done';
    /** Wall clock the current phase began (the tool counter counts from it). */
    readonly phaseStartedAt: number;
    /** Wall clock the current turn began (the elapsed counter counts from it). */
    readonly turnStartedAt: number;
    /** Language the host rendered `line` in. */
    readonly lang: 'zh' | 'en';
}
/**
 * Replace the line's elapsed segment with one computed at `nowMs`.
 *
 * @param line - The host-rendered line (aged to the last fold).
 * @param view - The value's phase, counters and language.
 * @param nowMs - Wall clock to re-tick to.
 * @returns the line with a current counter, or the input when there is
 * nothing safe to replace.
 */
export declare function refreshElapsedSuffix(line: string, view: ElapsedTickView, nowMs: number): string;
