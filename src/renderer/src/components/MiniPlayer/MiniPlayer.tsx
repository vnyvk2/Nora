import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import Button from '../Button';
import Img from '../Img';
import SeekBarSlider from '../SeekBarSlider';
import UpNextSongPopup from '../SongsControlsContainer/UpNextSongPopup';
import VolumeSlider from '../VolumeSlider';
import LyricsContainer from './containers/LyricsContainer';
import TitleBarContainer from './containers/TitleBarContainer';

type MiniPlayerProps = {
  className?: string;
};

export default function MiniPlayer(props: MiniPlayerProps) {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isAFavorite = useStore(store, (state) => state.currentSongData.isAFavorite);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const {
    toggleSongPlayback,
    updatePlayerType,
    handleSkipBackwardClick,
    handleSkipForwardClick,
    toggleIsFavorite,
    toggleMutedState
  } = useContext(AppUpdateContext);

  const { className } = props;
  const { t } = useTranslation();

  const [isNextSongPopupVisible, setIsNextSongPopupVisible] = useState(false);
  const [isLyricsVisible, setIsLyricsVisible] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);

  const manageKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === 'l') setIsLyricsVisible((prevState) => !prevState);
        if (e.key === 'n') updatePlayerType('normal');
      }
    },
    [updatePlayerType]
  );

  useEffect(() => {
    window.addEventListener('keydown', manageKeyboardShortcuts);
    return () => {
      window.removeEventListener('keydown', manageKeyboardShortcuts);
    };
  }, [manageKeyboardShortcuts]);

  const handleSkipForwardClickWithParams = useCallback(
    () => handleSkipForwardClick('USER_SKIP'),
    [handleSkipForwardClick]
  );

  // Controls and UI chrome are visible when: hovered, focused, or paused
  const showControls = !isCurrentSongPlaying;

  return (
    // ─── Root: 3-tier strict flex-col ─────────────────────────────────────────
    // At rest (playing, not hovered): ONLY album art visible.
    // On hover/focus/paused: title bar, song info, controls, seekbar fade in.
    <div
      className={`mini-player dark group !bg-dark-background-color-1 dark:!bg-dark-background-color-1 relative flex h-full flex-col overflow-hidden !transition-none select-none ${
        !isCurrentSongPlaying && 'paused'
      } ${preferences?.isReducedMotion ? 'reduced-motion' : ''} ${className}`}
    >
      {/* ── Background Album Art (absolute, behind all tiers) ──────────────── */}
      <div className="background-cover-img-container absolute inset-0 h-full w-full overflow-hidden">
        <Img
          src={currentSongData.artworkPath}
          fallbackSrc={DefaultSongCover}
          loading="eager"
          alt="Song Cover"
          className={`h-full w-full object-cover transition-[filter] delay-100 duration-200 ease-in-out group-focus-within:blur-[2px] group-focus-within:brightness-75 group-hover:blur-[2px] group-hover:brightness-75 group-focus:blur-[4px] group-focus:brightness-75 ${
            isLyricsVisible ? 'blur-[1rem]! brightness-[.25]!' : ''
          } ${!isCurrentSongPlaying ? 'blur-[1rem] brightness-75' : 'blur-0 brightness-100'}`}
        />
        {/* Gradient overlay — only visible when NOT showing lyrics, fades in on hover */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            isLyricsVisible
              ? 'opacity-0'
              : showControls
                ? 'bg-[linear-gradient(180deg,_rgba(2,_0,_36,_0)_0%,_rgba(33,_34,_38,_0.9)_90%)] opacity-100'
                : 'bg-[linear-gradient(180deg,_rgba(2,_0,_36,_0)_0%,_rgba(33,_34,_38,_0.9)_90%)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
          }`}
        ></div>
      </div>

      {/* ── Lyrics overlay (absolute, within the entire window when lyrics on) ── */}
      <LyricsContainer isLyricsVisible={isLyricsVisible} />

      {/* ═══ TIER 1 (TOP): Title Bar ═════════════════════════════════════════ */}
      {/* Fades in on hover/focus/paused — same as old behavior.                */}
      <div className="relative z-10 w-full">
        <TitleBarContainer isLyricsVisible={isLyricsVisible} />
      </div>

      {/* ═══ TIER 2 (MIDDLE): Song Info ══════════════════════════════════════ */}
      {/* flex-1 min-h-0 = flexible sponge, can shrink to 0px.                 */}
      {/* Song info fades in on hover/focus/paused.                            */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <div
          className={`song-info-container text-font-color-white flex w-full flex-col items-center justify-center px-4 text-center transition-[visibility,opacity] duration-200 ${
            isLyricsVisible
              ? 'invisible opacity-0'
              : showControls
                ? 'visible opacity-100'
                : 'invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'
          }`}
        >
          <div className="text-font-color-highlight relative flex w-full flex-col items-center justify-center">
            <div
              className="song-title max-w-full overflow-hidden text-xl font-medium text-ellipsis whitespace-nowrap"
              title={currentSongData.title}
            >
              {currentSongData.title}
            </div>
            {!isNextSongPopupVisible && (
              <div
                className="song-artists appear-from-bottom text-font-color-white/80 text-xs"
                title={currentSongData.artists?.map((artist) => artist.name).join(', ')}
              >
                {currentSongData.songId && Array.isArray(currentSongData.artists)
                  ? currentSongData.artists?.length > 0
                    ? currentSongData.artists.map((artist) => artist.name).join(', ')
                    : t('common.unknownArtist')
                  : ''}
              </div>
            )}
            <UpNextSongPopup
              isSemiTransparent
              onPopupAppears={(isVisible) => setIsNextSongPopupVisible(isVisible)}
            />
          </div>
        </div>
      </div>

      {/* ═══ TIER 3 (BOTTOM): SeekBar + Controls ════════════════════════════ */}
      {/* Fades in on hover/focus/paused — hidden at rest like the old design.  */}
      <div
        className={`relative z-10 w-full transition-[visibility,opacity] duration-200 ${
          showControls
            ? 'visible opacity-100'
            : 'invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100'
        }`}
      >
        {/* ── SeekBar: sits at the very top of the bottom tier ── */}
        <SeekBarSlider
          name="mini-player-seek-slider"
          id="miniPlayerSeekSlider"
          className="seek-slider bg-background-color-3/25 before:bg-background-color-3 float-left m-0 h-fit w-full appearance-none p-0 outline-hidden outline-offset-1 backdrop-blur-xs transition-[width,height] ease-in-out before:absolute before:top-1/2 before:left-0 before:h-1 before:w-[var(--seek-before-width)] before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,height] before:ease-in-out before:content-[''] group-focus-within:before:h-2 group-hover:before:h-2 focus-visible:outline!"
        />

        {/* ── Controls Row ─────────────────────────────────────── */}
        <div className="controls-row flex w-full items-center justify-center overflow-hidden pb-2 pt-1">
          {/* Optional: Favorite */}
          <Button
            className={`favorite-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-[transparent]! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-[transparent]! ${
              isAFavorite && 'after:opacity-100'
            }`}
            iconClassName={`text-lg! ${
              isAFavorite
                ? 'meterial-icons-round text-dark-background-color-3!'
                : 'material-icons-round-outlined'
            }`}
            isDisabled={!currentSongData.isKnownSource}
            tooltipLabel={
              currentSongData.isKnownSource
                ? t('player.likeDislike')
                : t('player.likeDislikeDisabled')
            }
            clickHandler={() => currentSongData.isKnownSource && toggleIsFavorite(!isAFavorite)}
            iconName="favorite"
            removeFocusOnClick
          />

          {/* Fixed: Skip Backward */}
          <Button
            className="skip-backward-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-[transparent]! p-1! outline-offset-1 focus-visible:outline! dark:bg-[transparent]!"
            tooltipLabel={t('player.prevSong')}
            iconClassName="text-3xl!"
            clickHandler={handleSkipBackwardClick}
            iconName="skip_previous"
            removeFocusOnClick
          />

          {/* Fixed: Play / Pause */}
          <Button
            className="play-pause-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-[transparent]! p-0! outline-offset-1 focus-visible:outline! dark:bg-[transparent]!"
            tooltipLabel={t('player.playPause')}
            iconClassName="text-5xl!"
            clickHandler={toggleSongPlayback}
            iconName={isCurrentSongPlaying ? 'pause_circle' : 'play_circle'}
            removeFocusOnClick
          />

          {/* Fixed: Skip Forward */}
          <Button
            className="skip-forward-btn text-font-color-white dark:text-font-color-white m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-[transparent]! p-1! outline-offset-1 focus-visible:outline! dark:bg-[transparent]!"
            tooltipLabel={t('player.nextSong')}
            iconClassName="text-3xl!"
            clickHandler={handleSkipForwardClickWithParams}
            iconName="skip_next"
            removeFocusOnClick
          />

          {/* Optional: Lyrics Toggle */}
          <Button
            className={`lyrics-btn text-font-color-white after:bg-font-color-highlight dark:text-font-color-white dark:after:bg-dark-font-color-highlight mini-optional-btn m-0! h-fit shrink-0 cursor-pointer rounded-none! border-0! bg-[transparent]! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-[transparent]! ${
              isLyricsVisible && 'text-dark-background-color-3! after:opacity-100'
            }`}
            iconClassName="text-lg!"
            clickHandler={() => setIsLyricsVisible((prevState) => !prevState)}
            iconName="notes"
            tooltipLabel={t('player.lyrics')}
            removeFocusOnClick
          />

          {/* Optional: Volume button + expanding slider */}
          <div
            className="mini-optional-btn relative flex shrink-0 items-center"
            onMouseEnter={() => setIsVolumeHovered(true)}
            onMouseLeave={() => setIsVolumeHovered(false)}
            onFocus={() => setIsVolumeHovered(true)}
            onBlur={() => setIsVolumeHovered(false)}
          >
            <Button
              className={`volume-btn after:bg-font-color-highlight dark:after:bg-dark-font-color-highlight m-0! rounded-none! border-0! bg-[transparent]! p-1! outline-offset-1 after:absolute after:h-1 after:w-1 after:translate-y-4 after:rounded-full after:opacity-0 after:transition-opacity focus-visible:outline! dark:bg-[transparent]! ${
                isMuted && 'after:opacity-100'
              }`}
              tooltipLabel={t('player.muteUnmute')}
              iconName={isMuted ? 'volume_off' : 'volume_up'}
              iconClassName={`material-icons-round text-lg! text-font-color-white opacity-80 transition-opacity hover:opacity-100 dark:text-font-color-white ${
                isMuted && 'text-font-color-highlight! opacity-100! dark:text-dark-font-color-highlight!'
              }`}
              clickHandler={() => toggleMutedState(!isMuted)}
              removeFocusOnClick
            />
            {/* Expanding volume slider — w-0 collapsed, w-20 expanded on hover */}
            <div
              className={`overflow-hidden transition-[width] duration-200 ease-in-out ${
                isVolumeHovered ? 'w-20' : 'w-0'
              }`}
            >
              <VolumeSlider
                name="mini-player-volume-slider"
                id="volumeSlider"
                className="before:bg-font-color-white/50 hover:before:bg-font-color-highlight dark:before:bg-font-color-white/50 dark:hover:before:bg-dark-font-color-highlight relative float-left m-0 h-6 w-20 appearance-none bg-[transparent]! p-0 outline-hidden outline-offset-1 before:absolute before:top-1/2 before:left-0 before:h-1 before:w-[var(--volume-before-width)] before:-translate-y-1/2 before:cursor-pointer before:rounded-3xl before:transition-[width,background] before:content-[''] focus-visible:outline!"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
