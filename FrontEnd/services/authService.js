export async function login(email, password) {
  try {
    const response = await fetch("http://localhost:3000/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    return data;
  } catch (error) {
    throw error;
  }
}

export async function register(username, email, password) {
  try {
    const response = await fetch("http://localhost:3000/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Registration failed");
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Logs out the user on the server (removes from onlineUsers list).
 * Pass the current user's id.
 */
export async function logout(userId) {
  try {
    const response = await fetch("http://localhost:3000/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    // server returns JSON like { message: "Logged out" | "Already offline" }
    // even if already offline, this is a 200
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || data?.message || "Logout failed");
    }
    return data;
  } catch (error) {
    // up to caller whether to ignore errors and clear session anyway
    throw error;
  }
}
