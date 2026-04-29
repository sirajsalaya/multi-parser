import type { IncomingFilePart, StorageEngine, StorageHandleFileCallback } from '../types';

class MemoryStorage implements StorageEngine {
  _handleFile(
    _req: Parameters<StorageEngine['_handleFile']>[0],
    file: IncomingFilePart,
    cb: StorageHandleFileCallback,
  ): void {
    const chunks: Buffer[] = [];
    let size = 0;
    let finished = false;

    const done = (error: Error | null, info?: { buffer: Buffer; size: number }): void => {
      if (finished) {
        return;
      }
      finished = true;
      cb(error, info);
    };

    file.stream.on('data', (chunk: Buffer | string) => {
      const normalized = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(normalized);
      size += normalized.length;
    });

    file.stream.on('error', (error) => {
      done(error);
    });

    file.stream.on('end', () => {
      done(null, { buffer: Buffer.concat(chunks), size });
    });
  }

  _removeFile(
    _req: Parameters<StorageEngine['_removeFile']>[0],
    file: Parameters<StorageEngine['_removeFile']>[1],
    cb: Parameters<StorageEngine['_removeFile']>[2],
  ): void {
    delete file.buffer;
    cb(null);
  }
}

function memoryStorage(): StorageEngine {
  return new MemoryStorage();
}

export default memoryStorage;
