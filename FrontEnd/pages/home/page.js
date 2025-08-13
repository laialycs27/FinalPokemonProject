// frontEnd/pages/home.page/home.js
import { fetchInfo } from "../../services/infoService.js";

export async function init(mount /*, ctx */) {
  let aborted = false;

  async function loadInfo() {
    try {
      const data = await fetchInfo();

      if (aborted || !mount?.isConnected) return; // user navigated away

      // Scope to this page only
      const description = mount.querySelector("#description");
      const studentList = mount.querySelector("#student-list");

      if (description) description.textContent = data?.description ?? "";

      if (studentList) {
        studentList.innerHTML = "";
        (data?.students ?? []).forEach((student) => {
          const li = document.createElement("li");
          li.textContent = `${student.name} (${student.id})`;
          studentList.appendChild(li);
        });
      }
    } catch (err) {
      const description = mount.querySelector("#description");
      if (description) description.textContent = "Failed to load project info.";
      console.error("Error fetching info:", err);
    }
  }

  await loadInfo();

  // Return a cleanup function so the router can dispose this page safely
  return () => {
    aborted = true;
  };
}
