import type { StorageError, StoredFileDto } from '../types';

type RemoveFn = (file: StoredFileDto, cb: (error: Error | null) => void) => void;

function removeUploadedFiles(
  uploadedFiles: StoredFileDto[],
  remove: RemoveFn,
  cb: (error: Error | null, storageErrors: StorageError[]) => void,
): void {
  if (uploadedFiles.length === 0) {
    cb(null, []);
    return;
  }

  const errors: StorageError[] = [];
  let index = 0;

  const handleNext = (): void => {
    const file = uploadedFiles[index];
    if (!file) {
      cb(null, errors);
      return;
    }
    remove(file, (error) => {
      if (error) {
        const storageError = error as StorageError;
        storageError.file = file;
        storageError.field = file.fieldname;
        errors.push(storageError);
      }

      index += 1;
      if (index >= uploadedFiles.length) {
        cb(null, errors);
        return;
      }

      setImmediate(handleNext);
    });
  };

  handleNext();
}

export default removeUploadedFiles;
