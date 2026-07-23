import fs from 'fs/promises';
import path from 'path';

import { getSongBasicInfoByPath } from '@main/db/queries/songs';
import { metadataWorkerPool } from '../workers/workerPool';
import { pushToBatch } from './batchCollector';

import logger from '../logger';
import { generatePalettes } from '../other/generatePalette';
import reParseSong from './reParseSong';

const pathsQueue = new Set<string>();
export const ARTIST_SEPARATOR_REGEX = /[;]/gm;

export const tryToParseSong = async (
  songPath: string,
  folderId?: number,
  reparseToSync = false,
  generatePalettesAfterParsing = false
) => {
  const isSongInPathsQueue = pathsQueue.has(songPath);

  if (!isSongInPathsQueue) {
    pathsQueue.add(songPath);

    try {
      await parseSong(songPath, folderId, reparseToSync);
      logger.debug(`song queued for batch DB insert.`, { songPath });
      
      // Note: Palettes generate asynchronously. Batch flush handles actual DB commit.
      if (generatePalettesAfterParsing) setTimeout(generatePalettes, 1500);
      
    } catch (error) {
      logger.error(`Failed to parse song data for ${songPath}.`, { error });
    } finally {
      pathsQueue.delete(songPath);
    }
  } else {
    logger.info('Song parsing ignored because it is not eligible (in queue).', {
      songPath
    });
  }
};

const parseQueue = new Set<string>();

export const parseSong = async (
  absoluteFilePath: string,
  folderId?: number,
  reparseToSync = false
): Promise<void> => {
  const isSongInParseQueue = parseQueue.has(absoluteFilePath);
  if (isSongInParseQueue) {
    logger.debug('Song not eligable for parsing (already parsing).', {
      absoluteFilePath
    });
    return;
  }

  parseQueue.add(absoluteFilePath);

  try {
    const stats = await fs.stat(absoluteFilePath).catch(() => null);
    const existingSongInfo = await getSongBasicInfoByPath(absoluteFilePath);

    const isSongUnchanged =
      existingSongInfo &&
      stats &&
      existingSongInfo.fileModifiedAt.getTime() === stats.mtime.getTime() &&
      existingSongInfo.size === stats.size;

    if (isSongUnchanged && !reparseToSync) {
      logger.debug('Song not eligable for parsing (unchanged).', {
        absoluteFilePath,
        reason: { isSongUnchanged: true }
      });
      return;
    }

    if (existingSongInfo && !isSongUnchanged && !reparseToSync) {
      // It exists but changed, so it should be reparsed.
      await reParseSong(absoluteFilePath);
      return;
    }

    // Call worker for metadata extraction
    logger.debug(`Sending ${path.basename(absoluteFilePath)} to worker thread.`);
    const metadata = await metadataWorkerPool.run(absoluteFilePath);
    
    // Push to batch collector instead of committing immediately
    pushToBatch({
      metadata,
      absoluteFilePath,
      folderId,
      stats
    });

  } catch (error) {
    logger.error(`Error occurred when parsing a song.`, {
      error,
      absoluteFilePath
    });
    throw error;
  } finally {
    parseQueue.delete(absoluteFilePath);
  }
};

export const getArtistNamesFromSong = (artists?: string | string[]) => {
  if (artists) {
    const artistNames = Array.isArray(artists) ? artists : [artists];
    const splittedArtists = artistNames
      .flatMap((artist) => artist.split(ARTIST_SEPARATOR_REGEX))
      .map((artist) => artist.trim())
      .filter((a) => a.length > 0);

    return splittedArtists;
  }
  return [];
};

export const getSongDurationFromSong = (duration?: number) => {
  if (typeof duration === 'number') {
    const fixedDuration = duration.toFixed(2);
    return parseFloat(fixedDuration);
  }
  return 0;
};

export const getAlbumInfoFromSong = (album?: string) => {
  if (album) return album;
  return undefined;
};

export const getGenreInfoFromSong = (genres?: string[]) => {
  if (Array.isArray(genres) && genres.length > 0) return genres;

  return [];
};
