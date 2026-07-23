import { app } from 'electron';
import path from 'path';
import Piscina from 'piscina';

// Use path.join to point to the compiled worker file in the output directory
// app.getAppPath() points to out/main if running in dev or packaged.
// In electron-vite, the main process is bundled to out/main/
const workerPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar', 'out', 'main', 'metadataParser.worker.js')
  : path.join(app.getAppPath(), 'out', 'main', 'metadataParser.worker.js');

export const metadataWorkerPool = new Piscina({
  filename: workerPath,
  maxThreads: 4 // Reasonable default for metadata parsing
});
