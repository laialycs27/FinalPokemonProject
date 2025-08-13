export async function fetchInfo() {
  try {
    const response = await fetch("http://localhost:3000/info");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to fetch info");
    }
    console.log(data);
    return data;
  } catch (error) {
    throw error;
  }
}
