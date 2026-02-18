const express = require("express");
const axios   = require("axios");
const app     = express();

// ============================================================
// STEP 1: PASTE API KEY ROBLOX LO DISINI
// Ganti tulisan PASTE_KEY_LO_DISINI dengan rblx_xxxxx lo
// ============================================================
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || "Mp+Qa5bbqU6QyTdJoOF6wjevr8bE2UXDmT207WMiVy8O4rH1ZXlKaGJHY2lPaUpTVXpJMU5pSXNJbXRwWkNJNkluTnBaeTB5TURJeExUQTNMVEV6VkRFNE9qVXhPalE1V2lJc0luUjVjQ0k2SWtwWFZDSjkuZXlKaGRXUWlPaUpTYjJKc2IzaEpiblJsY201aGJDSXNJbWx6Y3lJNklrTnNiM1ZrUVhWMGFHVnVkR2xqWVhScGIyNVRaWEoyYVdObElpd2lZbUZ6WlVGd2FVdGxlU0k2SWsxd0sxRmhOV0ppY1ZVMlVYbFVaRXB2VDBZMmQycGxkbkk0WWtVeVZWaEViVlF5TURkWFRXbFdlVGhQTkhKSU1TSXNJbTkzYm1WeVNXUWlPaUl5TmpBd05qQTVPREU0SWl3aVpYaHdJam94TnpjeE5EWXdOek13TENKcFlYUWlPakUzTnpFME5UY3hNekFzSW01aVppSTZNVGMzTVRRMU56RXpNSDAubGhBcnFxcnRrSWJGTTM1R091eFVMYVZFeHUwYXhGU2VVenM3a1hVbXhiZVpVcEY3WFJLX2hVekVrRWtrNFJuT0ZfMVRYcThJbUdSY2YzWHNjb3JrYXBSd1A1VjFXbXJSNmtNUF81VDZHbVNMcjNIM0xnMllLZHp1bnJmMWdRdU5JREdWMnB4QWE5cnpmYW15RHJkOVlhMEpQTG1xUjVDTEVaazh1UENEMXdHbDBGVzVCZmpNRFNpSUtWN3ZQVEp1Wi1STG5uUHlSUjQ4Y2xZOThHYTQ3ajlUV09qejVXNDNDNTZGNXNTa2pDa0g2YTZNY1cxTlZTc0lad0VyOEdTX05nMm4xWloxOXBmVmhUMU8wbXZQbkRaNFRaMm12ZDB4RTlnNGZHbmZXWXYyYm9aNDFUNXIwdldBcUs5ck92LVRyWjBzVHF0ODNTamMyRmVNWHRHS1Vn";
// ============================================================

const CACHE     = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const sleep     = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 12000,
        headers: {
          "x-api-key" : ROBLOX_API_KEY,
          "User-Agent": "Mozilla/5.0",
          "Accept"    : "application/json",
        },
      });
      return res.data;
    } catch (err) {
      console.warn(`Attempt ${i + 1} gagal: ${err.response?.status} | ${url}`);
      if (i < retries - 1) await sleep(800 * (i + 1));
    }
  }
  return null;
}

async function fetchGamepasses(userId) {
  const allPasses = [];
  let cursor = "";
  let page   = 0;

  console.log(`[Fetch] userId: ${userId}`);

  do {
    page++;
    const url =
      `https://inventory.roblox.com/v1/users/${userId}/assets` +
      `?assetType=GamePass&limit=100&sortOrder=Asc` +
      (cursor ? `&cursor=${cursor}` : "");

    const data = await fetchWithRetry(url);
    if (!data || !Array.isArray(data.data)) {
      console.warn(`[Fetch] Gagal page ${page}`);
      break;
    }

    console.log(`[Fetch] Page ${page}: ${data.data.length} items`);

    for (const item of data.data) {
      const assetId = item.assetId;
      if (!assetId) continue;

      const info = await fetchWithRetry(
        `https://economy.roblox.com/v2/assets/${assetId}/details`
      );
      await sleep(100);

      if (!info) continue;

      if (info.IsForSale && typeof info.PriceInRobux === "number" && info.PriceInRobux > 0) {
        allPasses.push({
          id   : assetId,
          name : (info.Name || "Gamepass").substring(0, 80),
          price: info.PriceInRobux,
        });
        console.log(`  ✅ ${info.Name} | ${info.PriceInRobux} R$`);
      }
    }

    cursor = data.nextPageCursor || "";
  } while (cursor && page < 10);

  allPasses.sort((a, b) => a.price - b.price);
  console.log(`[Fetch] Total: ${allPasses.length} gamepass untuk userId ${userId}`);
  return allPasses;
}

app.get("/gamepasses/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  if (isNaN(userId) || userId <= 0) {
    return res.status(400).json({ success: false, error: "userId tidak valid" });
  }

  const cached = CACHE.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return res.json({ success: true, data: cached.data, fromCache: true });
  }

  try {
    const passes = await fetchGamepasses(userId);
    CACHE.set(userId, { data: passes, fetchedAt: Date.now() });
    return res.json({ success: true, data: passes, fromCache: false });
  } catch (err) {
    console.error("[ERROR]", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/ping", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("========================================");
  console.log(`✅ Server jalan di port ${PORT}`);
  if (ROBLOX_API_KEY === "PASTE_KEY_LO_DISINI") {
    console.log("⚠️  WARNING: API Key belum diisi!");
  } else {
    console.log("🔑 API Key: sudah diset");
  }
  console.log("========================================");
});
