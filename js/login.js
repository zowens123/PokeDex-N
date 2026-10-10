/* ==========================================================================
   login.js — form validation, submission, and error surfacing
   ========================================================================== */

(function (global) {
	"use strict";

	const PokeDex = global.PokeDex;
	const doc = global.document;

	const form = doc.getElementById("loginForm");
	if (!form) return;

	const emailInput = doc.getElementById("email");
	const passwordInput = doc.getElementById("password");
	const rememberInput = doc.getElementById("remember");
	const submitBtn = doc.getElementById("submitBtn");
	const submitLabel = doc.getElementById("submitLabel");
	const formError = doc.getElementById("formError");
	const toggleBtn = doc.getElementById("togglePassword");
	const demoHint = doc.getElementById("demoHint");

	// Intentionally permissive: the server is the real authority on whether an
	// address exists. This only catches obvious typos.
	const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	const FIELDS = {
		email: {
			input: emailInput,
			error: doc.getElementById("emailError"),
			validate: function (value) {
				if (!value) return "Enter your email address.";
				if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
				return null;
			},
		},
		password: {
			input: passwordInput,
			error: doc.getElementById("passwordError"),
			validate: function (value) {
				if (!value) return "Enter your password.";
				return null;
			},
		},
	};

	/* --- error rendering --------------------------------------------------- */

	function showFieldError(field, message) {
		field.error.textContent = message;
		field.error.classList.remove("hidden");
		field.input.setAttribute("aria-invalid", "true");
	}

	function clearFieldError(field) {
		field.error.textContent = "";
		field.error.classList.add("hidden");
		field.input.removeAttribute("aria-invalid");
	}

	function showFormError(message) {
		formError.textContent = message;
		formError.classList.remove("hidden");
	}

	function clearFormError() {
		formError.textContent = "";
		formError.classList.add("hidden");
	}

	function validateField(name) {
		const field = FIELDS[name];
		const message = field.validate(field.input.value.trim());

		if (message) {
			showFieldError(field, message);
			return false;
		}

		clearFieldError(field);
		return true;
	}

	function validateAll() {
		// `reduce` rather than `every` so every field gets marked, not just
		// the first one that fails.
		return Object.keys(FIELDS).reduce(function (valid, name) {
			return validateField(name) && valid;
		}, true);
	}

	/* --- submit state ------------------------------------------------------ */

	function setBusy(busy) {
		submitBtn.disabled = busy;
		submitBtn.setAttribute("aria-busy", String(busy));

		if (busy) {
			submitLabel.textContent = "Signing in…";
			if (!submitBtn.querySelector(".spinner")) {
				const spinner = doc.createElement("span");
				spinner.className = "spinner";
				spinner.setAttribute("aria-hidden", "true");
				submitBtn.insertBefore(spinner, submitLabel);
			}
		} else {
			submitLabel.textContent = "Sign in";
			const spinner = submitBtn.querySelector(".spinner");
			if (spinner) spinner.remove();
		}
	}

	/* --- events ------------------------------------------------------------ */

	Object.keys(FIELDS).forEach(function (name) {
		const field = FIELDS[name];

		// Validate on blur, but clear errors as soon as the visitor starts
		// fixing them — re-validating on every keystroke is hostile.
		field.input.addEventListener("blur", function () {
			if (field.input.value.trim()) validateField(name);
		});

		field.input.addEventListener("input", function () {
			if (field.input.hasAttribute("aria-invalid")) clearFieldError(field);
			clearFormError();
		});
	});

	toggleBtn.addEventListener("click", function () {
		const revealed = passwordInput.type === "text";
		passwordInput.type = revealed ? "password" : "text";
		toggleBtn.textContent = revealed ? "Show" : "Hide";
		toggleBtn.setAttribute("aria-pressed", String(!revealed));
		passwordInput.focus();
	});

	form.addEventListener("submit", async function (event) {
		event.preventDefault();
		clearFormError();

		if (!validateAll()) {
			const firstInvalid = form.querySelector('[aria-invalid="true"]');
			if (firstInvalid) firstInvalid.focus();
			return;
		}

		setBusy(true);

		try {
			const result = await PokeDex.auth.signIn(
				emailInput.value.trim(),
				passwordInput.value,
				rememberInput.checked
			);

			if (!result.ok) {
				setBusy(false);
				showFormError(result.error);
				passwordInput.value = "";
				passwordInput.focus();
				return;
			}

			// Identify at the moment of sign-in; later pages re-identify from
			// the stored session (see analytics.js).
			if (PokeDex.analytics) PokeDex.analytics.identify(result.user);

			// Replace rather than assign: the login page shouldn't sit in the
			// back-stack once the visitor is through it.
			global.location.replace(PokeDex.auth.getRedirectTarget());
		} catch (err) {
			setBusy(false);
			showFormError("Something went wrong signing you in. Please try again.");
		}
	});

	/* --- demo credential hint ---------------------------------------------- */

	if (demoHint && PokeDex.DEMO_HINT) {
		demoHint.innerHTML =
			"<strong>Demo account</strong> — " +
			"<code>" +
			PokeDex.DEMO_HINT.email +
			"</code> / <code>" +
			PokeDex.DEMO_HINT.password +
			"</code>";
	}

	emailInput.focus();
})(window);
