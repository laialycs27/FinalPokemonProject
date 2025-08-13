import { login } from "../../services/authService.js";
import { setSession } from "../../services/session.js";

export async function init(mount, ctx) {
  let aborted = false;

  const form = mount.querySelector("#login-form");
  const errorEl = mount.querySelector("#error-message");
  const emailEl = mount.querySelector("#email");
  const passwordEl = mount.querySelector("#password");
  const submitBtn = mount.querySelector('button[type="submit"]');

  if (!form) {
    console.warn("login form not found");
    return;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const email = (emailEl?.value || "").trim();
    const password = passwordEl?.value || "";

    submitBtn?.setAttribute("disabled", "true");

    try {
      const result = await login(email, password);
      if (aborted) return;

      // Save session for this tab only
      setSession(result?.user);

      const go = ctx?.navigateTo ?? ((u) => (window.location.href = u));
      await go("/search");
    } catch (error) {
      if (!aborted) {
        console.error("Login error:", error);
        if (errorEl) errorEl.textContent = error?.message || "Login failed";
      }
    } finally {
      submitBtn?.removeAttribute("disabled");
    }
  };

  form.addEventListener("submit", onSubmit);

  return () => {
    aborted = true;
    form.removeEventListener("submit", onSubmit);
  };
}
