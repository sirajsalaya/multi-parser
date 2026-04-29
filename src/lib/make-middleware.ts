import createBusboy from 'busboy';
import { appendValueAtPath, createAppendContext, pathStartsWithArray, resolveAppendPath } from './path-appender';
import Counter from './counter';
import MulterError from './multer-error';
import removeUploadedFiles from './remove-uploaded-files';
import type {
  FileFilter,
  IncomingFilePart,
  MultipartBodyLimits,
  MultipartBodyMiddleware,
  StoredFileDto,
  StorageEngine,
} from '../types';

type MiddlewareSetup = {
  limits?: MultipartBodyLimits;
  preservePath?: boolean;
  defParamCharset?: string;
  fileFilter: FileFilter;
  storage: StorageEngine;
};

type BusboyInstance = ReturnType<typeof createBusboy>;

type BusboyFileInfo = {
  filename: string;
  encoding: string;
  mimeType: string;
};

type BusboyFieldInfo = {
  nameTruncated?: boolean;
  valueTruncated?: boolean;
};

function isMultipart(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().includes('multipart/form-data');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function drainStream(stream: NodeJS.ReadableStream): void {
  stream.on('readable', () => {
    while (stream.read() !== null) {
      // Drain unread data.
    }
  });
}

function ensureBodyContainer(
  req: Parameters<MultipartBodyMiddleware>[0],
  prefersArrayRoot: boolean,
): Record<string, unknown> | unknown[] {
  if (prefersArrayRoot) {
    if (!isArray(req.body)) {
      req.body = [];
    }
    return req.body;
  }

  if (!isObject(req.body)) {
    req.body = {};
  }
  return req.body;
}

function makeMiddleware(setup: MiddlewareSetup): MultipartBodyMiddleware {
  return (req, _res, next) => {
    if (!isMultipart(req.headers['content-type'])) {
      next();
      return;
    }

    const { limits, preservePath, defParamCharset, fileFilter, storage } = setup;
    const appendContext = createAppendContext();

    let busboy: BusboyInstance | null = null;
    const pendingWrites = new Counter();
    const uploadedFiles: StoredFileDto[] = [];

    let isDone = false;
    let readFinished = false;
    let errorOccured = false;

    const done = (error?: Error): void => {
      if (isDone) {
        return;
      }
      isDone = true;

      if (busboy) {
        req.unpipe(busboy);
        setImmediate(() => {
          busboy?.removeAllListeners();
          busboy = null;
        });
      }

      drainStream(req);
      req.resume();
      next(error);
    };

    const indicateDone = (): void => {
      if (readFinished && pendingWrites.isZero() && !errorOccured) {
        done();
      }
    };

    const abortWithError = (uploadError: Error, skipPendingWait = false): void => {
      if (errorOccured) {
        return;
      }
      errorOccured = true;

      const finishAbort = (): void => {
        removeUploadedFiles(
          uploadedFiles,
          (file, cb) => {
            storage._removeFile(req, file, cb);
          },
          (error, storageErrors) => {
            if (error) {
              done(error);
              return;
            }

            const withStorageErrors = uploadError as MulterError;
            if (storageErrors.length > 0) {
              withStorageErrors.storageErrors = storageErrors;
            }
            done(uploadError);
          },
        );
      };

      if (skipPendingWait) {
        finishAbort();
      } else {
        pendingWrites.onceZero(finishAbort);
      }
    };

    const abortWithCode = (code: ConstructorParameters<typeof MulterError>[0], field?: string): void => {
      abortWithError(new MulterError(code, field));
    };

    const handleRequestFailure = (error: Error): void => {
      if (isDone) {
        return;
      }

      if (busboy) {
        req.unpipe(busboy);
        busboy.destroy(error);
      }
      abortWithError(error, true);
    };

    req.on('error', (error) => {
      handleRequestFailure(error ?? new Error('Request error'));
    });
    req.on('aborted', () => {
      handleRequestFailure(new Error('Request aborted'));
    });
    req.on('close', () => {
      if (req.readableEnded) {
        return;
      }
      handleRequestFailure(new Error('Request closed'));
    });

    try {
      const busboyConfig: Parameters<typeof createBusboy>[0] = {
        headers: req.headers,
      };
      if (limits) {
        busboyConfig.limits = limits;
      }
      if (typeof preservePath === 'boolean') {
        busboyConfig.preservePath = preservePath;
      }
      if (defParamCharset) {
        busboyConfig.defParamCharset = defParamCharset;
      }

      busboy = createBusboy(busboyConfig);
    } catch (error) {
      next(error as Error);
      return;
    }

    busboy.on('field', (fieldname: string, value: string, info: BusboyFieldInfo) => {
      if (fieldname == null) {
        abortWithCode('MISSING_FIELD_NAME');
        return;
      }
      if (info.nameTruncated) {
        abortWithCode('LIMIT_FIELD_KEY');
        return;
      }
      if (info.valueTruncated) {
        abortWithCode('LIMIT_FIELD_VALUE', fieldname);
        return;
      }

      if (limits && Object.hasOwn(limits, 'fieldNameSize')) {
        const fieldNameSize = limits['fieldNameSize'];
        if (typeof fieldNameSize === 'number' && fieldname.length > fieldNameSize) {
          abortWithCode('LIMIT_FIELD_KEY');
          return;
        }
      }

      const resolvedPath = resolveAppendPath(fieldname, appendContext);
      const body = ensureBodyContainer(req, pathStartsWithArray(resolvedPath));
      appendValueAtPath(body, resolvedPath, value);
    });

    busboy.on('file', (fieldname: string, fileStream: NodeJS.ReadableStream, info: BusboyFileInfo) => {
      if (fieldname == null) {
        abortWithCode('MISSING_FIELD_NAME');
        return;
      }

      if (!info.filename) {
        fileStream.resume();
        return;
      }

      if (limits && Object.hasOwn(limits, 'fieldNameSize')) {
        const fieldNameSize = limits['fieldNameSize'];
        if (typeof fieldNameSize === 'number' && fieldname.length > fieldNameSize) {
          abortWithCode('LIMIT_FIELD_KEY');
          return;
        }
      }

      const fileMetadata = {
        fieldname,
        originalname: info.filename,
        encoding: info.encoding,
        mimetype: info.mimeType,
      };
      const resolvedPath = resolveAppendPath(fieldname, appendContext);

      fileFilter(req, fileMetadata, (filterError, includeFile = true) => {
        if (errorOccured) {
          fileStream.resume();
          return;
        }
        if (filterError) {
          abortWithError(filterError);
          return;
        }
        if (!includeFile) {
          fileStream.resume();
          return;
        }

        let pendingWritesIncremented = false;
        let aborting = false;
        const file: IncomingFilePart = {
          ...fileMetadata,
          stream: fileStream as IncomingFilePart['stream'],
        };

        fileStream.on('error', (error: Error) => {
          if (pendingWritesIncremented) {
            pendingWrites.decrement();
          }
          abortWithError(error);
        });

        fileStream.on('limit', () => {
          aborting = true;
          abortWithCode('LIMIT_FILE_SIZE', fieldname);
        });

        pendingWritesIncremented = true;
        pendingWrites.increment();

        storage._handleFile(req, file, (storageError: Error | null, storageInfo) => {
          if (aborting) {
            const abortedFile = { ...fileMetadata, ...(storageInfo ?? {}), size: 0 } as StoredFileDto;
            uploadedFiles.push(abortedFile);
            pendingWrites.decrement();
            return;
          }

          if (storageError) {
            pendingWrites.decrement();
            abortWithError(storageError);
            return;
          }

          const fileDto = { ...fileMetadata, ...(storageInfo ?? {}) } as StoredFileDto;
          uploadedFiles.push(fileDto);
          const body = ensureBodyContainer(req, pathStartsWithArray(resolvedPath));
          appendValueAtPath(body, resolvedPath, fileDto);
          pendingWrites.decrement();
          indicateDone();
        });
      });
    });

    busboy.on('error', (error: Error) => {
      abortWithError(error);
    });
    busboy.on('partsLimit', () => abortWithCode('LIMIT_PART_COUNT'));
    busboy.on('filesLimit', () => abortWithCode('LIMIT_FILE_COUNT'));
    busboy.on('fieldsLimit', () => abortWithCode('LIMIT_FIELD_COUNT'));
    busboy.on('close', () => {
      readFinished = true;
      indicateDone();
    });

    req.pipe(busboy);
  };
}

export default makeMiddleware;
