/* ==========================================================================
   analytics.js — Pendo Track Events
   --------------------------------------------------------------------------
   The one place that talks to the Pendo agent. Load it before auth.js on
   every page. Each call is a no-op when the agent isn't on the page, and
   none of them throw: analytics must never break the flow it measures.

   Event properties never include passwords, email addresses, or names.
   analytics.js — Novus by Pendo: boot, identify, and sign-out reset
   --------------------------------------------------------------------------
   The Pendo install snippet in each page's <head> defines a `pendo` stub
   that queues calls while the agent loads asynchronously. Every page here
   is a full page load, so this runs once per page: it boots the agent, then
   identifies the visitor from the stored session. login.js identifies at
   the moment of sign-in; auth.js clears the visitor on sign-out.

   The agent is always reached through `global.pendo` at call time, never a
   cached reference: its stub methods are swapped out once the agent loads.
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
	/**
	 * The session user has no separate id, and email is the login key, so it
	 * doubles as the visitor id.
	 */
	function identify(user) {
		if (!global.pendo || !user || !user.email) return;

		global.pendo.identify({
			visitor: {
				id: user.email,
				email: user.email,
				full_name: user.name,
				role: user.role,
			},
		});
	}

	/**
	 * Starts a fresh anonymous visitor, so whoever signs in next isn't
	 * recorded under the previous user's identity.
	 */
	function clearSession() {
		// The snippet doesn't stub clearSession: it only exists once the agent
		// has loaded, and never if a content blocker stopped it. Sign-out must
		// work either way.
		if (global.pendo && typeof global.pendo.clearSession === "function") {
			global.pendo.clearSession();
		}
	}

	PokeDex.analytics = { identify: identify, clearSession: clearSession };

	if (!global.pendo) return;

	// Exactly once per page load. An empty id lets the agent resume the
	// visitor it already knows from its own storage, or start an anonymous one.
	global.pendo.initialize({ visitor: { id: "" } });

	// The session outlives the page, so identify on every page load, not only
	// on the login page.
	if (PokeDex.auth) identify(PokeDex.auth.getUser());
})(window);
