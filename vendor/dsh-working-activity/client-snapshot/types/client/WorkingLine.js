import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ACTIVITY_PROJECTION_KEY } from './activity.ts';
import { refreshElapsedSuffix } from './elapsed.js';
import css from './WorkingLine.module.css';
/** Tool-count badge copy (no locale seat: the line text itself is host-composed). */
const TOOLS_LABEL = 'tools this turn';
/** The one live tick attachment (exactly one dock row exists at a time). */
let tickAttachment;
/**
 * Re-tick the elapsed counter on the mounted text node, once per second.
 *
 * The projection only pushes when a committed event folds (measured: three
 * pushes per turn), so the host-rendered `line` ages between folds — the
 * elapsed text would freeze for the length of a tool. The row therefore
 * re-ticks the ONE moving segment locally; only segments matching the host's
 * elapsed shapes are ever replaced (see ./elapsed.ts).
 *
 * Imperative on purpose, and hook-free: the component is also invoked as a
 * plain function (the bundle gate reads its tree without a renderer), and a
 * ref callback plus this module-level slot is enough — React detaches a
 * changed inline ref with `null` first, which is where the previous interval
 * dies; a settled value simply never attaches a new one.
 */
function attachElapsedTick(el, activity) {
    if (tickAttachment !== undefined && (el === null || tickAttachment.el !== el)) {
        clearInterval(tickAttachment.timer);
        tickAttachment = undefined;
    }
    if (el === null || activity === undefined || activity.live !== true)
        return;
    const paint = () => {
        el.textContent = refreshElapsedSuffix(activity.line, activity, Date.now());
    };
    paint();
    tickAttachment = { el, timer: setInterval(paint, 1000) };
}
/**
 * Working-line dock entry: reads the session's latest `workingActivity`
 * projection value and renders the row, or nothing when idle/absent.
 */
export function WorkingLine({ useProjection }) {
    // `undefined` is the uniform absence signal: the host unit is unmounted, no
    // frame carried the key for this session yet, or no session is current.
    // Rendering nothing (rather than an empty row) keeps the dock from reserving
    // space ahead of the first committed event.
    //
    // The annotation is load-bearing: `useProjection`'s precise engine type lives
    // in the session kit's own dependency (`@deepseek-ai/dsh-api-session-controller`),
    // which this package deliberately does not install (it would drag the whole
    // client peer closure into the dev tree). The key is pinned in ./activity.ts
    // against the merged table; this keeps the render body checked against the
    // host's view type.
    const activity = useProjection(ACTIVITY_PROJECTION_KEY);
    if (activity === undefined || activity.phase === 'idle' || activity.line === '')
        return null;
    return (_jsxs("div", { className: css.line, "data-activity-phase": activity.phase, children: [_jsx("span", { className: css.marker, "aria-hidden": "true" }), _jsx("span", { className: css.text, ref: el => attachElapsedTick(el, activity), children: activity.line }), activity.toolCount > 0 && (_jsx("span", { className: css.tools, title: `${activity.toolCount} ${TOOLS_LABEL}`, children: activity.toolCount }))] }));
}
