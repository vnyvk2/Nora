import fs from 'fs/promises';
import path from 'path';

import { db } from '@main/db/db';
import { getAllFolderStructures, saveAllFolderStructures } from '@main/db/queries/folders';

import { supportedMusicExtensions } from '../filesystem';
import logger from '../logger';
import { sendMessageToRenderer } from '../main';
import mapWithConcurrency from '../utils/mapWithConcurrency';
import addWatchersToFolders from './addWatchersToFolders';
import { closeAbortController } from './controlAbortControllers';

const FOLDER_READ_CONCURRENCY = 16;

export const getAllFoldersFromFolderStructures = (folderStructures: FolderStructure[]) => {
  const folderData: MusicFolderData[] = [];

  for (const structure of folderStructures) {
    const { path: folderPath, stats } = structure;
    folderData.push({ path: folderPath, stats });

    if (structure.subFolders.length > 0) {
      const subFolders = getAllFoldersFromFolderStructures(structure.subFolders);
      folderData.push(...subFolders);
    }
  }

  return folderData;
};

export const getAllFilePathsFromFolder = async (folderPath: string) => {
  try {
    const baseNames = await fs.readdir(folderPath);
    const filePaths = baseNames
      .filter((baseName) => path.extname(baseName))
      .map((baseName) => path.join(folderPath, baseName));

    return filePaths;
  } catch (error) {
    logger.error(`Failed to get file paths from a folder`, { error, folderPath });
    return [];
  }
};

export const getAllFilesFromFolderStructures = async (folderStructures: FolderStructure[]) => {
  const allFolders = getAllFoldersFromFolderStructures(folderStructures);
  const allFiles = (
    await mapWithConcurrency(allFolders, FOLDER_READ_CONCURRENCY, (folder) =>
      getAllFilePathsFromFolder(folder.path)
    )
  ).flat();

  return allFiles;
};

export const doesFolderExistInFolderStructure = async (
  dir: string,
  folders?: FolderStructure[]
) => {
  let songFolders: FolderStructure[] = [];
  if (folders === undefined) songFolders = await getAllFolderStructures();
  else songFolders = folders;

  for (const folder of songFolders) {
    if (folder.path === dir) return true;
    if (folder.subFolders.length > 0) {
      const isFolderExistInSubDirs = await doesFolderExistInFolderStructure(dir, folder.subFolders);
      if (isFolderExistInSubDirs) return true;
    }
  }
  return false;
};

const isSubPath = (parentDir: string, childDir: string) => {
  const relative = path.relative(parentDir, childDir);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const updateStructure = (
  structure: FolderStructure,
  musicFolders: FolderStructure[]
): FolderStructure[] => {
  let isFound = false;

  const filteredMusicFolders = musicFolders.filter((folder) => !isSubPath(structure.path, folder.path));

  for (const folder of filteredMusicFolders) {
    if (folder.path === structure.path) {
      folder.stats = structure.stats;

      const filteredFolderSubFolders = folder.subFolders.filter(
        (folderSubFolder) =>
          !structure.subFolders.some(
            (structureSubFolder) => structureSubFolder.path === folderSubFolder.path
          )
      );

      filteredFolderSubFolders.push(...structure.subFolders);
      folder.subFolders = filteredFolderSubFolders;
      isFound = true;
      break;
    }
    if (isSubPath(folder.path, structure.path)) {
      const updatedSubFolders = updateStructure(structure, folder.subFolders);
      folder.subFolders = updatedSubFolders;
      isFound = true;
      break;
    }
  }

  if (!isFound) filteredMusicFolders.push(structure);
  return filteredMusicFolders;
};

const clearAllFolderWatches = async () => {
  const musicFolders = await getAllFolderStructures();
  const folderPaths = getAllFoldersFromFolderStructures(musicFolders);

  for (const folderPath of folderPaths) {
    closeAbortController(folderPath.path);
  }
  logger.info('Closed all folders watches successfully.');
};

export const saveFolderStructures = async (
  structures: FolderStructure[],
  resetWatchers = false
) => {
  const data = await db.transaction(async (trx) => {
    let musicFolders = await getAllFolderStructures(trx);

    for (const structure of structures) {
      musicFolders = updateStructure(structure, musicFolders);
    }
    if (resetWatchers) clearAllFolderWatches();

    const result = await saveAllFolderStructures(musicFolders, trx);
    return result;
  });

  if (resetWatchers) addWatchersToFolders();
  return data;
};

const parseFolderStructuresForSongPaths = async (folderStructures: FolderStructure[]) => {
  const foldersWithStatData = getAllFoldersFromFolderStructures(folderStructures);

  sendMessageToRenderer({
    messageCode: 'FOLDER_PARSED_FOR_DIRECTORIES',
    data: {
      count: foldersWithStatData.length,
      folderCount: folderStructures.length
    }
  });

  const { addedFolders, updatedFolders } = await saveFolderStructures(folderStructures, true);

  const selectedPaths = new Set(foldersWithStatData.map((f) => f.path));
  const relevantFolders = [...addedFolders, ...updatedFolders].filter((f) =>
    selectedPaths.has(f.path)
  );

  const allFilesDataNested = await mapWithConcurrency(
    relevantFolders,
    FOLDER_READ_CONCURRENCY,
    async (folder) => {
      const paths = await getAllFilePathsFromFolder(folder.path);
      return paths.map((songPath) => ({ songPath, folder }));
    }
  );
  const allFilesData = allFilesDataNested.flat();
  const allSongPaths = allFilesData.filter((file) => {
    const fileExtension = path.extname(file.songPath);
    return supportedMusicExtensions.includes(fileExtension);
  });

  logger.info(`Parsed selected folders successfully.`, {
    songCount: allSongPaths.length,
    totalFileCount: allFilesData.length,
    subFolderCount: foldersWithStatData.length,
    selectedFolderCount: folderStructures.length
  });

  return allSongPaths;
};

export default parseFolderStructuresForSongPaths;
