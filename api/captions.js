import { getSubtitles } from 'youtube-caption-extractor';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function classify(message = '') {
  const m = message.toLowerCase();
  if (m.includes('login_required') || m.includes('not a bot')) {
    return { code: 'youtube_bot_check', status: 503, error: 'YouTube is challenging the caption server as a bot. Try again in a moment.' };
  }
  if (m.includes('private') || m.includes('video unavailable')) {
    return { code: 'video_unavailable', status: 404, error: 'This video is unavailable or private.' };
  }
  if (m.includes('age')) {
    return { code: 'age_restricted', status: 403, error: 'YouTube is restricting captions for this video.' };
  }
  return { code: 'caption_extraction_failed', status: 502, error: 'Caption extraction failed.' };
}

async function extractWithRetry(videoID) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await getSubtitles({ videoID, lang: 'en' });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/private|video unavailable/i.test(message)) throw error;
      if (attempt < 3) await sleep(250 * attempt);
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  const videoID = String(req.query?.videoId || '').trim();
  if (!/^[\w-]{11}$/.test(videoID)) {
    return res.status(400).json({ error: 'That does not look like a YouTube video.', code: 'invalid_video_id' });
  }

  try {
    const subtitles = await extractWithRetry(videoID);
    const cues = (subtitles || []).map(s => ({
      time: Number(s.start ?? 0),
      duration: Number(s.dur ?? 0),
      text: String(s.text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
    })).filter(c => Number.isFinite(c.time) && c.text);

    if (!cues.length) {
      return res.status(404).json({
        error: 'This video did not expose any usable captions.',
        code: 'no_captions'
      });
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ videoId: videoID, cues });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Inside Voice caption extraction failed:', detail);
    const info = classify(detail);
    return res.status(info.status).json({
      error: info.error,
      code: info.code,
      detail
    });
  }
}
