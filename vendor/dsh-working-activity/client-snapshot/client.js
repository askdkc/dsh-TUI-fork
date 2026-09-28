window.__ModuleLoader__.load({
	id: "dsh-working-activity",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/activity.ts
		/**
		* The projection key this package reads, checked against the merged table: a
		* rename on the host side, or a merge that silently failed to land, is a
		* compile error here instead of a dock row that never renders.
		*/
		const ACTIVITY_PROJECTION_KEY = "workingActivity";
		//#endregion
		//#region src/client/elapsed.ts
		/** The duration shapes the host emits: `87ms`, `5s`, `1m23s`, `4h0m`. */
		const DURATION = /^\d+(?:ms|s|m\d+s|h\d+m)$/;
		/** The localized elapsed segment: `总5s`, `total 1m23s`. */
		const ELAPSED = /^(?:总|total )\d+(?:ms|s|m\d+s|h\d+m)$/;
		/** The segment separator the host composes the line with. */
		const SEP = " · ";
		/** Mirror of the host's `fmtDuration` (second granularity and shapes). */
		function formatDuration(ms) {
			if (ms < 1e3) return "0s";
			const total = Math.floor(ms / 1e3);
			if (total < 60) return `${total}s`;
			const minutes = Math.floor(total / 60);
			const seconds = total % 60;
			if (minutes < 60) return `${minutes}m${seconds}s`;
			return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
		}
		/** Mirror of the host's `durationLabel` (sub-second reads in milliseconds). */
		function formatCounter(ms) {
			return ms < 1e3 ? `${Math.max(0, Math.floor(ms))}ms` : formatDuration(ms);
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
		function refreshElapsedSuffix(line, view, nowMs) {
			if (view.phase === "idle" || view.phase === "done") return line;
			if (line.startsWith("✓ ")) return line;
			const since = view.phase === "tool" ? view.phaseStartedAt : view.turnStartedAt;
			if (!(since > 0)) return line;
			const elapsed = Math.max(0, nowMs - since);
			const replacement = view.phase === "tool" ? formatCounter(elapsed) : view.lang === "en" ? `total ${formatDuration(elapsed)}` : `总${formatDuration(elapsed)}`;
			const segments = line.split(SEP);
			for (let i = segments.length - 1; i > 0; i--) {
				const segment = segments[i];
				if (segment !== void 0 && (DURATION.test(segment) || ELAPSED.test(segment))) {
					segments[i] = replacement;
					return segments.join(SEP);
				}
			}
			return line;
		}
		//#endregion
		//#region \0dsh-css:src/client/WorkingLine.module.css.mjs
		const css = ".TG_uoa_line{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width);font-family:var(--dsw-font-family);color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;margin:0 auto;padding:4px 16px 0;font-size:13px;line-height:18px;display:flex}.TG_uoa_marker{background:var(--dsw-alias-label-tertiary);border-radius:50%;flex:none;width:7px;height:7px;animation:1.6s ease-in-out infinite TG_uoa_working-pulse}.TG_uoa_line[data-activity-phase=done] .TG_uoa_marker{background:var(--dsw-alias-state-business-primary);animation:none}.TG_uoa_line[data-activity-phase=tool] .TG_uoa_marker{background:var(--dsw-alias-state-business-primary)}.TG_uoa_line[data-activity-phase=waiting] .TG_uoa_marker{background:var(--dsw-alias-label-tertiary);opacity:.6}.TG_uoa_text{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.TG_uoa_tools{background:var(--dsw-alias-surface-tertiary);min-width:18px;color:var(--dsw-alias-label-secondary);text-align:center;border-radius:9px;flex:none;padding:0 5px;font-size:11px;line-height:18px}@keyframes TG_uoa_working-pulse{0%,to{opacity:1}50%{opacity:.35}}";
		const tagId = "dsh-working-activity/WorkingLine.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-working-activity";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WorkingLine_module_css_default = {
			"line": "TG_uoa_line",
			"marker": "TG_uoa_marker",
			"working-pulse": "TG_uoa_working-pulse",
			"text": "TG_uoa_text",
			"tools": "TG_uoa_tools"
		};
		//#endregion
		//#region src/client/WorkingLine.tsx
		/** Tool-count badge copy (no locale seat: the line text itself is host-composed). */
		const TOOLS_LABEL = "tools this turn";
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
			if (tickAttachment !== void 0 && (el === null || tickAttachment.el !== el)) {
				clearInterval(tickAttachment.timer);
				tickAttachment = void 0;
			}
			if (el === null || activity === void 0 || activity.live !== true) return;
			const paint = () => {
				el.textContent = refreshElapsedSuffix(activity.line, activity, Date.now());
			};
			paint();
			tickAttachment = {
				el,
				timer: setInterval(paint, 1e3)
			};
		}
		/**
		* Working-line dock entry: reads the session's latest `workingActivity`
		* projection value and renders the row, or nothing when idle/absent.
		*/
		function WorkingLine({ useProjection }) {
			const activity = useProjection(ACTIVITY_PROJECTION_KEY);
			if (activity === void 0 || activity.phase === "idle" || activity.line === "") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: WorkingLine_module_css_default.line,
				"data-activity-phase": activity.phase,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: WorkingLine_module_css_default.marker,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: WorkingLine_module_css_default.text,
						ref: (el) => attachElapsedTick(el, activity),
						children: activity.line
					}),
					activity.toolCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: WorkingLine_module_css_default.tools,
						title: `${activity.toolCount} ${TOOLS_LABEL}`,
						children: activity.toolCount
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services for the dock registration. */
		const inject = ["slots"];
		/**
		* Client plugin body: the working-line dock entry.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "activity",
				order: 15,
				registrant: "dsh-working-activity"
			}, WorkingLine));
		}
		//#endregion
		exports.WorkingLine = WorkingLine;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map