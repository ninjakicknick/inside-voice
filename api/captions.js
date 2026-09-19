export default async function handler(req, res) {
  const videoID = String(req.query?.videoId || '').trim();

  if (!/^[\w-]{11}$/.test(videoID)) {
    return res.status(400).json({ error: 'That does not look like a YouTube video.', code: 'invalid_video_id' });
  }

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Inside Voice is missing its transcript API key.',
      code: 'supadata_not_configured'
    });
  }

  try {
    const url = new URL('https://api.supadata.ai/v1/transcript');
    url.searchParams.set('url', 'https://www.youtube.com/watch?v=' + videoID);
    url.searchParams.set('lang', 'en');

    const response = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(30000)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Supadata transcript error:', response.status, data);
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({ error: 'The transcript service rejected the Inside Voice API key.', code: 'supadata_auth' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'Inside Voice has temporarily hit its transcript limit.', code: 'supadata_rate_limit' });
      }
      return res.status(502).json({
        error: data.message || data.error || 'The transcript service could not process this video.',
        code: 'supadata_error'
      });
    }

    if (!Array.isArray(data.content)) {
      return res.status(502).json({ error: 'The transcript service returned an unexpected response.', code: 'supadata_bad_response' });
    }

    const cues = data.content.map(segment => ({
      // Supadata timestamps are milliseconds; Inside Voice's player clock is seconds.
      time: Number(segment.offset || 0) / 1000,
      duration: Number(segment.duration || 0) / 1000,
      text: String(segment.text || '').replace(/\s+/g, ' ').trim()
    })).filter(cue => Number.isFinite(cue.time) && cue.text);

    if (!cues.length) {
      return res.status(404).json({ error: 'No usable speech was found for this video.', code: 'no_transcript' });
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      videoId: videoID,
      lang: data.lang || 'unknown',
      source: 'supadata',
      cues
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    console.error('Inside Voice transcript request failed:', error);
    return res.status(502).json({
      error: timedOut ? 'The transcript service took too long to respond.' : 'Inside Voice could not reach the transcript service.',
      code: timedOut ? 'transcript_timeout' : 'transcript_network_error'
    });
  }
}
