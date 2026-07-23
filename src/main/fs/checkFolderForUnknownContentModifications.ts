import fs from 'fs/promises';
import path from 'path';

import { getFolderFromPath } from '@main/db/queries/folders';
import { getSongsRelativeToFolder } from '@main/db/queries/songs';

import { supportedMusicExtensions } from '../filesystem';
import logger from '../logger';
import { generatePalettes } from '../other/generatePalette';
import { tryToParseSong } from '../parseSong/parseSong';
import removeSongsFromLibrary from '../removeSongsFromLibrary';
import mapWithConcurrency from '../utils/mapWithConcurrency';
import { saveAbortController } from './controlAbortControllers';

const abortController = new AbortController();
saveAbortController('checkFolderForUnknownContentModifications', abortController);
const FILE_STAT_CONCURRENCY = 16;
type FolderSong = Awaited<ReturnType<typeof getSongsRelativeToFolder>>[number];

const getSongsInFolder = async (folderPath: string) => {
  const relevantSongs = await getSongsRelativeToFolder(folderPath, {
    skipBlacklistedFolders: true,
    skipBlacklistedSongs: true
  });

  return relevantSongs;
};

const getFullPathsOfFolderDirs = async (folderPath: string) => {
  try {
    const dirs = await fs.readdir(folderPath);
    const supportedDirs = dirs.filter((filePath) =>
      supportedMusicExtensions.includes(path.extname(filePath))
    );
    const fullPaths = supportedDirs.map((filePath) => path.join(folderPath, filePath));
    return fullPaths;
  } catch (error) {
    logger.error(`Failed to read directory.`, { error, folderPath });
    return [];
  }
};

const removeDeletedSongsFromLibrary = async (
  deletedSongPaths: string[],
  abortSignal: AbortSignal
) => {
  try {
    await removeSongsFromLibrary(deletedSongPaths, abortSignal);
  } catch (error) {
    logger.error(`Failed to remove deleted songs from library.`, { error, deletedSongPaths });
  }
};

const getChangedSongPaths = async (songs: FolderSong[], currentSongPaths: Set<string>) => {
  const existingSongs = songs.filter((song) => currentSongPaths.has(song.path));
  const checkedSongPaths = await mapWithConcurrency(
    existingSongs,
    FILE_STAT_CONCURRENCY,
    async (song) => {
      try {
        const stats = await fs.stat(song.path);
        const hasFileChanged =
          song.fileModifiedAt.getTime() !== stats.mtime.getTime() || song.size !== stats.size;

        return hasFileChanged ? song.path : undefined;
      } catch (error) {
        logger.error(`Failed to check song stats for modifications.`, {
          error,
          songPath: song.path
        });
        return undefined;
      }
    }
  );

  return checkedSongPaths.filter((songPath) => typeof songPath === 'string');
};

const parseSongPathsInLibrary = async (
  folderPath: string,
  songPaths: string[],
  abortSignal: AbortSignal
) => {
  const folder = await getFolderFromPath(folderPath);

  for (let i = 0; i < songPaths.length; i += 1) {
    const songPath = songPaths[i];

    if (abortSignal?.aborted) {
      logger.warn('Parsing songs in the music folder aborted by an abortController signal.', {
        reason: abortSignal?.reason,
        songPath
      });
      break;
    }

    try {
      await tryToParseSong(songPath, folder?.id, false, false);
      logger.debug(`${path.basename(songPath)} song checked for library updates.`, {
        songPath
      });
    } catch (error) {
      logger.error(`Failed to parse song during folder modification check.`, {
        error,
        songPath
      });
    }
  }
  if (songPaths.length > 0) setTimeout(generatePalettes, 1500);
};

const checkFolderForUnknownModifications = async (folderPath: string) => {
  const relevantFolderSongs = await getSongsInFolder(folderPath);
  const relevantFolderSongPaths = relevantFolderSongs.map((song) => song.path);
  const dirs = await getFullPathsOfFolderDirs(folderPath);

  if (dirs) {
    const currentSongPaths = new Set(dirs);
    const savedSongPaths = new Set(relevantFolderSongPaths);
    const newlyAddedSongPaths = dirs.filter((dir) => !savedSongPaths.has(dir));
    const deletedSongPaths = relevantFolderSongPaths.filter((songPath) => !currentSongPaths.has(songPath));
    const changedSongPaths = await getChangedSongPaths(relevantFolderSongs, currentSongPaths);

    logger.debug(`Song additions/deletions/modifications detected.`, {
      newlyAddedSongPathsCount: newlyAddedSongPaths.length,
      deletedSongPathsCount: deletedSongPaths.length,
      changedSongPathsCount: changedSongPaths.length,
      newlyAddedSongPaths,
      deletedSongPaths,
      changedSongPaths,
      folderPath
    });

    // Prioritises deleting songs before adding or reparsing songs to prevent data clashes.
    if (deletedSongPaths.length > 0) {
      await removeDeletedSongsFromLibrary(deletedSongPaths, abortController.signal);
    }

    const parsableSongPaths = [...newlyAddedSongPaths, ...changedSongPaths];
    if (parsableSongPaths.length > 0) {
      await parseSongPathsInLibrary(folderPath, parsableSongPaths, abortController.signal);
    }
  }
};

export default checkFolderForUnknownModifications;
