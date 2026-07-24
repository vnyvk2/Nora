import { useCallback } from 'react';

import { getQueuesManager } from '../other/queuesManager';
import { dispatch, store } from '../store/store';
import storage from '../utils/localStorage';

export interface QueueManagementDependencies {
  playSong: (songId: number, isStartPlay?: boolean) => void;
}

export function useQueueManagement(dependencies: QueueManagementDependencies) {
  const { playSong } = dependencies;
  const manager = getQueuesManager();
  
  const getActiveQueue = useCallback(() => manager.getActiveQueue(), [manager]);

  const createQueue = useCallback(
    (
      newQueue: number[],
      queueType: QueueTypes,
      isShuffleQueue = false,
      queueId?: string | number,
      startPlaying = true
    ) => {
      if (newQueue.length === 0) {
        return console.error('Cannot create an empty queue.');
      }

      const playerQueue = manager.createQueue(undefined, newQueue);
      playerQueue.setMetadata(queueId, queueType);

      if (isShuffleQueue) {
        playerQueue.shuffle();
      }

      manager.switchQueue(manager.queues.length - 1);

      if (startPlaying && playerQueue.currentSongId) {
        playSong(playerQueue.currentSongId as number, true);
      }
    },
    [manager, playSong]
  );

  const updateQueueData = useCallback(
    (
      currentSongIndex?: number,
      queue?: number[],
      isShuffleQueue = false,
      playCurrentSongIndex = false,
      restoreAndClearPreviousQueue = false
    ) => {
      const playerQueue = getActiveQueue();
      
      if (queue) {
        playerQueue.songIds = queue;
      }
      
      if (currentSongIndex !== undefined) {
        playerQueue.position = currentSongIndex;
      }
      
      if (isShuffleQueue) {
        playerQueue.shuffle();
      }
      
      if (restoreAndClearPreviousQueue) {
        playerQueue.clearShuffleHistory();
      }
      
      if (playCurrentSongIndex && playerQueue.currentSongId) {
        playSong(playerQueue.currentSongId, true);
      }
      
      storage.queue.setQueue({ queues: manager.queues.map((q) => q.toJSON()), currentQueueIndex: manager.activeQueueIndex });
    },
    [getActiveQueue, manager, playSong]
  );

  const toggleQueueShuffle = useCallback(
    (isShuffle?: boolean | any) => {
      const playerQueue = getActiveQueue();
      if (typeof isShuffle === 'boolean') {
        if (isShuffle) {
          playerQueue.shuffle();
        } else {
          playerQueue.restoreFromShuffle();
        }
      } else {
        if (playerQueue.queueBeforeShuffle) {
          playerQueue.restoreFromShuffle();
        } else {
          playerQueue.shuffle();
        }
      }
    },
    [getActiveQueue]
  );

  const toggleShuffling = useCallback(
    (isShuffling?: boolean) => {
      const newState = isShuffling ?? !store.state.player.isShuffling;
      dispatch({ type: 'TOGGLE_SHUFFLE_STATE', data: newState });
      toggleQueueShuffle(newState);
    },
    [toggleQueueShuffle]
  );

  const changeUpNextSongData = useCallback((upNextSongData?: AudioPlayerData) => {
    dispatch({ type: 'UP_NEXT_SONG_DATA_CHANGE', data: upNextSongData });
  }, []);

  return {
    createQueue,
    updateQueueData,
    toggleQueueShuffle,
    toggleShuffling,
    changeUpNextSongData
  };
}
