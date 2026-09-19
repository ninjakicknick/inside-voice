# Inside Voice

**What if YouTubers quit yelling?**

Inside Voice is an experiment that plays a YouTube video muted while replacing its spoken audio with a calmer, quieter rendition derived from timed captions.

## MVP

1. Paste a YouTube URL.
2. Load the video through the YouTube iframe API.
3. Supply timestamped caption cues.
4. Mute the original audio.
5. Read cues aloud in sync using the browser speech engine.

The first version deliberately uses browser speech synthesis so the synchronization idea can be tested before adding paid/cloud TTS or a caption-fetching backend.
