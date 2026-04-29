import makeMiddleware from './lib/make-middleware';
import MulterError from './lib/multer-error';
import memoryStorage from './storage/memory';
import type { FileFilter, MultipartBodyMiddleware, MultipartBodyOptions } from './types';

const allowAll: FileFilter = (_req, _file, cb) => {
  cb(null, true);
};

function multipartBody(options: MultipartBodyOptions = {}): MultipartBodyMiddleware {
  const fileFilter = options.fileFilter ?? allowAll;
  const storage = options.storage ?? memoryStorage();
  const middlewareOptions: Parameters<typeof makeMiddleware>[0] = {
    fileFilter,
    storage,
    defParamCharset: options.defParamCharset ?? 'latin1',
  };

  if (options.limits) {
    middlewareOptions.limits = options.limits;
  }
  if (typeof options.preservePath === 'boolean') {
    middlewareOptions.preservePath = options.preservePath;
  }

  return makeMiddleware(middlewareOptions);
}

export default multipartBody;
export { multipartBody, memoryStorage, MulterError };
export type {
  FileFilter,
  FileFilterCallback,
  IncomingFilePart,
  MultipartBodyMiddleware,
  MultipartBodyLimits,
  MultipartBodyOptions,
  MulterErrorCode,
  StoredFileDto,
  StorageEngine,
  StorageError,
  StorageHandleFileCallback,
  StorageRemoveFileCallback,
} from './types';
