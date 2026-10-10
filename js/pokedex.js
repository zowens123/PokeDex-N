/* ==========================================================================
   pokedex.js — list, search, filter, and detail view
   --------------------------------------------------------------------------
   Loading strategy: one request gets all 151 names up front, and the grid
   paints immediately (artwork URLs are derivable from the id). Type data is
   then hydrated in a bounded-concurrency pool and cached in sessionStorage,
   so a reload is instant and the API isn't hit with 151 serial requests.
   ========================================================================== */

(function (global) {
	"use strict";

	const PokeDex = (global.PokeDex = global.PokeDex || {});
	const doc = global.document;

	const API_BASE = "https://pokeapi.co/api/v2";
	const ARTWORK_BASE =
		"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
	const POKE_COUNT = 151;
	const CONCURRENCY = 8;
	const CACHE_KEY = "pokedex.cache.v1";
	const STAT_SCALE = 180; // visual ceiling for stat bars, not a real max

	/* --- element refs ------------------------------------------------------ */

	const listEl = doc.getElementById("pokeList");
	const searchEl = doc.getElementById("search");
	const typeFilterEl = doc.getElementById("typeFilter");
	const countEl = doc.getElementById("resultCount");
	const emptyStateEl = doc.getElementById("emptyState");
	const errorStateEl = doc.getElementById("errorState");
	const errorMessageEl = doc.getElementById("errorMessage");
	const retryBtn = doc.getElementById("retryBtn");

	if (!listEl) return;

	/* --- state ------------------------------------------------------------- */

	let pokemon = []; // [{ id, name, types, loaded }]
	const cardsById = new Map();
	let searchTerm = "";
	let typeFilter = "";

	/* --- helpers ----------------------------------------------------------- */

	function capitalize(value) {
		return value.charAt(0).toUpperCase() + value.slice(1);
	}

	function displayName(name) {
		// PokéAPI uses hyphenated slugs ("mr-mime", "nidoran-f").
		return name.split("-").map(capitalize).join(" ");
	}

	function padId(id) {
		return "#" + String(id).padStart(3, "0");
	}

	function artworkUrl(id) {
		return ARTWORK_BASE + "/" + id + ".png";
	}

	function idFromUrl(url) {
		const match = /\/pokemon\/(\d+)\/?$/.exec(url);
		return match ? Number(match[1]) : null;
	}

	async function fetchJson(url) {
		const res = await fetch(url);
		if (!res.ok) throw new Error("Request failed (" + res.status + ") for " + url);
		return res.json();
	}

	/**
	 * Runs `worker` over `items`, at most `limit` in flight at a time.
	 * Individual failures resolve to null instead of aborting the batch.
	 */
	async function pool(items, limit, worker) {
		const queue = items.slice();

		async function run() {
			while (queue.length) {
				const item = queue.shift();
				try {
					await worker(item);
				} catch (err) {
					// A single missing detail shouldn't blank the grid; the card
					// just stays without type badges.
					global.console.warn("Hydration failed:", err);
				}
			}
		}

		const runners = [];
		for (let i = 0; i < Math.min(limit, items.length); i++) runners.push(run());
		await Promise.all(runners);
	}

	/* --- cache ------------------------------------------------------------- */

	function readCache() {
		try {
			const raw = global.sessionStorage.getItem(CACHE_KEY);
			return raw ? JSON.parse(raw) : {};
		} catch (err) {
			return {};
		}
	}

	function writeCache(cache) {
		try {
			global.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
		} catch (err) {
			/* quota or private mode — caching is optional */
		}
	}

	/* --- rendering --------------------------------------------------------- */

	// `t-<type>` sets the hue custom property the stylesheet derives tints from.
	function typeClass(typeName) {
		return "t-" + typeName;
	}

	function buildTypeBadge(typeName) {
		const badge = doc.createElement("span");
		badge.className = "type-badge " + typeClass(typeName);
		badge.textContent = typeName;
		return badge;
	}

	function buildCard(entry) {
		const li = doc.createElement("li");

		const card = doc.createElement("button");
		card.type = "button";
		card.className = "poke-card";
		card.dataset.id = String(entry.id);
		card.setAttribute("aria-label", displayName(entry.name) + ", number " + entry.id);

		const id = doc.createElement("span");
		id.className = "poke-card__id";
		id.textContent = padId(entry.id);

		const img = doc.createElement("img");
		img.className = "poke-card__img";
		img.src = artworkUrl(entry.id);
		img.alt = "";
		img.loading = "lazy";
		img.decoding = "async";
		img.width = 96;
		img.height = 96;
		img.addEventListener("error", function () {
			img.style.visibility = "hidden";
		});

		const name = doc.createElement("p");
		name.className = "poke-card__name";
		name.textContent = displayName(entry.name);

		const types = doc.createElement("span");
		types.className = "poke-card__types";

		card.append(id, img, name, types);
		li.appendChild(card);

		cardsById.set(entry.id, { li: li, card: card, types: types });
		return li;
	}

	function renderTypes(entry) {
		const refs = cardsById.get(entry.id);
		if (!refs) return;

		refs.types.replaceChildren.apply(refs.types, entry.types.map(buildTypeBadge));

		// The card itself takes the wash of the primary type.
		if (entry.types.length) {
			refs.card.classList.add("is-tinted", typeClass(entry.types[0]));
		}
	}

	function renderSkeletons(count) {
		const frag = doc.createDocumentFragment();

		for (let i = 0; i < count; i++) {
			const li = doc.createElement("li");
			const card = doc.createElement("div");
			card.className = "poke-card poke-card--skeleton";
			card.setAttribute("aria-hidden", "true");

			const id = doc.createElement("span");
			id.className = "skeleton";
			id.style.cssText = "width:38px;height:12px";

			const img = doc.createElement("span");
			img.className = "skeleton";
			img.style.cssText = "width:96px;height:96px;border-radius:50%";

			const name = doc.createElement("span");
			name.className = "skeleton";
			name.style.cssText = "width:80px;height:15px";

			card.append(id, img, name);
			li.appendChild(card);
			frag.appendChild(li);
		}

		listEl.replaceChildren(frag);
	}

	function matches(entry) {
		if (typeFilter && !entry.types.includes(typeFilter)) return false;
		if (!searchTerm) return true;

		const term = searchTerm.toLowerCase();
		return (
			entry.name.toLowerCase().includes(term) ||
			String(entry.id).includes(term) ||
			padId(entry.id).includes(term)
		);
	}

	function applyFilters() {
		let visible = 0;

		pokemon.forEach(function (entry) {
			const refs = cardsById.get(entry.id);
			if (!refs) return;

			const show = matches(entry);
			refs.li.classList.toggle("hidden", !show);
			if (show) visible++;
		});

		emptyStateEl.classList.toggle("hidden", visible > 0);
		countEl.textContent = visible + " of " + pokemon.length;
	}

	function populateTypeFilter() {
		const seen = new Set();
		pokemon.forEach(function (entry) {
			entry.types.forEach(function (type) {
				seen.add(type);
			});
		});

		const current = typeFilterEl.value;
		const options = [doc.createElement("option")];
		options[0].value = "";
		options[0].textContent = "All types";

		Array.from(seen)
			.sort()
			.forEach(function (type) {
				const option = doc.createElement("option");
				option.value = type;
				option.textContent = capitalize(type);
				options.push(option);
			});

		typeFilterEl.replaceChildren.apply(typeFilterEl, options);
		typeFilterEl.value = current;
	}

	/* --- detail dialog ----------------------------------------------------- */

	let openDialog = null;

	function buildStatRow(stat) {
		const row = doc.createElement("div");
		row.className = "stat";

		const label = doc.createElement("span");
		label.className = "stat__label";
		label.textContent = stat.stat.name.replace(/-/g, " ");

		const track = doc.createElement("span");
		track.className = "stat__track";

		const fill = doc.createElement("span");
		fill.className = "stat__fill";
		fill.style.width = Math.min(100, (stat.base_stat / STAT_SCALE) * 100) + "%";
		track.appendChild(fill);

		const value = doc.createElement("span");
		value.className = "stat__value";
		value.textContent = String(stat.base_stat);

		row.append(label, track, value);
		return row;
	}

	function buildMetaTile(label, value) {
		const tile = doc.createElement("div");
		tile.className = "meta-tile";

		const labelEl = doc.createElement("span");
		labelEl.className = "meta-tile__label";
		labelEl.textContent = label;

		const valueEl = doc.createElement("span");
		valueEl.className = "meta-tile__value";
		valueEl.textContent = value;

		tile.append(labelEl, valueEl);
		return tile;
	}

	function closeDetail() {
		if (!openDialog) return;

		doc.removeEventListener("keydown", openDialog.onKeydown, true);
		openDialog.node.remove();
		doc.body.style.overflow = "";

		if (openDialog.lastFocused && openDialog.lastFocused.isConnected) {
			openDialog.lastFocused.focus();
		}
		openDialog = null;
	}

	function showDetail(detail) {
		closeDetail();

		const lastFocused = doc.activeElement;

		const wrapper = doc.createElement("div");
		wrapper.className = "dialog";

		const backdrop = doc.createElement("div");
		backdrop.className = "dialog__backdrop";
		backdrop.addEventListener("click", closeDetail);

		const panel = doc.createElement("div");
		panel.className = "dialog__panel";
		panel.setAttribute("role", "dialog");
		panel.setAttribute("aria-modal", "true");
		panel.setAttribute("aria-labelledby", "detailName");
		panel.tabIndex = -1;
		if (detail.types.length) {
			panel.classList.add(typeClass(detail.types[0].type.name));
		}

		const closeBtn = doc.createElement("button");
		closeBtn.type = "button";
		closeBtn.className = "dialog__close";
		closeBtn.innerHTML = "&times;";
		closeBtn.setAttribute("aria-label", "Close");
		closeBtn.addEventListener("click", closeDetail);

		const top = doc.createElement("div");
		top.className = "detail__top";

		const img = doc.createElement("img");
		img.className = "detail__img";
		img.src = artworkUrl(detail.id);
		img.alt = displayName(detail.name);
		img.width = 130;
		img.height = 130;

		const info = doc.createElement("div");

		const idEl = doc.createElement("span");
		idEl.className = "detail__id";
		idEl.textContent = padId(detail.id);

		const nameEl = doc.createElement("h2");
		nameEl.className = "detail__name";
		nameEl.id = "detailName";
		nameEl.textContent = displayName(detail.name);

		const typesEl = doc.createElement("div");
		typesEl.className = "detail__types";
		detail.types.forEach(function (slot) {
			typesEl.appendChild(buildTypeBadge(slot.type.name));
		});

		info.append(idEl, nameEl, typesEl);
		top.append(img, info);

		const meta = doc.createElement("div");
		meta.className = "detail__meta";
		// PokéAPI reports decimetres and hectograms.
		meta.append(
			buildMetaTile("Height", (detail.height / 10).toFixed(1) + " m"),
			buildMetaTile("Weight", (detail.weight / 10).toFixed(1) + " kg"),
			buildMetaTile("Base XP", String(detail.base_experience ?? "—"))
		);

		const statsHeading = doc.createElement("h3");
		statsHeading.textContent = "Base stats";

		const stats = doc.createElement("div");
		detail.stats.forEach(function (stat) {
			stats.appendChild(buildStatRow(stat));
		});

		panel.append(closeBtn, top, meta, statsHeading, stats);
		wrapper.append(backdrop, panel);
		doc.body.appendChild(wrapper);
		doc.body.style.overflow = "hidden";

		// Escape to dismiss, Tab cycles within the panel.
		function onKeydown(event) {
			if (event.key === "Escape") {
				event.preventDefault();
				closeDetail();
				return;
			}

			if (event.key !== "Tab") return;

			const focusable = panel.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
			if (!focusable.length) return;

			const first = focusable[0];
			const last = focusable[focusable.length - 1];

			if (event.shiftKey && doc.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && doc.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		doc.addEventListener("keydown", onKeydown, true);
		openDialog = { node: wrapper, onKeydown: onKeydown, lastFocused: lastFocused };
		closeBtn.focus();
	}

	async function selectPokemon(id) {
		try {
			const detail = await fetchJson(API_BASE + "/pokemon/" + id);
			showDetail(detail);
		} catch (err) {
			global.console.error(err);
			global.alert("Couldn't load that Pokémon. Please try again.");
		}
	}

	/* --- load -------------------------------------------------------------- */

	function showError(message) {
		errorMessageEl.textContent = message;
		errorStateEl.classList.remove("hidden");
		listEl.replaceChildren();
		countEl.textContent = "";
	}

	async function hydrateTypes() {
		const cache = readCache();

		await pool(pokemon, CONCURRENCY, async function (entry) {
			if (cache[entry.id]) {
				entry.types = cache[entry.id];
				entry.loaded = true;
				renderTypes(entry);
				return;
			}

			const detail = await fetchJson(API_BASE + "/pokemon/" + entry.id);
			entry.types = detail.types.map(function (slot) {
				return slot.type.name;
			});
			entry.loaded = true;
			cache[entry.id] = entry.types;
			renderTypes(entry);
		});

		writeCache(cache);
		populateTypeFilter();
		applyFilters();
	}

	async function load() {
		errorStateEl.classList.add("hidden");
		emptyStateEl.classList.add("hidden");
		renderSkeletons(24);

		try {
			const data = await fetchJson(API_BASE + "/pokemon?limit=" + POKE_COUNT);

			pokemon = data.results
				.map(function (result) {
					return { id: idFromUrl(result.url), name: result.name, types: [], loaded: false };
				})
				.filter(function (entry) {
					return entry.id !== null;
				});

			cardsById.clear();
			const frag = doc.createDocumentFragment();
			pokemon.forEach(function (entry) {
				frag.appendChild(buildCard(entry));
			});
			listEl.replaceChildren(frag);

			applyFilters();
			await hydrateTypes();
		} catch (err) {
			global.console.error(err);
			showError("The PokéAPI request failed. Check your connection and try again.");
		}
	}

	/* --- events ------------------------------------------------------------ */

	// One delegated listener beats 151 inline handlers.
	listEl.addEventListener("click", function (event) {
		const card = event.target.closest(".poke-card[data-id]");
		if (!card) return;
		selectPokemon(Number(card.dataset.id));
	});

	let searchTimer = null;
	searchEl.addEventListener("input", function () {
		global.clearTimeout(searchTimer);
		searchTimer = global.setTimeout(function () {
			searchTerm = searchEl.value.trim();
			applyFilters();
		}, 150);
	});

	typeFilterEl.addEventListener("change", function () {
		typeFilter = typeFilterEl.value;
		applyFilters();
	});

	retryBtn.addEventListener("click", load);

	PokeDex.selectPokemon = selectPokemon;

	load();
})(window);
