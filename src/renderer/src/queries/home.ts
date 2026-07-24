import { SpecialPlaylists } from '@common/playlists.enum';
import { createQueryKeys } from '@lukemorales/query-key-factory';

const HOME_METRICS_FETCH_LIMIT = 35;

export const homeQuery = createQueryKeys('home', {
  recentlyPlayedSongs: {
    queryKey: null,
    queryFn: async (): Promise<SongData[]> => {
      console.log('[HOME QUERY] recentlyPlayedSongs started');
      const start = 0;
      const end = 30;
      const sortType: SongSortTypes = 'dateAddedDescending';

      try {
        console.log('[HOME QUERY] Calling IPC getAllHistorySongs');
        const paginatedResult = await window.api.audioLibraryControls.getAllHistorySongs(sortType, {
          start,
          end
        });
        console.log('[HOME QUERY] IPC getAllHistorySongs resolved:', paginatedResult);
        const data = Array.isArray(paginatedResult.data) ? paginatedResult.data : [];
        return data;
      } catch (error) {
        console.error('[HOME QUERY] IPC getAllHistorySongs ERROR:', error);
        throw error;
      }
    }
  },
  recentSongArtists: {
    queryKey: null,
    queryFn: async (): Promise<Artist[]> => {
      try {
        const { data: playlists } = await window.api.playlistsData.getPlaylistData([
          SpecialPlaylists.History
        ]);
        const historyPlaylist = playlists[0];

        if (!historyPlaylist || historyPlaylist.songs.length === 0) return [];

        const songs = await window.api.audioLibraryControls.getSongInfo(
          historyPlaylist.songs,
          undefined,
          undefined,
          HOME_METRICS_FETCH_LIMIT,
          true
        );

        if (!Array.isArray(songs) || songs.length === 0) return [];

        const artistIds = [
          ...new Set(
            songs
              .map((song) => (song.artists ? song.artists.map((artist) => artist.artistId) : []))
              .flat()
          )
        ];

        if (artistIds.length === 0) return [];

        const { data: artists } = await window.api.artistsData.getArtistData(
          artistIds,
          undefined,
          undefined,
          0,
          HOME_METRICS_FETCH_LIMIT
        );

        return artists;
      } catch (error) {
        console.error(error);
        return [];
      }
    }
  },
  mostLovedSongs: {
    queryKey: null,
    queryFn: async (): Promise<AudioInfo[]> => {
      try {
        const { data: playlists } = await window.api.playlistsData.getPlaylistData([
          SpecialPlaylists.Favorites
        ]);
        const favoritesPlaylist = playlists[0];

        if (!favoritesPlaylist || favoritesPlaylist.songs.length === 0) return [];

        const songs = await window.api.audioLibraryControls.getSongInfo(
          favoritesPlaylist.songs,
          'allTimeMostListened',
          undefined,
          HOME_METRICS_FETCH_LIMIT,
          true
        );

        return Array.isArray(songs) ? songs : [];
      } catch (error) {
        console.error(error);
        return [];
      }
    }
  }
});
