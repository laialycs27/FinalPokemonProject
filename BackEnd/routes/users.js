// routes/users.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");
const {
  loadFavorites,
  saveFavorites,
  loadUsers,
} = require("../helpers/userStorage");

const router = express.Router();

// Add favorite
router.post("/:userId/favorites", (req, res) => {
  try {
    const { userId } = req.params;
    const { id, name, image, types, abilities } = req.body;

    if (
      !id ||
      !name ||
      !image ||
      !Array.isArray(types) ||
      !Array.isArray(abilities)
    ) {
      return res.status(400).json({ error: "Invalid Pokémon data" });
    }

    const users = loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const favorites = loadFavorites();

    let userFav = favorites.find((f) => f.userId === userId);
    const newPokemon = { id, name, image, types, abilities };

    if (!userFav) {
      userFav = { userId, favorites: [newPokemon] };
      favorites.push(userFav);
    } else {
      const exists = userFav.favorites.some((p) => p.id === id);
      if (exists)
        return res.status(409).json({ error: "Pokémon already in favorites" });
      userFav.favorites.push(newPokemon);
    }

    saveFavorites(favorites);
    res
      .status(201)
      .json({ message: "Pokémon added to favorites", favorite: newPokemon });
  } catch (err) {
    console.error("Add favorite error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Remove favorite
router.delete("/:userId/favorites/:pokemonId", (req, res) => {
  try {
    const { userId, pokemonId } = req.params;

    const favorites = loadFavorites();
    const userFav = favorites.find((f) => f.userId === userId);
    if (!userFav)
      return res.status(404).json({ error: "User or favorites not found" });

    const original = userFav.favorites.length;
    userFav.favorites = userFav.favorites.filter(
      (p) => String(p.id) !== String(pokemonId)
    );
    if (userFav.favorites.length === original) {
      return res.status(404).json({ error: "Pokémon not found in favorites" });
    }

    saveFavorites(favorites);
    res.status(200).json({ message: "Pokémon removed from favorites" });
  } catch (err) {
    console.error("Delete favorite error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get favorites
router.get("/:userId/favorites", (req, res) => {
  try {
    const { userId } = req.params;
    const favorites = loadFavorites();
    const userFav = favorites.find((f) => f.userId === userId);

    if (!userFav)
      return res
        .status(404)
        .json({ error: "No favorites found for this user" });
    res.status(200).json({ favorites: userFav.favorites });
  } catch (err) {
    console.error("Get favorites error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Download favorites CSV
router.get("/:userId/favorites/download", async (req, res) => {
  try {
    const { userId } = req.params;
    const favorites = loadFavorites();
    const userFav = favorites.find((f) => f.userId === userId);

    if (!userFav || userFav.favorites.length === 0) {
      return res
        .status(404)
        .json({ error: "No favorites found for this user" });
    }

    const filePath = path.join(
      __dirname,
      "..",
      "data",
      `favorites-${userId}.csv`
    );
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "id", title: "ID" },
        { id: "name", title: "Name" },
        { id: "image", title: "Image" },
        { id: "types", title: "Types" },
        { id: "abilities", title: "Abilities" },
      ],
    });

    const csvData = userFav.favorites.map((pokemon) => ({
      ...pokemon,
      types: pokemon.types.join(", "),
      abilities: pokemon.abilities.join(", "),
    }));

    await csvWriter.writeRecords(csvData);
    res.download(filePath, `favorites-${userId}.csv`, (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).send("Failed to download CSV");
      } else {
        fs.unlink(filePath, () => {});
      }
    });
  } catch (err) {
    console.error("CSV download error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
