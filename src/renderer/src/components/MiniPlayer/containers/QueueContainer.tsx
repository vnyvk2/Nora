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
    ...songQuery.queue(queue.queues[queue.currentQueueIndex].songIds),
    enabled: queue.queues[queue.currentQueueIndex].songIds.length > 0 && isQueueVisible
  });

  // Auto-scroll to the currently playing song when the queue opens
  useEffect(() => {
    if (isQueueVisible && queuedSongs && listRef.current) {
      const activeIndex = queue.queues[queue.currentQueueIndex].songIds.indexOf(currentSongId);
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
  }, [isQueueVisible, queuedSongs, currentSongId, queue.queues[queue.currentQueueIndex].songIds]);

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
            <div className="text-font-color-white/60 truncate text-xs leading-tight mt-0.5">
              {song.artists?.map((a) => a.name).join(', ') || t('common.unknownArtist')}
            </div>
            <div className="text-font-color-white/40 truncate text-xs leading-tight mt-0.5">
              {song.album?.name || t('common.unknownAlbum', 'Unknown Album')}
            </div>
          </div>

          {/* Right Side: Duration & Favorite */}
          <div className="flex flex-col items-end justify-center shrink-0 gap-1">
            <div className="text-font-color-white/40 text-xs tabular-nums">
              {duration.timeString}
            </div>
            {song.isAFavorite ? (
              <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-[14px]">
                favorite
              </span>
            ) : (
              <div className="h-[14px] w-[14px]" />
            )}
          </div>
        </button>
      );
    });
  }, [queuedSongs, currentSongId, isCurrentSongPlaying, handleSongClick, t]);

  if (!isQueueVisible) return null;

  return (
    <div className="mini-player-queue-container relative z-20 flex flex-1 flex-col overflow-hidden bg-[rgba(33,34,38,0.5)] backdrop-blur-md border-t border-white/5">
      {/* Header */}
      <div className="shrink-0 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-font-color-white text-xs font-semibold uppercase tracking-wider opacity-60">
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
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 pb-4 custom-scrollbar"
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
