/* ==========================================================================
   analytics.js — Pendo Track Events
   --------------------------------------------------------------------------
   The one place that talks to the Pendo agent. Load it before auth.js on
   every page. Each call is a no-op when the agent isn't on the page, and
   none of them throw: analytics must never break the flow it measures.

   Event properties never include passwords, email addresses, or names.
   ========================================================================== */

(function (global) {
	"use strict";

	const PokeDex = (global.PokeDex = global.PokeDex || {});

	const PENDING_KEY = "pokedex.analytics.pending";
	const MAX_STRING_LENGTH = 100;
	const READY_POLL_MS = 500;
	const READY_POLL_LIMIT = 20; // ~10s, after which the next page load retries

	/* --- sending ----------------------------------------------------------- */

	// Pendo caps the size of an event's properties, so free text (search
	// terms, error messages) is trimmed rather than risk losing the event.
	// Undefined values are dropped.
	function clip(properties) {
		const clipped = {};
		Object.keys(properties || {}).forEach(function (key) {
			const value = properties[key];
			if (value === undefined) return;
			clipped[key] = typeof value === "string" ? value.slice(0, MAX_STRING_LENGTH) : value;
		});
		return clipped;
	}

	/**
	 * Sends a Track Event. Until the agent has loaded, the install snippet's
	 * stub queues the call and replays it once the agent is up.
	 */
	function track(name, properties) {
		const pendo = global.pendo;
		if (!pendo || typeof pendo.track !== "function") return;

		try {
			pendo.track(name, clip(properties));
		} catch (err) {
			global.console.warn("Pendo track failed:", err);
		}
	}

	/**
	 * Attributes what follows to the signed-in user rather than the anonymous
	 * visitor. Keyed by email, the only unique field on the user object.
	 */
	function identify(user) {
		const pendo = global.pendo;
		if (!pendo || typeof pendo.identify !== "function" || !user || !user.email) return;

		try {
			pendo.identify({ visitor: { id: user.email } });
		} catch (err) {
			global.console.warn("Pendo identify failed:", err);
		}
	}

	/* --- deferred events --------------------------------------------------- */

	// The snippet's queue dies with the page, so an event raised just before
	// a redirect is usually lost. Deferred events wait in sessionStorage until
	// the agent reports ready, on this page or a later one in the same tab.

	function readPending() {
		try {
			const pending = JSON.parse(global.sessionStorage.getItem(PENDING_KEY));
			return Array.isArray(pending) ? pending : [];
		} catch (err) {
			return [];
		}
	}

	function writePending(pending) {
		try {
			if (pending.length) {
				global.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
			} else {
				global.sessionStorage.removeItem(PENDING_KEY);
			}
		} catch (err) {
			/* storage blocked — the event is dropped, nothing else breaks */
		}
	}

	function isAgentReady() {
		try {
			const pendo = global.pendo;
			return Boolean(pendo && typeof pendo.isReady === "function" && pendo.isReady());
		} catch (err) {
			return false;
		}
	}

	let pollTimer = null;

	function flushPending(attempt) {
		global.clearTimeout(pollTimer);

		const pending = readPending();
		if (!pending.length) return;

		if (!isAgentReady()) {
			if (attempt < READY_POLL_LIMIT) {
				pollTimer = global.setTimeout(function () {
					flushPending(attempt + 1);
				}, READY_POLL_MS);
			}
			return;
		}

		// Cleared before sending, so nothing can go out twice.
		writePending([]);
		pending.forEach(function (event) {
			track(event.name, event.properties);
		});
	}

	/**
	 * track() for when the page may be about to redirect: the event is sent
	 * as soon as the agent is ready, which may be on the next page.
	 */
	function trackWhenReady(name, properties) {
		const pending = readPending();
		pending.push({ name: name, properties: properties });
		writePending(pending);
		flushPending(0);
	}

	/* --- page context ------------------------------------------------------ */

	// Several pages share these scripts (pokedex.js runs on index.html and
	// test.html), so events record which page they fired on.
	function currentPage() {
		return global.location.pathname.split("/").pop() || "index.html";
	}

	PokeDex.analytics = {
		track: track,
		trackWhenReady: trackWhenReady,
		identify: identify,
		currentPage: currentPage,
	};

	// Send anything an earlier page in this tab left pending.
	flushPending(0);
})(window);
