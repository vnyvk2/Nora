import roundTo from '@common/roundTo';
import { useEffect } from 'react';

import AudioPlayer from '../other/player';
import { getQueuesManager } from '../other/queuesManager';

const LOW_RESPONSE_DURATION = 100;
const DURATION = 1000;

// Module-level singleton - initialized with queue on first hook call
let playerInstance: AudioPlayer | null = null;

/**
 * Custom hook to manage the AudioPlayer singleton instance. Initializes the player with the shared
 * PlayerQueue if it hasn't been created yet.
 *
 * @returns The singleton AudioPlayer instance
 */
export function useAudioPlayer() {
  const manager = getQueuesManager();

  if (!playerInstance) {
    playerInstance = new AudioPlayer(manager);
  }

  // Cleanup on unmount is typically not needed for a global singleton player,
  // but we provide it here for completeness if the app ever fully unmounts
  useEffect(() => {
    // Store the non-null playerInstance in a local variable for readability
    const player = playerInstance!;

    const dispatchCurrentSongTime = () => {
      const playerPositionChange = new CustomEvent('player/positionChange', {
        detail: roundTo(player.currentTime || 0, 2)
      });
      document.dispatchEvent(playerPositionChange);
    };

    const lowResponseIntervalId = setInterval(() => {
      if (!player.paused) dispatchCurrentSongTime();
    }, LOW_RESPONSE_DURATION);

    const pausedResponseIntervalId = setInterval(() => {
      if (player.paused) dispatchCurrentSongTime();
    }, DURATION);

    return () => {
      clearInterval(lowResponseIntervalId);
      clearInterval(pausedResponseIntervalId);
    };
  }, []);

  return playerInstance;
}
