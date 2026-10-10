/* ==========================================================================
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
