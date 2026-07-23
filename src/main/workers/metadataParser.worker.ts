import { File } from 'node-taglib-sharp';
import path from 'path';

export interface MetadataWorkerResult {
  title?: string;
  year?: number;
  disc?: number;
  track?: number;
  performers: string[];
  albumArtists: string[];
  album?: string;
  genres: string[];
  durationMilliseconds: number;
  audioSampleRate: number;
  audioBitrate?: number;
  audioChannels: number;
  hasArtwork: boolean;
  expectedLrcPath: string;
}

export default function parseMetadata(absoluteFilePath: string): MetadataWorkerResult {
  const file = File.createFromPath(absoluteFilePath);
  const metadata = file.tag;
  const properties = file.properties;

  if (!metadata || !properties) {
    throw new Error(`Failed to parse metadata for ${absoluteFilePath}`);
  }

  // Determine the expected .lrc path (usually same name as audio file, but with .lrc extension)
  const ext = path.extname(absoluteFilePath);
  const expectedLrcPath = absoluteFilePath.slice(0, -ext.length) + '.lrc';

  // We explicitly extract primitive values to ensure structured cloning works across the worker boundary.
  // We do NOT extract the raw picture byte arrays here, as that would bloat the IPC/worker messages.
  return {
    title: metadata.title || path.basename(absoluteFilePath, ext),
    year: metadata.year || undefined,
    disc: metadata.disc ?? undefined,
    track: metadata.track ?? undefined,
    performers: Array.isArray(metadata.performers) ? metadata.performers : [],
    albumArtists: Array.isArray(metadata.albumArtists) ? metadata.albumArtists : [],
    album: metadata.album || undefined,
    genres: Array.isArray(metadata.genres) ? metadata.genres : [],
    durationMilliseconds: properties.durationMilliseconds,
    audioSampleRate: properties.audioSampleRate,
    audioBitrate: properties.audioBitrate ? Math.ceil(properties.audioBitrate) : undefined,
    audioChannels: properties.audioChannels,
    hasArtwork: metadata.pictures && metadata.pictures.length > 0,
    expectedLrcPath
  };
}
