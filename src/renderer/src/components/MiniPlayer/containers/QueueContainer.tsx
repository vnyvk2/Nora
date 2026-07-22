import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../../assets/images/webp/song_cover_default.webp';
import Img from '../../Img';
import calculateTimeFromSeconds from '../../../utils/calculateTimeFromSeconds';

type Props = { isQueueVisible: boolean };

const QueueContainer = (props: Props) => {
  const { isQueueVisible } = props;

  const currentSongId = useStore(store, (state) => state.currentSongData.songId);
  const queue = useStore(store, (state) => state.localStorage.queue);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);

  const { changeQueueCurrentSongIndex } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const listRef = useRef<HTMLDivElement>(null);

  const { data: queuedSongs } = useQuery({
    ...songQuery.queue(queue.songIds),
    enabled: queue.songIds.length > 0 && isQueueVisible
  });

  // Auto-scroll to the currently playing song when the queue opens
  useEffect(() => {
    if (isQueueVisible && queuedSongs && listRef.current) {
      const activeIndex = queue.songIds.indexOf(currentSongId);
      if (activeIndex >= 0) {
        // Each item is ~52px tall. Scroll so the active item is centered.
        const itemHeight = 52;
        const containerHeight = listRef.current.clientHeight;
        const scrollTarget = activeIndex * itemHeight - containerHeight / 2 + itemHeight / 2;
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        });
      }
    }
  }, [isQueueVisible, queuedSongs, currentSongId, queue.songIds]);

  const handleSongClick = useCallback(
    (index: number) => {
      changeQueueCurrentSongIndex(index);
    },
    [changeQueueCurrentSongIndex]
  );

  const songItems = useMemo(() => {
    if (!queuedSongs) return null;

    return queuedSongs.map((song, index) => {
      const isActive = song.songId === currentSongId;
      const duration = calculateTimeFromSeconds(song.duration);

      return (
        <button
          key={`${song.songId}-${index}`}
          type="button"
          className={`queue-song-item flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 ${
            isActive
              ? 'bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20'
              : 'hover:bg-font-color-white/10'
          }`}
          onClick={() => handleSongClick(index)}
        >
          {/* Artwork */}
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded">
            <Img
              src={song.artworkPaths?.optimizedArtworkPath || song.artworkPaths?.artworkPath}
              fallbackSrc={DefaultSongCover}
              loading="lazy"
              alt={song.title}
              className="h-full w-full object-cover"
            />
            {isActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {isCurrentSongPlaying ? 'equalizer' : 'pause'}
                </span>
              </div>
            )}
          </div>

          {/* Song Info */}
          <div className="min-w-0 flex-1">
            <div
              className={`truncate text-sm leading-tight ${
                isActive
                  ? 'text-font-color-highlight font-medium dark:text-dark-font-color-highlight'
                  : 'text-font-color-white'
              }`}
            >
              {song.title}
            </div>
            <div className="text-font-color-white/50 truncate text-xs leading-tight">
              {song.artists?.map((a) => a.name).join(', ') || t('common.unknownArtist')}
            </div>
          </div>

          {/* Duration */}
          <div className="text-font-color-white/40 shrink-0 text-xs tabular-nums">
            {duration.timeString}
          </div>

          {/* Favorite indicator */}
          {song.isAFavorite && (
            <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight shrink-0 text-xs">
              favorite
            </span>
          )}
        </button>
      );
    });
  }, [queuedSongs, currentSongId, isCurrentSongPlaying, handleSongClick, t]);

  if (!isQueueVisible) return null;

  return (
    <div
      className={`mini-player-queue-container absolute inset-0 z-20 flex flex-col overflow-hidden transition-opacity duration-200 ${
        isQueueVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Header */}
      <div className="shrink-0 px-4 pt-10 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-font-color-white text-sm font-semibold uppercase tracking-wider opacity-60">
            {t('currentQueuePage.queue', 'Queue')}
          </span>
          <span className="text-font-color-white/40 text-xs">
            {queuedSongs
              ? t('common.songWithCount', { count: queuedSongs.length })
              : ''}
          </span>
        </div>
      </div>

      {/* Song List */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 pb-20"
      >
        {queuedSongs && queuedSongs.length > 0 ? (
          songItems
        ) : (
          <div className="text-font-color-white/40 flex h-full items-center justify-center text-sm">
            {t('currentQueuePage.empty', 'Queue is empty')}
          </div>
        )}
      </div>
    </div>
  );
};

export default QueueContainer;
