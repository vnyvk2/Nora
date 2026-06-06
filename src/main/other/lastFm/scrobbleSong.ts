import { insertScrobble } from '@main/db/queries/scrobble_queue';
import { getUserSettings } from '@main/db/queries/settings';
import { getSongById } from '@main/db/queries/songs';
import { convertToSongData } from '@main/utils/convert';

import type { LastFMScrobblePostResponse, ScrobbleParams } from '../../../types/last_fm_api';
import logger from '../../logger';
import { checkIfConnectedToInternet } from '../../main';
import generateApiRequestBodyForLastFMPostRequests from './generateApiRequestBodyForLastFMPostRequests';
import getLastFmAuthData from './getLastFMAuthData';

const LASTFM_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_REQUEST_TIMEOUT_MS = 10_000;

const fetchWithTimeout = async (
  url: URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const queueScrobbleForRetry = async (
  songId: number,
  startTimeSecs: number,
  trackTitle: string,
  artistNames: string
): Promise<void> => {
  await insertScrobble({
    songId,
    startTimeSecs,
    operationType: 'scrobble',
    trackTitle,
    artistNames
  });
};

const scrobbleSong = async (songId: number, startTimeSecs: number) => {
  try {
    const { sendSongScrobblingDataToLastFM: isScrobblingEnabled } = await getUserSettings();

    if (!isScrobblingEnabled) {
      return logger.debug('Scrobble song request ignored - scrobbling disabled', {
        isScrobblingEnabled
      });
    }

    const isConnectedToInternet = checkIfConnectedToInternet();

    // Look up the song row once so we can capture title/artist for the queue
    // fallback regardless of which path we end up on.
    const songData = await getSongById(songId).catch(() => null);
    if (!songData) {
      logger.warn('Scrobble skipped - missing song metadata', { songId });
      return;
    }
    const song = convertToSongData(songData);
    const fallbackTrack = song.title ?? '';
    const fallbackArtist = song.artists?.map((a) => a.name).join(', ') ?? '';

    if (!isConnectedToInternet) {
      await queueScrobbleForRetry(songId, startTimeSecs, fallbackTrack, fallbackArtist);
      return logger.debug('Scrobble queued for later - offline', { songId });
    }

    {
      const authData = await getLastFmAuthData();

      const url = new URL(LASTFM_BASE_URL);
      url.searchParams.set('format', 'json');

      const params: ScrobbleParams = {
        track: song.title,
        artist: song.artists?.map((artist) => artist.name).join(', ') || '',
        timestamp: Math.floor(startTimeSecs),
        album: song.album?.name,
        albumArtist: song?.albumArtists?.map((artist) => artist.name).join(', '),
        trackNumber: song.trackNo,
        duration: Math.ceil(song.duration)
      };

      const body = generateApiRequestBodyForLastFMPostRequests({
        method: 'track.scrobble',
        authData,
        params
      });

      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body
        },
        LASTFM_REQUEST_TIMEOUT_MS
      );

      if (res.status === 200)
        return logger.debug(`Scrobbled song accepted.`, { songId: song.songId });

      const json: LastFMScrobblePostResponse = await res.json();
      await queueScrobbleForRetry(songId, startTimeSecs, fallbackTrack, fallbackArtist);
      return logger.warn('Failed to scrobble song to LastFM, queued for retry', { json });
    }
  } catch (error) {
    await queueScrobbleForRetry(songId, startTimeSecs, '', '').catch(() => {});
    return logger.error('Failed to scrobble song data to LastFM, queued for retry.', {
      error
    });
  }
};

export default scrobbleSong;
