import { getAllSongsInHistory } from '@main/db/queries/history';

import { convertToSongData } from '../utils/convert';

import logger from '../logger';

export const getAllHistorySongs = async (
  sortType?: SongSortTypes,
  paginatingData?: PaginatingData
): Promise<PaginatedResult<SongData, SongSortTypes>> => {
  logger.info('[MAIN] getAllHistorySongs called');
  try {
    const data = await getAllSongsInHistory(sortType, paginatingData);
    logger.info('[MAIN] getAllSongsInHistory finished', { count: data.data.length });
    const songs = data.data.map((song) => convertToSongData(song));

    return {
      data: songs,
      sortType: sortType || 'addedOrder',
      end: paginatingData?.end || 0,
      start: paginatingData?.start || 0,
      total: songs.length
    };
  } catch (error) {
    logger.error('[MAIN] getAllHistorySongs ERROR', { error });
    throw error;
  }
};
