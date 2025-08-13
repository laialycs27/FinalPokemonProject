// frontEnd/pages/register.page/register.js
import { register as doRegister } from "../../services/authService.js";

export async function init(mount, ctx) {
  let aborted = false;

  const form = mount.querySelector("#register-form");
  const errorEl = mount.querySelector("#error-message");
  const usernameEl = mount.querySelector("#username");
  const emailEl = mount.querySelector("#email");
  const passwordEl = mount.querySelector("#password");
  const confirmEl = mount.querySelector("#confirm-password");
  const submitBtn = mount.querySelector('button[type="submit"]');

  if (!form) {
    console.warn("register form not found");
    return;
  }

  const setFieldError = (el, hasError) => {
    if (!el) return;
    el.classList.toggle("input-error", !!hasError);
    el.setAttribute("aria-invalid", hasError ? "true" : "false");
  };

  const validate = () => {
    const errors = [];

    const username = (usernameEl?.value || "").trim();
    const email = (emailEl?.value || "").trim();
    const password = passwordEl?.value || "";
    const confirm = confirmEl?.value || "";

    // Username: <= 50 chars, letters/spaces only
    const usernameTooLong = username.length > 50;
    const usernamePatternOk = /^[A-Za-z ]+$/.test(username); // letters + spaces only

    if (!username) errors.push("Username is required.");
    if (usernameTooLong) errors.push("Username must be at most 50 characters.");
    if (username && !usernamePatternOk)
      errors.push(
        "Username can contain letters and spaces only (no numbers or punctuation)."
      );

    // Email: simple check + input[type=email] helps too
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if (!email) errors.push("Email is required.");
    else if (!emailOk) errors.push("Please enter a valid email address.");

    // Password length
    if (!password) errors.push("Password is required.");
    else if (password.length < 7 || password.length > 15)
      errors.push("Password must be 7–15 characters.");

    // Confirm password
    if (!confirm) errors.push("Please retype your password.");
    else if (password && confirm && password !== confirm)
      errors.push("Passwords do not match.");

    // Field highlight states
    setFieldError(
      usernameEl,
      !username || usernameTooLong || (username && !usernamePatternOk)
    );
    setFieldError(emailEl, !email || (email && !emailOk));
    setFieldError(
      passwordEl,
      !password || password.length < 7 || password.length > 15
    );
    setFieldError(
      confirmEl,
      !confirm || (password && confirm && password !== confirm)
    );

    return { errors, values: { username, email, password } };
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const { errors, values } = validate();

    if (errors.length) {
      if (errorEl) errorEl.innerHTML = errors.join("<br>");
      return; // don't submit
    }

    // Only disable the button once validation passes
    submitBtn?.setAttribute("disabled", "true");

    try {
      const result = await doRegister(
        values.username,
        values.email,
        values.password
      );
      if (aborted) return;

      console.log("Registration successful:", result);

      // After registering, send them to the login route
      const go = ctx?.navigateTo ?? ((u) => (window.location.href = u));
      await go("/login");
    } catch (err) {
      if (!aborted) {
        console.error("Register error:", err);
        if (errorEl)
          errorEl.textContent = err?.message || "Registration failed.";
      }
    } finally {
      submitBtn?.removeAttribute("disabled");
    }
  };

  form.addEventListener("submit", onSubmit);

  // Optional: live-clear errors as the user types
  const inputs = [usernameEl, emailEl, passwordEl, confirmEl].filter(Boolean);
  inputs.forEach((el) =>
    el.addEventListener("input", () => {
      const { errors } = validate();
      if (errorEl) errorEl.innerHTML = errors.join("<br>");
    })
  );

  // Cleanup on route change
  return () => {
    aborted = true;
    form.removeEventListener("submit", onSubmit);
    inputs.forEach((el) => el.removeEventListener("input", validate));
  };
}
