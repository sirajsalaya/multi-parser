import type { NextFunction, Request, Response } from 'express';
import type { Readable } from 'node:stream';

export type MulterErrorCode =
  | 'LIMIT_PART_COUNT'
  | 'LIMIT_FILE_SIZE'
  | 'LIMIT_FILE_COUNT'
  | 'LIMIT_FIELD_KEY'
  | 'LIMIT_FIELD_VALUE'
  | 'LIMIT_FIELD_COUNT'
  | 'LIMIT_UNEXPECTED_FILE'
  | 'MISSING_FIELD_NAME';

export interface IncomingFilePart {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  stream: Readable;
}

export type StoredFileDto = Omit<IncomingFilePart, 'stream'> & {
  size: number;
  buffer?: Buffer;
  [key: string]: unknown;
};

export type StorageHandleFileCallback = (
  error: Error | null,
  info?: Omit<StoredFileDto, keyof IncomingFilePart>,
) => void;

export type StorageRemoveFileCallback = (error: Error | null) => void;

export interface StorageEngine {
  _handleFile(req: Request, file: IncomingFilePart, cb: StorageHandleFileCallback): void;
  _removeFile(req: Request, file: StoredFileDto, cb: StorageRemoveFileCallback): void;
}

export type FileFilterCallback = (error: Error | null, includeFile?: boolean) => void;

export type FileFilter = (req: Request, file: Omit<IncomingFilePart, 'stream'>, cb: FileFilterCallback) => void;

export interface MultipartBodyLimits {
  fieldNameSize?: number;
  fieldSize?: number;
  fields?: number;
  fileSize?: number;
  files?: number;
  parts?: number;
  headerPairs?: number;
}

export interface MultipartBodyOptions {
  storage?: StorageEngine;
  limits?: MultipartBodyLimits;
  fileFilter?: FileFilter;
  preservePath?: boolean;
  defParamCharset?: string;
}

export type MultipartBodyMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export type StorageError = Error & {
  file?: StoredFileDto;
  field?: string;
};
