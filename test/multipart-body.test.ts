import express from 'express';
import request from 'supertest';
import multipartBody from '../src/index';

describe('multipartBody middleware', () => {
  it('passes through non-multipart requests', async () => {
    const app = express();
    app.post('/upload', multipartBody(), (_req, res) => {
      res.status(204).end();
    });

    await request(app).post('/upload').send({ hello: 'world' }).expect(204);
  });

  it('parses nested text fields and files into req.body', async () => {
    const app = express();
    let capturedBody: Record<string, unknown> | undefined;

    app.post('/upload', multipartBody(), (req, res) => {
      capturedBody = req.body;
      res.status(200).json({ ok: true });
    });

    await request(app)
      .post('/upload')
      .field('id', '1')
      .field('docs[0].name', 'file11')
      .attach('docs[0].file', Buffer.from('hello world'), 'a.txt')
      .expect(200);

    expect(capturedBody).toBeDefined();
    expect(capturedBody?.id).toBe('1');
    const docs = capturedBody?.docs as Array<Record<string, unknown>>;
    expect(Array.isArray(docs)).toBe(true);
    expect(docs[0].name).toBe('file11');
    const file = docs[0].file as { buffer: Buffer; size: number; originalname: string };
    expect(Buffer.isBuffer(file.buffer)).toBe(true);
    expect(file.size).toBe(11);
    expect(file.originalname).toBe('a.txt');
  });

  it('auto-promotes duplicate file paths to arrays', async () => {
    const app = express();
    let capturedBody: Record<string, unknown> | undefined;

    app.post('/upload', multipartBody(), (req, res) => {
      capturedBody = req.body;
      res.status(200).json({ ok: true });
    });

    await request(app)
      .post('/upload')
      .attach('docs[0].file', Buffer.from('one'), 'one.txt')
      .attach('docs[0].file', Buffer.from('two'), 'two.txt')
      .expect(200);

    const docs = capturedBody?.docs as Array<Record<string, unknown>>;
    const files = docs[0].file as Array<{ originalname: string }>;
    expect(Array.isArray(files)).toBe(true);
    expect(files).toHaveLength(2);
    expect(files[0].originalname).toBe('one.txt');
    expect(files[1].originalname).toBe('two.txt');
  });

  it('splits repeated indexed record blocks into sibling objects', async () => {
    const app = express();
    let capturedBody: Record<string, unknown> | undefined;

    app.post('/upload', multipartBody(), (req, res) => {
      capturedBody = req.body;
      res.status(200).json({ ok: true });
    });

    await request(app)
      .post('/upload')
      .field('person[0][id]', '1')
      .field('person[0][name]', 'john')
      .field('person[0][docs][0][id]', '1')
      .attach('person[0][docs][0][file]', Buffer.from('photo-one'), 'one.jpg')
      .field('person[0][id]', '2')
      .field('person[0][name]', 'doe')
      .field('person[0][docs][0][id]', '2')
      .attach('person[0][docs][0][file]', Buffer.from('photo-two'), 'two.jpg')
      .expect(200);

    const people = capturedBody?.person as Array<Record<string, unknown>>;
    expect(Array.isArray(people)).toBe(true);
    expect(people).toHaveLength(2);
    expect(people[0].id).toBe('1');
    expect(people[0].name).toBe('john');
    expect(people[1].id).toBe('2');
    expect(people[1].name).toBe('doe');

    const firstDocs = people[0].docs as Array<Record<string, unknown>>;
    const secondDocs = people[1].docs as Array<Record<string, unknown>>;
    expect(firstDocs[0].id).toBe('1');
    expect(secondDocs[0].id).toBe('2');
    expect((firstDocs[0].file as { originalname: string }).originalname).toBe('one.jpg');
    expect((secondDocs[0].file as { originalname: string }).originalname).toBe('two.jpg');
  });

  it('splits repeated indexed text-only blocks into sibling objects', async () => {
    const app = express();
    let capturedBody: Record<string, unknown> | undefined;

    app.post('/upload', multipartBody(), (req, res) => {
      capturedBody = req.body;
      res.status(200).json({ ok: true });
    });

    await request(app)
      .post('/upload')
      .field('person[0][id]', '1')
      .field('person[0][name]', 'john')
      .field('person[0][id]', '2')
      .field('person[0][name]', 'doe')
      .expect(200);

    const people = capturedBody?.person as Array<Record<string, unknown>>;
    expect(Array.isArray(people)).toBe(true);
    expect(people).toHaveLength(2);
    expect(people[0]).toEqual({ id: '1', name: 'john' });
    expect(people[1]).toEqual({ id: '2', name: 'doe' });
  });

  it('supports a top-level array body for root indexed paths', async () => {
    const app = express();
    let capturedBody: unknown;

    app.post('/upload', multipartBody(), (req, res) => {
      capturedBody = req.body;
      res.status(200).json(req.body);
    });

    const response = await request(app)
      .post('/upload')
      .field('[0].id', '1')
      .field('[0].name', 'john')
      .field('[0].docs[0].id', '1')
      .attach('[0].docs[0].file', Buffer.from('photo-one'), 'one.jpg')
      .field('[1].id', '2')
      .field('[1].name', 'doe')
      .field('[1].docs[0].id', '2')
      .attach('[1].docs[0].file', Buffer.from('photo-two'), 'two.jpg')
      .expect(200);

    expect(Array.isArray(capturedBody)).toBe(true);
    const people = capturedBody as Array<Record<string, unknown>>;
    expect(people).toHaveLength(2);
    expect(people[0].id).toBe('1');
    expect(people[0].name).toBe('john');
    expect(people[1].id).toBe('2');
    expect(people[1].name).toBe('doe');
    expect(((people[0].docs as Array<Record<string, unknown>>)[0].file as { originalname: string }).originalname).toBe(
      'one.jpg',
    );
    expect(((people[1].docs as Array<Record<string, unknown>>)[0].file as { originalname: string }).originalname).toBe(
      'two.jpg',
    );
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('keeps duplicate file arrays for non-record paths while splitting indexed records', async () => {
    const app = express();
    let capturedBody: Record<string, unknown> | undefined;

    app.post('/upload', multipartBody(), (req, res) => {
      capturedBody = req.body;
      res.status(200).json({ ok: true });
    });

    await request(app)
      .post('/upload')
      .field('person[0][id]', '1')
      .field('person[0][name]', 'john')
      .field('person[0][id]', '2')
      .field('person[0][name]', 'doe')
      .attach('docs[0].file', Buffer.from('one'), 'one.txt')
      .attach('docs[0].file', Buffer.from('two'), 'two.txt')
      .expect(200);

    const people = capturedBody?.person as Array<Record<string, unknown>>;
    expect(people).toHaveLength(2);

    const docs = capturedBody?.docs as Array<Record<string, unknown>>;
    const files = docs[0].file as Array<{ originalname: string }>;
    expect(Array.isArray(files)).toBe(true);
    expect(files).toHaveLength(2);
    expect(files[0].originalname).toBe('one.txt');
    expect(files[1].originalname).toBe('two.txt');
  });

  it('preserves existing req.body and merges multipart values', async () => {
    const app = express();
    let capturedBody: Record<string, unknown> | undefined;

    app.post(
      '/upload',
      (req, _res, next) => {
        req.body = { id: '123' };
        next();
      },
      multipartBody(),
      (req, res) => {
        capturedBody = req.body;
        res.status(200).json({ ok: true });
      },
    );

    await request(app)
      .post('/upload')
      .field('profile.name', 'alice')
      .attach('profile.avatar', Buffer.from('avatar'), 'avatar.png')
      .expect(200);

    expect(capturedBody?.id).toBe('123');
    const profile = capturedBody?.profile as Record<string, unknown>;
    expect(profile.name).toBe('alice');
    expect((profile.avatar as { originalname: string }).originalname).toBe('avatar.png');
  });

  it('supports fileFilter include/exclude behavior', async () => {
    const app = express();
    let capturedBody: Record<string, unknown> | undefined;

    app.post(
      '/upload',
      multipartBody({
        fileFilter: (_req, file, cb) => {
          cb(null, file.fieldname !== 'ignored.file');
        },
      }),
      (req, res) => {
        capturedBody = req.body;
        res.status(200).json({ ok: true });
      },
    );

    await request(app)
      .post('/upload')
      .attach('ignored.file', Buffer.from('a'), 'ignored.txt')
      .attach('kept.file', Buffer.from('b'), 'kept.txt')
      .expect(200);

    const ignored = (capturedBody?.ignored as Record<string, unknown> | undefined)?.file;
    const kept = (capturedBody?.kept as Record<string, unknown> | undefined)?.file as {
      originalname: string;
    };
    expect(ignored).toBeUndefined();
    expect(kept.originalname).toBe('kept.txt');
  });

  it('returns Multer-style error code when file size limit is exceeded', async () => {
    const app = express();

    app.post('/upload', multipartBody({ limits: { fileSize: 2 } }), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    app.use(
      (
        err: Error & { code?: string; field?: string },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        void _next;
        res.status(400).json({ code: err.code, field: err.field });
      },
    );

    const response = await request(app)
      .post('/upload')
      .attach('docs[0].file', Buffer.from('toolarge'), 'big.txt')
      .expect(400);

    expect(response.body.code).toBe('LIMIT_FILE_SIZE');
    expect(response.body.field).toBe('docs[0].file');
  });
});
