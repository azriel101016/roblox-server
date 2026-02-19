const express = require("express");
const axios   = require("axios");
const app     = express();

// Paste API key lo disini (hardcode aja biar ga ribet)
const ROBLOX_API_KEY = "sq217xr3XU+OXixzxay9blRnQyvM2yh10S1BMMPZR4NAX7tmZXlKaGJHY2lPaUpTVXpJMU5pSXNJbXRwWkNJNkluTnBaeTB5TURJeExUQTNMVEV6VkRFNE9qVXhPalE1V2lJc0luUjVjQ0k2SWtwWFZDSjkuZXlKaGRXUWlPaUpTYjJKc2IzaEpiblJsY201aGJDSXNJbWx6Y3lJNklrTnNiM1ZrUVhWMGFHVnVkR2xqWVhScGIyNVRaWEoyYVdObElpd2lZbUZ6WlVGd2FVdGxlU0k2SW5OeE1qRTNlSEl6V0ZVclQxaHBlSHA0WVhrNVlteFNibEY1ZGsweWVXZ3hNRk14UWsxTlVGcFNORTVCV0RkMGJTSXNJbTkzYm1WeVNXUWlPaUl5TmpBd05qQTVPREU0SWl3aVpYaHdJam94TnpjeE5EWXhOekEzTENKcFlYUWlPakUzTnpFME5UZ3hNRGNzSW01aVppSTZNVGMzTVRRMU9ERXdOMzAubkVoQzNEaGpNdmhxTllJUEhLQzhPSmxOYlJ0UktsWm9nRzd4dUx2TERBRVV4OVRrc1dSb0NreDFMSFNLb3FiYkFNdEVKZUNXck5INzlyS3RMb1NOdWlNWUR0elVQeFpTVVJTSXJoUTFIM24xZ0xJdVlWVjF2ZTd3VktxMzIxTG16THFBZHJpeGZ0N2FNLV8zeVA5TGZxRjVxaDRQVGgxeENDbDlYb2tXMERzM091eGl2Y1FXX2ZyM2FjdmVBdWxDcXQ2Q1UwVVk1Ti11Rm1aTDBoWDk4NHVfSjRRRnlpWTBCMjdnb1BYWTFlcWQ5WDFnaUxsM2hGb0VwYzNEckJIY3hPSFlWTVNMdnNEWGNtM1RYT3ViS3QtUUFud0tsUmVYM0NQYVJlT0EyTGd3NmNYRHUteUlFZFhjZ3o2c0tNWWlJR05EZER2VFlQUWFxQ20tY18wZzBn"; // ← GANTI INI

const CACHE     = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const sleep     = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        headers: {
          "User-Agent": "Roblox/WinInet",
          "Accept": "application/json",
        },
      });
      return res.data;
    } catch (err) {
      console.warn(`[Retry ${i + 1}/${retries}] Error:`, err.message);
      if (i < retries - 1) await sleep(1000 * (i + 1));
    }
  }
  return null;
}

async function fetchGamepasses(userId) {
  const allPasses = [];
  
  console.log(`[Fetch] Fetching gamepasses for userId: ${userId}`);

  // Step 1: Get inventory
  const inventoryUrl = `https://inventory.roblox.com/v1/users/${userId}/inventory/19?limit=100&sortOrder=Desc`;
  const inventory = await fetchWithRetry(inventoryUrl);
  
  if (!inventory || !Array.isArray(inventory.data)) {
    console.warn("[Fetch] Failed to get inventory");
    return [];
  }

  console.log(`[Fetch] Found ${inventory.data.length} items in inventory`);

  // Step 2: Get details for each gamepass
  for (const item of inventory.data) {
    const assetId = item.assetId;
    if (!assetId) continue;

    const detailUrl = `https://economy.roblox.com/v2/assets/${assetId}/details`;
    const info = await fetchWithRetry(detailUrl);
    
    await sleep(200); // Rate limit protection

    if (!info) continue;

    // Only include if it's for sale and has a price
    if (info.IsForSale && typeof info.PriceInRobux === "number" && info.PriceInRobux > 0) {
      allPasses.push({
        id: assetId,
        name: (info.Name || "Gamepass").substring(0, 80),
        price: info.PriceInRobux,
      });
      console.log(`  ✅ ${info.Name} - ${info.PriceInRobux} R$`);
    }
  }

  // Sort by price
  allPasses.sort((a, b) => a.price - b.price);
  
  console.log(`[Fetch] Total gamepasses: ${allPasses.length}`);
  return allPasses;
}

app.get("/gamepasses/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  if (isNaN(userId) || userId <= 0) {
    return res.status(400).json({ success: false, error: "Invalid userId" });
  }

  // Check cache
  const cached = CACHE.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    console.log(`[Cache] HIT for userId: ${userId}`);
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

app.get("/ping", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("========================================");
  console.log(`✅ Server running on port ${PORT}`);
  console.log("========================================");
});
