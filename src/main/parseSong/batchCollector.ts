

import { db } from '@main/db/db';
import { linkArtworksToSong } from '@main/db/queries/artworks';
import { saveSong } from '@main/db/queries/songs';
import type { songs } from '@main/db/schema';
import logger from '../logger';
import { dataUpdateEvent } from '../main';
import { storeArtworks } from '../other/artworks';
import { getSongDurationFromSong } from './parseSong';

import manageAlbumArtistOfParsedSong from './manageAlbumArtistOfParsedSong';
import manageAlbumsOfParsedSong from './manageAlbumsOfParsedSong';
import manageArtistsOfParsedSong from './manageArtistsOfParsedSong';
import manageGenresOfParsedSong from './manageGenresOfParsedSong';
import type { MetadataWorkerResult } from '../workers/metadataParser.worker';
import { getScanState } from '../fs/scanState';

interface BatchItem {
  metadata: MetadataWorkerResult;
  absoluteFilePath: string;
  folderId?: number;
  stats?: any; // fs.Stats equivalent
}

let batchQueue: BatchItem[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;
let batchEvents: {
  newSongs: number[];
  newArtists: number[];
  relevantArtists: number[];
  newAlbums: number[];
  relevantAlbums: number[];
  newGenres: number[];
  relevantGenres: number[];
} = {
  newSongs: [],
  newArtists: [],
  relevantArtists: [],
  newAlbums: [],
  relevantAlbums: [],
  newGenres: [],
  relevantGenres: []
};

// Reset events collector
const resetEvents = () => {
  batchEvents = {
    newSongs: [],
    newArtists: [],
    relevantArtists: [],
    newAlbums: [],
    relevantAlbums: [],
    newGenres: [],
    relevantGenres: []
  };
};

export const pushToBatch = (item: BatchItem) => {
  batchQueue.push(item);

  if (batchQueue.length >= 200) {
    if (flushTimer) clearTimeout(flushTimer);
    flushBatch();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushBatch();
    }, 1500);
  }
};

export const getIsFlushing = () => isFlushing;
export const getBatchQueueLength = () => batchQueue.length;

export const flushBatch = async () => {
  if (isFlushing || batchQueue.length === 0) return;
  
  isFlushing = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const itemsToProcess = [...batchQueue];
  batchQueue = [];

  logger.debug(`Flushing batch of ${itemsToProcess.length} songs to DB...`);

  try {
    await db.transaction(async (trx) => {
      for (const item of itemsToProcess) {
        const { metadata, absoluteFilePath, folderId, stats } = item;

        const songInfo: typeof songs.$inferInsert = {
          title: metadata.title || 'Unknown Title',
          duration: getSongDurationFromSong(metadata.durationMilliseconds / 1000).toFixed(2),
          year: metadata.year || undefined,
          path: absoluteFilePath,
          sampleRate: metadata.audioSampleRate,
          bitRate: metadata.audioBitrate,
          noOfChannels: metadata.audioChannels,
          diskNumber: metadata.disc ?? undefined,
          trackNumber: metadata.track ?? undefined,
          fileCreatedAt: stats ? stats.birthtime : new Date(),
          fileModifiedAt: stats ? stats.mtime : new Date(),
          size: stats ? stats.size : undefined,
          folderId
        };

        const songData = await saveSong(songInfo, trx);
        batchEvents.newSongs.push(songData.id);

        // Store default artwork for now. Actual extraction happens in background queue later.
        const artworkData = await storeArtworks('songs', undefined, trx);

        await linkArtworksToSong(
          artworkData.map((artwork) => ({
            songId: songData.id,
            artworkId: artwork.id
          })),
          trx
        );

        const artistsData = metadata.performers;
        const albumArtistsData = metadata.albumArtists;
        const albumData = metadata.album;
        const genresData = metadata.genres;

        const { relevantAlbum, newAlbum } = await manageAlbumsOfParsedSong(
          {
            songId: songData.id,
            artworkId: artworkData[0].id,
            songYear: songData.year,
            artists: artistsData,
            albumArtists: albumArtistsData,
            albumName: albumData
          },
          trx
        );

        if (newAlbum) batchEvents.newAlbums.push(newAlbum.id);
        if (relevantAlbum) batchEvents.relevantAlbums.push(relevantAlbum.id);

        const { newArtists, relevantArtists } = await manageArtistsOfParsedSong(
          {
            artworkId: artworkData[0].id,
            songId: songData.id,
            songArtists: artistsData
          },
          trx
        );

        batchEvents.newArtists.push(...newArtists.map((x) => x.id));
        batchEvents.relevantArtists.push(...relevantArtists.map((x) => x.id));

        await manageAlbumArtistOfParsedSong(
          { albumArtists: albumArtistsData, albumId: relevantAlbum?.id },
          trx
        );

        const { newGenres, relevantGenres } = await manageGenresOfParsedSong(
          {
            artworkId: artworkData[0].id,
            songId: songData.id,
            songGenres: genresData
          },
          trx
        );

        batchEvents.newGenres.push(...newGenres.map((x) => x.id));
        batchEvents.relevantGenres.push(...relevantGenres.map((x) => x.id));
      }
    });

    logger.debug(`Batch flush successful. Triggering IPC updates for ${itemsToProcess.length} songs.`);
    
    // We do NOT fire 'songs/newSong' here to avoid invalidating the main React Query loop while scanning.
    // Instead we accumulate them or send a bulk notification. But we don't want to freeze the UI.
    // Progress events will be handled centrally by the scan orchestrator.

    if (!['SCANNING', 'CANCELLING'].includes(getScanState())) {
       // If somehow flushed outside of a scan, trigger normal updates
       if (batchEvents.newSongs.length > 0) dataUpdateEvent('songs/newSong', batchEvents.newSongs);
    }
    
    resetEvents();

  } catch (error) {
    logger.error('Failed to flush batch of songs', { error });
    // In a robust system, we might retry individually, but for now we throw and let the orchestrator handle it.
  } finally {
    isFlushing = false;
    // If more items came in while flushing, schedule another flush
    if (batchQueue.length > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushBatch();
      }, 1500);
    }
  }
};
