# multiparser

Express-compatible multipart middleware that parses `multipart/form-data` and stores uploaded files directly in `req.body` using key paths.

## Why This Package

- Single middleware API (`multipartBody(options)`).
- Files and text fields end up in one merged object (`req.body`).
- Supports nested key paths such as `docs[0].file` and `user.avatar`.
- Multer-style error codes and pluggable storage engines.

## Install

```bash
npm install multiparser
```

Peer dependency:

- `express` (`^4.21.0 || ^5.2.1`)

## Usage

```ts
import express from 'express';
import multipartBody from 'multiparser';

const app = express();

app.post('/upload', multipartBody(), (req, res) => {
  // Example shape:
  // {
  //   id: "1",
  //   docs: [
  //     { name: "file11", file: { originalname, mimetype, size, buffer, ... } }
  //   ]
  // }
  res.json(req.body);
});
```

### Middleware With All Options

```ts
import express from 'express';
import multipartBody, { memoryStorage, type MultipartBodyOptions } from 'multiparser';

const app = express();

const uploadOptions: MultipartBodyOptions = {
  storage: memoryStorage(),
  preservePath: false,
  defParamCharset: 'latin1',
  limits: {
    fieldNameSize: 100,
    fieldSize: 1024 * 1024,
    fields: 100,
    fileSize: 10 * 1024 * 1024,
    files: 20,
    parts: 120,
    headerPairs: 2000,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
    cb(null, allowedMimeTypes.has(file.mimetype));
  },
};

app.post('/upload', multipartBody(uploadOptions), (req, res) => {
  res.json(req.body);
});
```

If your TypeScript setup auto-imports namespace style (`import * as x from 'multiparser'`), change it to one of these callable imports:

```ts
import multipartBody from 'multiparser';
// or
import { multipartBody } from 'multiparser';
```

## API

### `multipartBody(options?)`

Returns Express middleware.

Options:

- `storage?: StorageEngine` (default: `memoryStorage()`)
- `limits?: MultipartBodyLimits`
- `fileFilter?: (req, file, cb) => void`
- `preservePath?: boolean`
- `defParamCharset?: string` (default: `latin1`)

### `MultipartBodyLimits`

- `fieldNameSize?: number`
- `fieldSize?: number`
- `fields?: number`
- `fileSize?: number`
- `files?: number`
- `parts?: number`
- `headerPairs?: number`

### `memoryStorage()`

Built-in storage engine that buffers file content in memory.

### `MulterError`

Error class with Multer-style codes, including:

- `LIMIT_PART_COUNT`
- `LIMIT_FILE_SIZE`
- `LIMIT_FILE_COUNT`
- `LIMIT_FIELD_KEY`
- `LIMIT_FIELD_VALUE`
- `LIMIT_FIELD_COUNT`
- `LIMIT_UNEXPECTED_FILE`
- `MISSING_FIELD_NAME`

## Published Artifacts

The npm package includes:

- `dist/`
- `README.md`
- `LICENSE`

Use `npm run pack:check` to verify package contents before publish.

## Development

```bash
npm install
npm run check
```

Commands:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run pack:check`

## Git Hook Standards

This project uses Husky with fast local checks:

- `pre-commit`: runs `lint-staged` on staged files only.
- `commit-msg`: validates Conventional Commits via `commitlint`.
- `pre-push`: runs tests (`npm run test -- --bail`).

After cloning, run:

```bash
npm install
```

The `prepare` script installs hooks automatically.
