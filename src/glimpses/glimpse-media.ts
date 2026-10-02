function isHlsUrl(url: string) {
  return /\.m3u8(\?|$)/i.test(url);
}

export function glimpsePlaybackFields(videoUrl: string) {
  if (!videoUrl) return { videoUrl: '', streamUrl: undefined as string | undefined };
  if (isHlsUrl(videoUrl)) {
    return { videoUrl: '', streamUrl: videoUrl };
  }
  return { videoUrl, streamUrl: undefined };
}
