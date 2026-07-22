import { useCallback } from 'react';

import type AudioPlayer from '../other/player';
import { getQueuesManager } from '../other/queuesManager';
import { store } from '../store/store';

export function usePlayerNavigation(
  playerInstance: AudioPlayer | HTMLAudioElement,
  toggleSongPlayback: (startPlay?: boolean) => void,
  recordListeningData: (
    songId: number,
    duration: number,
    isListeningDataRecorded?: boolean,
    isRecordingPlayTime?: boolean
  ) => void
) {
  const player =
    playerInstance instanceof HTMLAudioElement
      ? playerInstance
      : (playerInstance as AudioPlayer).audio;
  const audioPlayer =
    playerInstance instanceof HTMLAudioElement ? null : (playerInstance as AudioPlayer);
  const manager = getQueuesManager();

  const changeQueueCurrentSongIndex = useCallback(
    (currentSongIndex: number) => {
      const playerQueue = manager.getActiveQueue();
      const moved = playerQueue.moveToPosition(currentSongIndex);

      if (!moved) {
        return console.error('Failed to move to position:', currentSongIndex);
      }

      const songId = playerQueue.currentSongId;
      if (songId == null) {
        return console.error('Selected song id not found.');
      }
    },
    [manager]
  );

  const handleSkipBackwardClick = useCallback(() => {
    if (audioPlayer) {
      audioPlayer.skipBackward();
      return;
    }

    const playerQueue = manager.getActiveQueue();

    if (player.currentTime > 5) {
      player.currentTime = 0;
    } else if (typeof playerQueue.currentSongId === 'number') {
      if (playerQueue.hasPrevious) {
        playerQueue.moveToPrevious();
      } else {
        playerQueue.moveToStart();
      }
    } else if (playerQueue.length > 0) {
      playerQueue.moveToStart();
    }
  }, [audioPlayer, player, manager]);

  const handleSkipForwardClick = useCallback(
    (reason: SongSkipReason = 'USER_SKIP') => {
      if (audioPlayer) {
        if (reason !== 'USER_SKIP') {
          const handleRepeat = (data: { songId: number; duration: number }) => {
            recordListeningData(data.songId, data.duration, true);
            audioPlayer.off('repeatSong', handleRepeat);
          };
          audioPlayer.on('repeatSong', handleRepeat);
        }
        audioPlayer.skipForward(reason);
        return;
      }

      const playerQueue = manager.getActiveQueue();

      if (store.state.player.isRepeating === 'repeat-1' && reason !== 'USER_SKIP') {
        player.currentTime = 0;
        toggleSongPlayback(true);
        recordListeningData(
          store.state.currentSongData.songId,
          store.state.currentSongData.duration,
          true
        );
      } else if (playerQueue.hasNext) {
        playerQueue.moveToNext();
      } else if (store.state.player.isRepeating === 'repeat') {
        playerQueue.moveToStart();
      }
    },
    [audioPlayer, recordListeningData, toggleSongPlayback, player, manager]
  );

  return {
    changeQueueCurrentSongIndex,
    handleSkipBackwardClick,
    handleSkipForwardClick
  };
}
