# Backend prompt — accept every image file for avatars

Copy this prompt into the backend agent working on `77elijah78/nodejs-socialapp`.

---

## Task

Make `POST /api/v1/media/upload/avatar` accept **any image file a phone can
produce**, not only JPEG/PNG/GIF/WebP. Keep the same auth, multipart field
(`avatar`), 5 MB limit, response envelope, and static-upload serving contract.

The Expo client now passes through any `image/*` MIME (HEIC/HEIF, AVIF, BMP,
TIFF, SVG, JPEG XL, DNG/CR2/NEF/ARW, and provider-specific values) with the
picked filename and true MIME type. It no longer downgrades unknown formats to
`image/jpeg` or blocks them client-side. The remaining restriction is entirely
server-side.

## Verified current behaviour (ref `eb79c440ae38f0f120b8301c59ff64904b67c7bc`)

- `src/middlewares/upload.ts`
  - `MEDIA_TYPES.image.mimes` is only `image/jpeg`, `image/png`, `image/gif`,
    `image/webp`.
  - Multer's `diskStorage.destination` calls `getCategoryFromMime(file.mimetype)`
    **before** the avatar `fileFilter` runs, and returns
    `AppError('Unsupported file type', 400)` for anything else.
  - `uploadAvatar` repeats the same four-MIME check and throws
    `Only images are allowed for avatars` (400).
  - Avatar limit is already `5 * 1024 * 1024` bytes and field `avatar`.
- `src/services/media.service.ts`
  - `processUploadedFile` also calls `getCategoryFromMime`; unknown MIME therefore
    cannot produce a URL even if Multer were bypassed.
  - Sharp is an **optional** import. Image thumbnails/dimensions and WebP
    conversion are best-effort; failures are swallowed and the original file is
    returned.
- `src/controllers/media.controller.ts` returns
  `201 {success:true,data:{url,thumbnailUrl?,width?,height?},message}`.
- The single-file `/media/upload` and `/media/upload/images` endpoints are used
  by chat and post creation. Do not broaden those in this change.

## Required behaviour

1. Only the **avatar** route accepts arbitrary `image/*`. Chat/post media keeps
   its existing JPEG/PNG/GIF/WebP policy.
2. Accept the upload only when the declared part is `image/*`, then verify the
   **actual bytes** with Sharp. A text file sent as `image/jpeg` must be rejected
   with 415, not stored or served.
3. Decode, orient, strip metadata, bound dimensions, and re-encode every avatar
   to a web-safe format (WebP recommended; JPEG is acceptable). Store/serve the
   normalized output, never an unvalidated HEIC/RAW/SVG original. This is what
   makes the image displayable on both iOS and Android.
4. Keep the 5 MB *upload* cap. Return 413 for size, 415 for an unreadable image,
   and 400 for a missing part. Do not silently fall back to serving the original
   when Sharp cannot decode it.
5. Keep the existing response shape and field names. The returned `url` must
   point at the normalized file (`.webp`/`.jpg`) and `width`/`height` must be the
   normalized dimensions. `thumbnailUrl` remains optional.
6. Keep JWT authentication and the existing rate limit on `/media`.

## Suggested implementation

### 1. Avatar-specific MIME/category handling

Do not add `image/*` to the shared `MEDIA_TYPES.image.mimes` array, because
`getCategoryFromMime` is also used by chat/post uploads. Add an avatar-only rule:

```ts
const isAvatarImageMime = (mime: string): boolean =>
  /^image\/[a-z0-9][a-z0-9.+-]*$/i.test(mime);

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // All avatars land in the existing images folder; normalized output also
    // uses that folder so static serving needs no change.
    cb(null, path.join(UPLOADS_ROOT, MEDIA_TYPES.image.folder));
  },
  filename: (_req, _file, cb) => cb(null, `${uuidv4()}.upload`),
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (_req, file, cb) => {
    if (isAvatarImageMime(file.mimetype)) return cb(null, true);
    cb(new AppError('Only image files are allowed for avatars', 415));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('avatar');
```

Notes:

- The temporary `.upload` extension is intentional: the client MIME/extension is
  not trusted. Sharp, not the filename, decides the final format.
- Alternatively use `multer.memoryStorage()`; 5 MB is small enough. If you do,
  write the normalized buffer to `uploads/images` yourself and ensure all error
  paths delete/never persist the buffer.
- `handleMulterError` should keep mapping `LIMIT_FILE_SIZE` to 413.

### 2. Dedicated avatar processor

Add `processAvatarFile` in `media.service.ts` (do not weaken the generic
`processUploadedFile` path used by messages):

```ts
const AVATAR_OUTPUT_SIZE = 1024;
const AVATAR_MAX_INPUT_PIXELS = 40_000_000;
const AVATAR_THUMB_SIZE = 400;

export const processAvatarFile = async (
  file: Express.Multer.File,
): Promise<{ url: string; thumbnailUrl?: string; width: number; height: number }> => {
  if (!sharp) {
    await fs.unlink(file.path).catch(() => {});
    throw new AppError('Image processing is not available on this server', 503);
  }

  const filename = `${uuidv4()}.webp`;
  const outputPath = path.join(UPLOADS_ROOT, MEDIA_TYPES.image.folder, filename);

  try {
    const pipeline = sharp(file.path, {
      failOn: 'error',
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
      animated: false,
    }).rotate();

    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new Error('Image has no dimensions');

    const output = await pipeline
      .resize({
        width: AVATAR_OUTPUT_SIZE,
        height: AVATAR_OUTPUT_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toFile(outputPath);

    const thumbFilename = `thumb_${filename}`;
    await sharp(outputPath)
      .resize({ width: AVATAR_THUMB_SIZE, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(UPLOADS_ROOT, MEDIA_TYPES.image.folder, thumbFilename));

    return {
      url: buildUrl(MEDIA_TYPES.image.folder, filename),
      thumbnailUrl: buildUrl(MEDIA_TYPES.image.folder, thumbFilename),
      width: output.width,
      height: output.height,
    };
  } catch (err) {
    logger.warn('Avatar decoding failed', err);
    throw new AppError('That image format could not be read', 415);
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
};
```

Call it from `mediaController.uploadAvatar` instead of `processUploadedFile`.
Store only the normalized WebP file; remove the temporary upload in `finally`.
If an error is thrown after `sharp.toFile()` partially wrote output, clean up
the output/thumbnail too.

### 3. Format coverage

- Install `sharp` as a required dependency (it is currently optional). Verify the
  deployment's libvips build decodes HEIC/HEIF and AVIF. If the prebuilt binary
  does not, add a documented fallback (for example `heic-convert`) **before**
  enabling those formats, or return a truthful 415 with a clear message.
- BMP, TIFF, GIF, PNG, JPEG, WebP, AVIF, HEIC/HEIF, JPEG XL, and camera RAW are
  all expected to work when the local libvips can decode them.
- SVG can be rasterized by Sharp/librsvg, but treat it as untrusted: bound input
  pixels, disable external resource loading where supported, and never return
  the SVG itself. If you consider SVG too risky, reject only SVG with 415 and
  document the exception; do not silently accept and store it.
- Animated GIF/WebP/HEIC: use the first frame (`animated: false`) for avatars.
- Output WebP ensures RN can display the result on Android and iOS without
  needing a HEIC/RAW decoder.

### 4. Defence in depth

- MIME is client-controlled: rely on Sharp decoding, not `file.mimetype` or
  `originalname`.
- Cap `limitInputPixels` and output dimensions to prevent decompression bombs.
- Strip EXIF/metadata by re-encoding. Apply EXIF orientation with `.rotate()`
  before resizing.
- Do not serve the intermediate `.upload` file. It must never remain after
  success or failure.
- Keep the existing 5 MB Multer cap and the existing global `/media` rate limit.

## Acceptance tests

Run against a deployed/local server with a real JWT:

```bash
# Every case must return 201 and a displayable URL:
curl -sS -X POST "$BASE/api/v1/media/upload/avatar" \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@fixtures/photo.heic" | jq
# Repeat with .heif, .avif, .bmp, .tif, .svg, .jpg, .png, .webp
```

Assertions:

- 201 response has `data.url` ending in `.webp` (or `.jpg`), plus numeric
  `width`/`height`; `thumbnailUrl` is optional but if present must load.
- `GET` the returned URL without auth (existing static contract) and confirm the
  `Content-Type` matches the normalized format.
- A renamed text file (`mv note.txt fake.jpg; curl -F avatar=@fake.jpg`) returns
  415 and leaves no file behind.
- A file over 5 MB returns 413.
- A missing `avatar` part returns 400.
- JPEG/PNG/GIF/WebP avatar uploads continue to work.
- Chat `POST /media/upload` still rejects HEIC/AVIF/SVG with its existing 400/415
  and keeps JPEG/PNG/GIF/WebP/MP4/MOV/WebM/AVI/audio unchanged.
- No `.upload` files remain in `uploads/images` after the suite.
- `uploads/images` contains only normalized `.webp`/`.jpg` avatars and their
  thumbnails.

## Documentation to update

- `docs`/API reference: avatar accepts any image the server can decode, is
  normalized to WebP, and still has a 5 MB input limit.
- Error table: 413 oversized, 415 unreadable/unsupported image, 400 missing part.
- Deployment notes: Sharp is required for avatars; list any codec/build exception
  (for example HEIC support in the deployed libvips).

## Do not

- Do not broaden `/media/upload` (messages) or `/media/upload/images` (posts) to
  `image/*` as part of this task.
- Do not trust the client MIME or filename.
- Do not store or return an unvalidated original image.
- Do not change the multipart field name, route, auth, or response keys.
