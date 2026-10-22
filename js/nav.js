/* ==========================================================================
   nav.js — one header, rendered on every page
   --------------------------------------------------------------------------
   Static sites have no templating layer, so the header lived as four slowly
   diverging copies of the same markup. This renders it from one definition
   into <header data-site-header></header> and reflects the auth state.
   ========================================================================== */

(function (global) {
	"use strict";

	const PokeDex = (global.PokeDex = global.PokeDex || {});
	const doc = global.document;

	// An entry without `href` renders as an inert button: it goes nowhere on
	// its own and exists as a stable target for a guide or resource center.
	const LINKS = [
		{ href: "index.html", label: "Pokédex" },
		{ href: "other.html", label: "Other Page" },
		{ href: "segment.html", label: "Segment Test" },
		{ href: "test.html", label: "Sandbox" },
		{ id: "nav-help", label: "Help" },
	];

	function currentPage() {
		return global.location.pathname.split("/").pop() || "index.html";
	}

	function initials(name) {
		return String(name || "?")
			.split(/\s+/)
			.slice(0, 2)
			.map(function (part) {
				return part.charAt(0).toUpperCase();
			})
			.join("");
	}

	function el(tag, className, text) {
		const node = doc.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = text;
		return node;
	}

	function buildBrand() {
		const brand = el("a", "brand");
		brand.href = "index.html";
		brand.appendChild(el("span", "brand__mark"));
		brand.appendChild(el("span", null, "PokeDex"));
		return brand;
	}

	function buildNav(page) {
		const nav = el("nav", "site-nav");
		nav.setAttribute("aria-label", "Main");

		LINKS.forEach(function (link) {
			if (!link.href) {
				const button = el("button", "site-nav__link", link.label);
				button.type = "button";
				button.id = link.id;
				nav.appendChild(button);
				return;
			}

			const a = el("a", "site-nav__link", link.label);
			a.href = link.href;
			if (link.href === page) a.setAttribute("aria-current", "page");
			nav.appendChild(a);
		});

		const user = PokeDex.auth ? PokeDex.auth.getUser() : null;

		if (user) {
			const chip = el("div", "site-nav__user");
			const avatar = el("span", "avatar", initials(user.name));
			avatar.setAttribute("aria-hidden", "true");

			const signOut = el("button", "btn btn--ghost", "Sign out");
			signOut.type = "button";
			signOut.addEventListener("click", function () {
				PokeDex.auth.signOut();
			});

			chip.appendChild(avatar);
			chip.appendChild(el("span", null, user.name));
			chip.appendChild(signOut);
			nav.appendChild(chip);
		} else if (page !== "login.html") {
			const signIn = el("a", "site-nav__link", "Sign in");
			signIn.href = "login.html";
			nav.appendChild(signIn);
		}

		return nav;
	}

	function render() {
		const mount = doc.querySelector("[data-site-header]");
		if (!mount) return;

		const page = currentPage();
		const inner = el("div", "site-header__inner");

		inner.appendChild(buildBrand());
		inner.appendChild(buildNav(page));

		mount.className = "site-header";
		mount.replaceChildren(inner);
	}

	PokeDex.renderNav = render;

	if (doc.readyState === "loading") {
		doc.addEventListener("DOMContentLoaded", render);
	} else {
		render();
	}
})(window);
