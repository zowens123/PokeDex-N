/* ==========================================================================
   auth.js — session handling + route guards
   --------------------------------------------------------------------------
   Open demo auth. There are no accounts: any non-empty username and password
   are accepted, and the username becomes the visitor's identity. That gives
   ZERO real security — it exists so the login flow (validation, sessions,
   guarded pages, sign-out, analytics identify) is real and testable, and so
   each sign-in can be a distinct visitor for analytics work.

   To make it real, replace the body of `signIn` with a call to your API and
   let the server set an httpOnly cookie. Nothing else here needs to change.
   ========================================================================== */

(function (global) {
	"use strict";

	const PokeDex = (global.PokeDex = global.PokeDex || {});

	const STORAGE_KEY = "pokedex.session";
	const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 hours

	/* --- storage helpers --------------------------------------------------- */

	// Storage throws in private mode / blocked-cookie contexts, so every access
	// is guarded and simply degrades to "not signed in".
	function safeRead(store) {
		try {
			return store.getItem(STORAGE_KEY);
		} catch (err) {
			return null;
		}
	}

	function safeWrite(store, value) {
		try {
			store.setItem(STORAGE_KEY, value);
			return true;
		} catch (err) {
			return false;
		}
	}

	function safeRemove(store) {
		try {
			store.removeItem(STORAGE_KEY);
		} catch (err) {
			/* nothing we can do */
		}
	}

	// "Keep me signed in" is what puts the session in localStorage.
	function isRemembered() {
		return Boolean(safeRead(global.localStorage));
	}

	function readSession() {
		const raw = safeRead(global.localStorage) || safeRead(global.sessionStorage);
		if (!raw) return null;

		let session;
		try {
			session = JSON.parse(raw);
		} catch (err) {
			clearSession();
			return null;
		}

		if (!session || !session.user || !session.expiresAt) {
			clearSession();
			return null;
		}

		if (Date.now() > session.expiresAt) {
			// Recorded before clearSession() wipes the context. Deferred, since
			// this usually runs in <head> right before requireAuth() redirects,
			// which would drop a direct track call.
			PokeDex.analytics.trackWhenReady("session_expired", {
				role: session.user.role,
				sessionAgeMs: Date.now() - session.issuedAt,
				remember: isRemembered(),
				page: PokeDex.analytics.currentPage(),
			});
			clearSession();
			return null;
		}

		return session;
	}

	function writeSession(user, remember) {
		const session = {
			user: user,
			issuedAt: Date.now(),
			expiresAt: Date.now() + SESSION_MAX_AGE_MS,
		};
		const store = remember ? global.localStorage : global.sessionStorage;
		safeWrite(store, JSON.stringify(session));
		return session;
	}

	function clearSession() {
		safeRemove(global.localStorage);
		safeRemove(global.sessionStorage);
	}

	/* --- credential check -------------------------------------------------- */

	const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	// "ash.ketchum" → "Ash Ketchum"; "misty@cerulean.gym" → "Misty".
	function displayName(handle) {
		const local = handle.split("@")[0];
		const words = local
			.split(/[.\-_+\s]+/)
			.filter(Boolean)
			.map(function (part) {
				return part.charAt(0).toUpperCase() + part.slice(1);
			});
		return words.join(" ") || handle;
	}

	// Accepts anything non-empty. The delay stands in for a network round
	// trip, so the submit button's loading state is actually visible and the
	// flow behaves like one with a real backend.
	function acceptCredentials(username, password) {
		const handle = String(username || "").trim();

		return new Promise(function (resolve) {
			global.setTimeout(function () {
				if (!handle || !password) {
					resolve(null);
					return;
				}

				// Never carry the password into the session object. `email` is
				// only set when the handle looks like one; JSON drops undefined.
				resolve({
					id: handle.toLowerCase(),
					email: EMAIL_PATTERN.test(handle) ? handle.toLowerCase() : undefined,
					name: displayName(handle),
					role: "Trainer",
				});
			}, 450);
		});
	}

	/* --- public API -------------------------------------------------------- */

	const auth = {
		/**
		 * Resolves to the signed-in user, or null.
		 */
		getUser: function () {
			const session = readSession();
			return session ? session.user : null;
		},

		isAuthenticated: function () {
			return readSession() !== null;
		},

		/**
		 * @returns {Promise<{ok: true, user: object} | {ok: false, error: string}>}
		 *
		 * REPLACE ME for real auth:
		 *   const res = await fetch("/api/login", {
		 *     method: "POST",
		 *     headers: { "Content-Type": "application/json" },
		 *     credentials: "include",
		 *     body: JSON.stringify({ username, password }),
		 *   });
		 *   if (!res.ok) return { ok: false, error: "Invalid username or password." };
		 *   return { ok: true, user: await res.json() };
		 */
		signIn: async function (username, password, remember) {
			const user = await acceptCredentials(username, password);

			if (!user) {
				// Only reachable if the form's own validation was bypassed.
				return { ok: false, error: "Enter a username and password." };
			}

			writeSession(user, Boolean(remember));
			return { ok: true, user: user };
		},

		signOut: function (redirectTo) {
			// Read before clearing. A session that has already expired reports
			// session_expired from readSession() instead.
			const session = readSession();
			if (session) {
				PokeDex.analytics.track("user_signed_out", {
					role: session.user.role,
					sessionDurationMs: Date.now() - session.issuedAt,
					remember: isRemembered(),
					page: PokeDex.analytics.currentPage(),
				});
			}

			clearSession();
			// Don't let the next person on this device inherit this visitor.
			if (PokeDex.analytics) PokeDex.analytics.clearSession();
			if (redirectTo !== false) {
				global.location.href = redirectTo || "login.html";
			}
		},

		/**
		 * Guard for protected pages. Call it as early as possible — before the
		 * page renders — so a signed-out visitor never sees the content.
		 * Returns false if the visitor was redirected.
		 */
		requireAuth: function () {
			if (auth.isAuthenticated()) return true;

			const here = global.location.pathname.split("/").pop() || "index.html";
			const next = encodeURIComponent(here + global.location.search);
			global.location.replace("login.html?next=" + next);
			return false;
		},

		/**
		 * The inverse guard, for the login page: an already-signed-in visitor
		 * shouldn't be looking at a login form.
		 */
		redirectIfAuthenticated: function () {
			if (!auth.isAuthenticated()) return false;
			global.location.replace(auth.getRedirectTarget());
			return true;
		},

		/**
		 * Where to send someone after a successful sign-in. Honors ?next=,
		 * but only for same-site relative paths — an open redirect is an easy
		 * phishing vector otherwise.
		 */
		getRedirectTarget: function () {
			const params = new URLSearchParams(global.location.search);
			const next = params.get("next");

			if (!next) return "index.html";
			if (/^[a-z][a-z0-9+.-]*:/i.test(next)) return "index.html"; // absolute scheme
			if (next.startsWith("//")) return "index.html"; // protocol-relative
			if (next.startsWith("/")) return "index.html"; // site-root escape

			return next;
		},
	};

	PokeDex.auth = auth;
})(window);
