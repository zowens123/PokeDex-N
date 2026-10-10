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

	// Sign-in requests sent from this page load, and how many of them failed.
	let attemptCount = 0;
	let failedAttemptCount = 0;

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

	/* --- analytics --------------------------------------------------------- */

	// Which fields failed and the messages shown, never what was typed.
	function trackValidationFailed() {
		const invalidFields = Object.keys(FIELDS).filter(function (name) {
			return FIELDS[name].input.getAttribute("aria-invalid") === "true";
		});

		PokeDex.analytics.track("sign_in_validation_failed", {
			invalidFields: invalidFields,
			errorMessages: invalidFields.map(function (name) {
				return FIELDS[name].error.textContent;
			}),
		});
	}

	function trackSignInFailed(failureReason, errorMessage) {
		failedAttemptCount++;
		PokeDex.analytics.track("sign_in_failed", {
			failureReason: failureReason,
			errorMessage: errorMessage,
			remember: rememberInput.checked,
			attemptNumber: attemptCount,
		});
	}

	// Identifies first, so the event is attributed to the user who just
	// signed in rather than the anonymous visitor on this page.
	function trackSignInSucceeded(user, redirectTarget) {
		PokeDex.analytics.identify(user);
		PokeDex.analytics.track("sign_in_succeeded", {
			role: user.role,
			remember: rememberInput.checked,
			redirectTarget: redirectTarget,
			hasNextParam: new URLSearchParams(global.location.search).has("next"),
			failedAttemptCount: failedAttemptCount,
		});
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
			trackValidationFailed();
			const firstInvalid = form.querySelector('[aria-invalid="true"]');
			if (firstInvalid) firstInvalid.focus();
			return;
		}

		setBusy(true);
		attemptCount++;

		try {
			const result = await PokeDex.auth.signIn(
				emailInput.value.trim(),
				passwordInput.value,
				rememberInput.checked
			);

			if (!result.ok) {
				trackSignInFailed("invalid_credentials", result.error);
				setBusy(false);
				showFormError(result.error);
				passwordInput.value = "";
				passwordInput.focus();
				return;
			}

			// Tracked first: the redirect leaves the page immediately.
			const redirectTarget = PokeDex.auth.getRedirectTarget();
			trackSignInSucceeded(result.user || {}, redirectTarget);

			// Replace rather than assign: the login page shouldn't sit in the
			// back-stack once the visitor is through it.
			global.location.replace(redirectTarget);
		} catch (err) {
			trackSignInFailed("unexpected_error", err && err.message);
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
