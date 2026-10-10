/* ==========================================================================
   Demo account seed — DEVELOPMENT ONLY
   --------------------------------------------------------------------------
   These are fake credentials for a static demo with no backend. They are
   shipped to the browser in plain text, so they are NOT secrets and must
   never hold a real password.

   When you wire up a real backend, delete this file and replace the lookup
   in auth.js with a POST to your login endpoint. See README.md.
   ========================================================================== */

(function (global) {
	"use strict";

	const PokeDex = (global.PokeDex = global.PokeDex || {});

	PokeDex.DEMO_USERS = [
		{
			email: "ash@pallet.town",
			password: "pikachu123",
			name: "Ash Ketchum",
			role: "Trainer",
		},
		{
			email: "misty@cerulean.gym",
			password: "starmie123",
			name: "Misty Waterflower",
			role: "Gym Leader",
		},
	];

	// Shown on the login page so anyone can get in without guessing.
	PokeDex.DEMO_HINT = PokeDex.DEMO_USERS[0];
})(window);
