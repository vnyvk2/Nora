import path from 'path';

import parseFolderStructuresForSongPaths, {
  doesFolderExistInFolderStructure
} from '../fs/parseFolderStructuresForSongPaths';
import logger from '../logger';
import { dataUpdateEvent, sendMessageToRenderer } from '../main';
import { generatePalettes } from '../other/generatePalette';
import { tryToParseSong } from '../parseSong/parseSong';
import { timeEnd, timeStart } from '../utils/measureTimeUsage';
import { setScanState, getScanState } from '../fs/scanState';
import { flushBatch, getIsFlushing, getBatchQueueLength } from '../parseSong/batchCollector';
import mapWithConcurrency from '../utils/mapWithConcurrency';
import { startArtworkQueue } from '../parseSong/artworkQueue';

const removeAlreadyAvailableStructures = async (structures: FolderStructure[]) => {
  const parents: FolderStructure[] = [];
  for (const structure of structures) {
    const doesParentStructureExist = await doesFolderExistInFolderStructure(structure.path);

    if (doesParentStructureExist) {
      if (structure.subFolders.length > 0) {
        const subFolders = await removeAlreadyAvailableStructures(structure.subFolders);
        parents.push(...subFolders);
      }
    } else {
      const subFolders = await removeAlreadyAvailableStructures(structure.subFolders);
      parents.push({ ...structure, subFolders });
    }
  }
  return parents;
};

const addMusicFromFolderStructures = async (
  structures: FolderStructure[],
  abortSignal?: AbortSignal
) => {
  logger.debug('Started the process of linking a music folders to the library.');

  logger.info(`Added new song folders to the app.`, {
    folderPaths: structures.map((x) => x.path)
  });

  const eligableStructures = await removeAlreadyAvailableStructures(structures);
  const songPathsData = await parseFolderStructuresForSongPaths(eligableStructures);

  if (songPathsData) {
    
    setScanState('SCANNING');
    sendMessageToRenderer({ messageCode: 'SCAN_PROCESS_UPDATE', data: { status: 'SCAN_STARTED' } });
    
    const startTime = timeStart();
    let completedCount = 0;

    await mapWithConcurrency(songPathsData, 16, async (songPathData) => {
      if (getScanState() === 'CANCELLING' || abortSignal?.aborted) {
        return;
      }

      try {
        await tryToParseSong(songPathData.songPath, songPathData.folder.id, false, false);
        completedCount++;
        
        sendMessageToRenderer({
          messageCode: 'SCAN_PROCESS_UPDATE',
          data: { 
            total: songPathsData.length, 
            value: completedCount, 
            status: 'PARSING_METADATA', 
            currentPath: songPathData.songPath
          }
        });
      } catch (error) {
        logger.error(`Failed to parse '${path.basename(songPathData.songPath)}'.`, {
          error,
          songPath: songPathData.songPath
        });
      }
    });

    // Wait for the batch collector to drain!
    while (getScanState() === 'CANCELLING' && (getIsFlushing() || getBatchQueueLength() > 0)) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Force a final flush if any items remain in the batch queue
    if (getScanState() === 'SCANNING' || getScanState() === 'IDLE') {
        await flushBatch();
    }

    if (getScanState() === 'CANCELLING' || abortSignal?.aborted) {
        setScanState('IDLE');
        sendMessageToRenderer({ messageCode: 'SCAN_PROCESS_COMPLETE', data: { status: 'CANCELLED' } });
        return;
    }
    
    timeEnd(startTime, 'Time to parse the whole folder');
    setTimeout(generatePalettes, 1500);
    
    setScanState('IDLE');
    sendMessageToRenderer({ messageCode: 'SCAN_PROCESS_COMPLETE', data: { status: 'COMPLETED' } });
    
    // Global query invalidation on scan complete
    dataUpdateEvent('songs');
    dataUpdateEvent('artists');
    dataUpdateEvent('albums');
    dataUpdateEvent('genres');
    
    // Start background extraction of artworks for songs we just parsed
    startArtworkQueue();
    
  } else throw new Error('Failed to get song paths from music folders.');

  logger.debug(
    `Successfully parsed ${songPathsData?.length || 0} songs from the selected music folders.`,
    { folderPaths: eligableStructures.map((x) => x.path) }
  );
  dataUpdateEvent('userData/musicFolder');
};

export default addMusicFromFolderStructures;
