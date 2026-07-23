import { db } from '@main/db/db';
import { songs, artworks, artworksSongs } from '@main/db/schema';
import { eq, like } from 'drizzle-orm';
import { File } from 'node-taglib-sharp';
import { storeArtworks } from '../other/artworks';
import logger from '../logger';
import { dataUpdateEvent } from '../main';

// A simple queue to run slowly in the background
let isArtworkQueueRunning = false;

export const startArtworkQueue = async () => {
  if (isArtworkQueueRunning) return;
  isArtworkQueueRunning = true;

  try {
    // Find all songs that have the default artwork (or no custom artwork)
    const pendingSongs = await db
      .select({ id: songs.id, path: songs.path })
      .from(songs)
      .leftJoin(artworksSongs, eq(songs.id, artworksSongs.songId))
      .leftJoin(artworks, eq(artworksSongs.artworkId, artworks.id))
      .where(like(artworks.path, '%song_cover_default%'));

    if (pendingSongs.length === 0) {
      isArtworkQueueRunning = false;
      return;
    }

    logger.info(`Found ${pendingSongs.length} songs needing background artwork extraction.`);

    for (const song of pendingSongs) {
      try {
        const file = File.createFromPath(song.path);
        const metadata = file.tag;
        
        if (metadata && metadata.pictures && metadata.pictures.length > 0) {
          const buffer = metadata.pictures[0].data.toByteArray();
          
          await db.transaction(async (trx) => {
            const artworkData = await storeArtworks('songs', buffer, trx);
            
            // Delete the default artwork link
            await trx.delete(artworksSongs).where(eq(artworksSongs.songId, song.id));
            
            // Insert the new one
            await trx.insert(artworksSongs).values({
              songId: song.id,
              artworkId: artworkData[0].id
            });
          });
          
          dataUpdateEvent('songs/artworks', [song.id]);
        }
      } catch (err) {
        logger.error(`Failed background artwork extraction for song ${song.id}`, { err });
      }

      // Sleep a bit to avoid hogging CPU
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    logger.error('Error running artwork queue', { error });
  } finally {
    isArtworkQueueRunning = false;
  }
};
