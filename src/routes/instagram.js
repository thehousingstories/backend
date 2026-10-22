import { Router } from "express";

const router = Router();

router.get("/reels", async (req, res) => {
  try {
    const userId = process.env.IG_USER_ID;
    const token = process.env.IG_ACCESS_TOKEN;

    if (!userId || !token) {
      return res.status(503).json({
        message: "Instagram API credentials are missing",
      });
    }

    const url = new URL(
      `https://graph.instagram.com/${process.env.META_GRAPH_VERSION || "v26.0"}/${userId}/media`
    );

    url.searchParams.set(
      "fields",
      "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp"
    );



    url.searchParams.set("limit", "25");
    url.searchParams.set("access_token", token);

    const response = await fetch(url);
    const data = await response.json();


    if (!response.ok) {
      return res.status(502).json({
        message: data.error?.message || "Instagram API request failed",
      });
    }

    const reels = (data.data || [])
      .filter(
        (item) =>
          item.media_type === "VIDEO" &&
          item.permalink?.includes("/reel/")
      )
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        caption: item.caption || "",
        url: item.permalink,
        videoUrl: item.media_url || null,
        thumbnail: item.thumbnail_url || null,
        timestamp: item.timestamp,
      }));

    res.set("Cache-Control", "public, max-age=300");
    res.json({ reels });
  } catch (error) {
    console.error("Instagram error:", error.message);
    res.status(500).json({ message: "Unable to load Instagram Reels" });
  }
});

export default router;