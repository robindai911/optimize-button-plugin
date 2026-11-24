/**
 * dsh-prompt-optimizer — browser half.
 *
 * Hand-written DSH client bundle. Every constraint below is enforced by the host,
 * not by convention:
 *
 *   1. Classic script: executing it only REGISTERS a factory. No `import`/`export`.
 *   2. Several bundles are concatenated into ONE combo script, so nothing may be
 *      declared at top level except the single `window.__ModuleLoader__.load(...)`
 *      statement below — a duplicate top-level `let`/`const`/`class` across
 *      bundles is a SyntaxError that kills the whole batch.
 *   3. `id` must equal the package name from package.json.
 *   4. `factory` RETURNS the module exports; `apply` is required and `inject`
 *      names cordis services. Only `slots` is listed: it is provided by the
 *      renderer and is the one service this half needs, so a missing service
 *      elsewhere can never strand this entry in `loading`.
 *   5. `require` resolves only the frozen platform seed table, so only those
 *      specifiers are requested here.
 *
 * Seat contract (read out of dsh-client-ui-conversation): the
 * `conversation.input.right` slot is `{ kind: 'list', scope: 'session' }` — the
 * composer's trailing `standardControls` row, i.e. the seat the owner documents
 * as "compact controls before the composer submit action" — and a
 * session-scoped entry receives the props the conversation declares through
 * `uiSession.provide`: the `input`/`conversation` stores arrive as the hook props
 * `useInput`/`useConversation`, plus the `inputActions` facade. Draft access is
 * therefore `useInput(s => s).draft`, and the write is
 * `inputActions.setDraft(text)` — which sets the composer text and never submits.
 *
 * Icon: the button shows a rocket. DSH's icon library ships no rocket glyph, so
 * the Tabler `rocket` outline path is inlined inside the factory under its MIT
 * notice — see `IconRocketOutlineArtwork`. No new dependency, no new asset file.
 */

window.__ModuleLoader__.load({
	id: "dsh-prompt-optimizer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var jsxRuntime = require("react/jsx-runtime");
		var jsx = jsxRuntime.jsx;
		var jsxs = jsxRuntime.jsxs;
		var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var Button = primitives.Button;
		var Menu = primitives.Menu;
		var IconChevronDown = primitives.IconChevronDownOutlineRegular;

		/**
		 * Rocket artwork, inlined here rather than imported.
		 *
		 * DSH's icon library ships 88 glyphs and contains no rocket (checked:
		 * zero matches for rocket/launch/astronaut/boost across
		 * `@deepseek-ai/dsh-client-ui-primitives`), so this is the Tabler Icons
		 * `rocket` outline path (v3.46.0), redrawn to DSH's own icon convention:
		 * a `size` prop defaulting to 16, `currentColor` strokes, and a stroke
		 * weight scaled for the 24x24 viewBox so it reads like DSH's Regular
		 * glyphs (Tabler's 2px at 24 => ~1.33px at DSH's 16px grid).
		 *
		 * Source: .dsh/skills/ppt-master/templates/icons/tabler-outline/rocket.svg
		 * License: MIT — Tabler Icons, Copyright (c) 2020-2026 Paweł Kuna
		 * (see that bundle's THIRD_PARTY_NOTICES.md). No new dependency and no new
		 * file: only the path data below is added.
		 *
		 * @param props - `{ size?, className?, strokeWidth? }`.
		 * @returns the rocket glyph.
		 */
		function IconRocketOutlineArtwork(props) {
			var size = props && props.size !== undefined ? props.size : 16;
			return jsxs("svg", {
				width: size,
				height: size,
				className: props ? props.className : undefined,
				viewBox: "0 0 24 24",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				strokeWidth: props ? props.strokeWidth : undefined,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				children: [
					jsx("path", {
						d: "M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3",
						stroke: "currentColor",
					}),
					jsx("path", {
						d: "M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3",
						stroke: "currentColor",
					}),
					jsx("path", {
						d: "M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0",
						stroke: "currentColor",
					}),
				],
			});
		}

		/**
		 * Regular-weight rocket icon, shaped like the `Icon<Name>OutlineRegular`
		 * exports so call sites read identically.
		 *
		 * @param props - icon props.
		 * @returns the rocket glyph at regular weight.
		 */
		function IconRocketOutlineRegular(props) {
			return jsx(IconRocketOutlineArtwork, {
				size: props ? props.size : undefined,
				className: props ? props.className : undefined,
				strokeWidth: 1.35,
			});
		}

		/** Endpoint served by this package's host half. */
		var ENDPOINT = "/prompt-optimizer/optimize";

		/**
		 * Composer seat: a `list`, `session`-scoped slot in the same trailing
		 * `standardControls` row as the submit action, with no shipped occupants.
		 */
		var SLOT = "conversation.input.right";

		/** `slots` comes from the renderer; nothing else is required. */
		var inject = ["slots"];

		/** Phases in which the composer owns the draft and must not be rewritten. */
		var BUSY_PHASES = { adjudicating: true, submitting: true };

		/** Bound on the inline error text; the full message stays in the tooltip. */
		var ERROR_PREVIEW_CHARS = 48;

		/**
		 * Optimization modes, in menu order. Ids must match the host half's
		 * registry; labels are presentation only.
		 */
		var MODES = [
			{ id: "precise", label: "默认（精确）" },
			{ id: "concise", label: "压缩精简" },
			{ id: "structured", label: "结构化" },
			{ id: "creative", label: "创意扩展" },
			{ id: "translate", label: "翻译并优化" },
			{ id: "code", label: "代码请求" },
		];
		var MODE_IDS = MODES.map(function (entry) {
			return entry.id;
		});
		var DEFAULT_MODE = "precise";

		/** Target languages the host half accepts for the translate mode. */
		var TARGET_LANGUAGES = ["中文", "English", "日本語", "한국어"];
		var DEFAULT_LANGUAGE = "中文";

		/** Menu-row id prefix that marks a target-language row. */
		var LANGUAGE_PREFIX = "language:";

		/** Where the last used mode and target language are remembered. */
		var MODE_KEY = "dsh.prompt-optimizer.mode";
		var LANGUAGE_KEY = "dsh.prompt-optimizer.targetLanguage";

		/**
		 * Read a remembered preference, ignoring anything outside `allowed`.
		 *
		 * @param key - storage key.
		 * @param fallback - value used when nothing valid is stored.
		 * @param allowed - whitelist of acceptable values.
		 * @returns the stored value, or the fallback.
		 */
		function readStored(key, fallback, allowed) {
			try {
				var value = window.localStorage.getItem(key);
				return value !== null && allowed.indexOf(value) >= 0 ? value : fallback;
			} catch (storageUnavailable) {
				return fallback;
			}
		}

		/**
		 * Remember a preference. Best-effort: storage may be unavailable.
		 *
		 * @param key - storage key.
		 * @param value - value to store.
		 */
		function writeStored(key, value) {
			try {
				window.localStorage.setItem(key, value);
			} catch (storageUnavailable) {
				/* a lost preference is not worth surfacing */
			}
		}

		/**
		 * Human label for one mode id.
		 *
		 * @param id - mode id.
		 * @returns the label, falling back to the raw id.
		 */
		function modeLabel(id) {
			for (var index = 0; index < MODES.length; index++) {
				if (MODES[index].id === id) return MODES[index].label;
			}
			return id;
		}

		/**
		 * Register the button into the composer's trailing control row, beside the
		 * submit action.
		 *
		 * `ctx.slots.inject` waits for the slot's declaration lifetime, so this is
		 * independent of plugin load order, and `slots.register` is already
		 * effect-owned on this fiber: HMR/unload disposes the entry.
		 *
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.slots.inject(SLOT, () =>
				ctx.slots.register(
					{
						name: SLOT,
						id: "prompt-optimizer",
						order: 100,
						label: "优化提示词",
					},
					OptimizeButton,
				),
			);
		}

		/**
		 * Guard wrapper: holds no hooks, so bailing out when the seat does not supply
		 * the standard session props is unconditionally safe (no hook-order risk).
		 *
		 * @param props - standard session-scope slot props.
		 * @returns the button subtree, or null when the seat is unusable.
		 */
		function OptimizeButton(props) {
			var useInput = props ? props.useInput : undefined;
			var inputActions = props ? props.inputActions : undefined;
			if (
				typeof useInput !== "function" ||
				inputActions === undefined ||
				inputActions === null ||
				typeof inputActions.setDraft !== "function"
			) {
				return null;
			}
			return jsx(OptimizeButtonBody, { useInput: useInput, inputActions: inputActions });
		}

		/**
		 * The button plus its inline error slot.
		 *
		 * Reads the live draft through `useInput`, writes the rewrite through
		 * `inputActions.setDraft`, and never submits. Clicking while a rewrite is in
		 * flight cancels it instead of starting a second one.
		 *
		 * @param props - `{ useInput, inputActions }`.
		 * @returns the button row.
		 */
		function OptimizeButtonBody(props) {
			var useInput = props.useInput;
			var inputActions = props.inputActions;

			var input = useInput(function (state) {
				return state;
			});
			var busyPair = React.useState(false);
			var busy = busyPair[0];
			var setBusy = busyPair[1];
			var errorPair = React.useState(null);
			var error = errorPair[0];
			var setError = errorPair[1];
			var noticePair = React.useState(null);
			var notice = noticePair[0];
			var setNotice = noticePair[1];
			var modePair = React.useState(function () {
				return readStored(MODE_KEY, DEFAULT_MODE, MODE_IDS);
			});
			var mode = modePair[0];
			var setMode = modePair[1];
			var languagePair = React.useState(function () {
				return readStored(LANGUAGE_KEY, DEFAULT_LANGUAGE, TARGET_LANGUAGES);
			});
			var targetLanguage = languagePair[0];
			var setTargetLanguage = languagePair[1];
			var openPair = React.useState(false);
			var open = openPair[0];
			var setOpen = openPair[1];
			var abortRef = React.useRef(null);

			var phase = input ? input.phase : undefined;
			var draft = input && typeof input.draft === "string" ? input.draft : "";
			// `setDraft` carries no phase guard of its own, so gate here.
			var settling = phase !== undefined && BUSY_PHASES[phase] === true;
			var empty = draft.trim() === "";
			var disabled = settling || (!busy && empty);

			// Latest draft, so a slow rewrite cannot clobber text typed meanwhile.
			var draftRef = React.useRef(draft);
			draftRef.current = draft;

			// Run one rewrite. The draft is read through the ref so a menu picked a
			// moment ago always acts on the text that is there now.
			var run = React.useCallback(
				function (runMode, runLanguage) {
					if (settling || busy) return;
					var source = draftRef.current;
					if (source.trim() === "") return;

					var controller = new AbortController();
					abortRef.current = controller;
					setBusy(true);
					setError(null);
					setNotice(null);

					var payload = { prompt: source, mode: runMode };
					if (runMode === "translate") payload.targetLanguage = runLanguage;

					fetch(ENDPOINT, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload),
						signal: controller.signal,
					})
						.then(function (response) {
							return response.json().then(
								function (data) {
									return { ok: response.ok, data: data };
								},
								function () {
									return { ok: false, data: null };
								},
							);
						})
						.then(function (result) {
							var data = result.data;
							if (!result.ok || !data || data.ok !== true || typeof data.prompt !== "string") {
								throw new Error((data && data.error) || "优化请求失败");
							}
							var text = data.prompt.trim();
							if (text === "") throw new Error("模型没有返回内容");
							if (draftRef.current !== source) {
								setError("草稿已被修改，结果未覆盖");
								return;
							}
							inputActions.setDraft(text);
							if (data.truncated === true) setNotice("结果可能被截断");
						})
						.catch(function (failure) {
							if (controller.signal.aborted) return;
							var message = failure && failure.message ? failure.message : String(failure);
							setError(message);
							if (typeof console !== "undefined" && console.warn) {
								console.warn("[prompt-optimizer] " + message);
							}
						})
						.then(function () {
							if (abortRef.current === controller) abortRef.current = null;
							setBusy(false);
						});
				},
				[busy, settling],
			);

			/** Abort the in-flight rewrite. */
			var cancel = React.useCallback(function () {
				var running = abortRef.current;
				abortRef.current = null;
				if (running) running.abort();
			}, []);

			// The rocket button acts immediately: idle it runs the current mode, busy
			// it cancels the in-flight rewrite. The picker moved to the chevron beside
			// it, so a rewrite is always exactly one click away.
			var onRun = React.useCallback(
				function () {
					if (busy) {
						cancel();
						return;
					}
					if (settling || empty) return;
					run(mode, targetLanguage);
				},
				[busy, cancel, settling, empty, run, mode, targetLanguage],
			);

			/** The chevron only opens the mode picker; it never rewrites by itself. */
			var onMenuToggle = React.useCallback(
				function () {
					if (busy || settling) return;
					setOpen(function (wasOpen) {
						return !wasOpen;
					});
				},
				[busy, settling],
			);

			/**
			 * Pick a mode: remember it and close the picker. It deliberately does NOT
			 * rewrite — the rocket is the only control that starts one, so choosing a
			 * mode never spends a model call by surprise.
			 */
			var chooseMode = React.useCallback(function (nextMode) {
				setMode(nextMode);
				writeStored(MODE_KEY, nextMode);
			}, []);

			/** Pick the translate target language. This only sets it, never runs. */
			var chooseLanguage = React.useCallback(function (nextLanguage) {
				setTargetLanguage(nextLanguage);
				writeStored(LANGUAGE_KEY, nextLanguage);
			}, []);

			var title = error
				? "优化失败：" + error
				: busy
					? "正在优化提示词…点击取消"
					: settling
						? "会话正在处理上一条消息"
						: empty
							? "先输入提示词，再用 AI 优化"
							: "优化提示词 · 当前模式：" + modeLabel(mode);

			var button = jsx(Button, {
				key: "button",
				variant: "ghost",
				size: "sm",
				icon: jsx(IconRocketOutlineRegular, {}),
				disabled: disabled,
				title: title,
				"aria-label": busy ? "取消优化" : "优化提示词",
				onClick: onRun,
				children: busy ? "取消" : "优化",
			});

			// Split control — the shape `dsh-client-ui-open-in-app` ships: the rocket
			// executes on click, the chevron only opens the mode picker. `Menu` anchors
			// to this whole span, so the popup lines up with the control either way.
			var trigger = jsxs("span", {
				key: "trigger",
				style: { display: "inline-flex", alignItems: "center" },
				children: [
					button,
					jsx(Button, {
						key: "chevron",
						variant: "ghost",
						size: "sm",
						icon: jsx(IconChevronDown, {}),
						disabled: settling || busy,
						title: "选择优化模式（当前：" + modeLabel(mode) + "）",
						"aria-haspopup": "menu",
						"aria-expanded": open && !busy,
						"aria-label": "选择优化模式",
						onClick: onMenuToggle,
					}),
				],
			});

			// One data-row list: the six mode actions, a hairline, then the four
			// translate target languages. `Menu` owns placement, portaling (the
			// composer stack clips in-place popups), outside-pointer/Escape
			// dismissal, the keyboard walk and focus return, so this half only
			// supplies the rows, the trigger and the open state. `selectedIds`
			// marks the current mode and language independently.
			var items = MODES.map(function (entry) {
				return { id: entry.id, label: entry.label };
			});
			items.push({ type: "separator", id: "language-separator" });
			TARGET_LANGUAGES.forEach(function (language) {
				items.push({ id: LANGUAGE_PREFIX + language, label: "翻译目标：" + language });
			});

			var onSelect = function (id) {
				setOpen(false);
				if (id.indexOf(LANGUAGE_PREFIX) === 0) {
					// A language row only records the preference; it never rewrites.
					chooseLanguage(id.slice(LANGUAGE_PREFIX.length));
					return;
				}
				chooseMode(id);
			};

			var menu = jsx(Menu, {
				key: "menu",
				open: open && !busy,
				onClose: function () {
					setOpen(false);
				},
				anchor: trigger,
				items: items,
				selectedIds: [mode, LANGUAGE_PREFIX + targetLanguage],
				onSelect: onSelect,
				align: "end",
				side: "top",
				portal: true,
				dense: true,
			});

			var tail = null;
			if (error) {
				tail = jsx(
					"span",
					{
						key: "error",
						title: error,
						style: {
							color: "var(--dsh-color-danger, #e5484d)",
							fontSize: "12px",
							maxWidth: "180px",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						},
					},
					error.length > ERROR_PREVIEW_CHARS ? error.slice(0, ERROR_PREVIEW_CHARS - 1) + "…" : error,
				);
			} else if (notice) {
				tail = jsx(
					"span",
					{
						key: "notice",
						title: notice,
						style: {
							color: "var(--dsh-color-warning, #b7791f)",
							fontSize: "12px",
							whiteSpace: "nowrap",
						},
					},
					notice,
				);
			}

			return jsxs("span", {
				style: { display: "inline-flex", alignItems: "center", gap: "6px", minWidth: 0 },
				children: tail === null ? [menu] : [menu, tail],
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
