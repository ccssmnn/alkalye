# Video Asset Support

Add video assets to Alkalye using Mediabunny for client-side compression and Jazz FileStreams for storage.

## Context

- Screen recordings (phone/desktop) shared via slideshow
- Same `![Alt](asset:coXXX)` syntax as images
- Compress client-side before sync

## Defaults

- **Max input**: 500MB
- **Output**: 720p max, 30fps, 2Mbps video, 128kbps AAC audio
- **Format**: MP4 (H.264 + AAC)

## Schema Changes

```ts
// src/schema/index.ts
let ImageAsset = co.map({
	type: z.literal("image"),
	name: z.string(),
	image: co.image(),
	createdAt: z.date(),
})

let VideoAsset = co.map({
	type: z.literal("video"),
	name: z.string(),
	video: co.fileStream(),
	mimeType: z.string(),
	muteAudio: z.boolean().optional(),
	createdAt: z.date(),
})

let Asset = co.discriminatedUnion("type", [ImageAsset, VideoAsset])
```

## New Files

### `src/lib/video-conversion.ts`

- `compressVideo(file, { onProgress })` → Blob
- Check `canEncode('avc')`, throw if unavailable
- Mediabunny Conversion API: MP4, H.264, AAC
- Docs: https://mediabunny.dev/llms.txt

### `src/components/upload-progress-dialog.tsx`

- File name, progress bar, cancel button
- States: compressing → uploading → done

## File Modifications

### `src/lib/editor-utils.ts`

- `makeUploadVideo(doc)` with progress callbacks
- `makeUploadAssets`: handle video MIME types
- `makeDownloadAsset`: handle video (fileStream → blob)

### `src/components/sidebar-assets.tsx`

- `accept="image/*,video/*"`
- Drag-drop: accept video
- Video thumbnail: video icon
- Context menu: "Mute audio" toggle for videos

### `src/components/floating-actions.tsx`

- "Image" → "Media" in UI
- Show videos alongside images
- Video icon indicator

### `src/editor/image-decorations.ts`

- Video assets: film/video icon

### `src/components/preview.tsx`

- `Segment` type: add `video` variant
- `VideoPlayer`: `<video controls muted={asset.muteAudio}>`
- Load via `co.fileStream().loadAsBlob()`

### `src/components/slideshow.tsx`

- `SlideMedia` component
- `<video controls muted={asset.muteAudio}>`

### `src/editor/editor.tsx`

- Video preview dialog (detect video vs image)

## Implementation Order

1. ~~Schema + `bun add mediabunny`~~ ✓
2. ~~`video-conversion.ts`~~ ✓
3. ~~`upload-progress-dialog.tsx`~~ ✓
4. ~~`editor-utils.ts` upload handlers~~ ✓
5. ~~`sidebar-assets.tsx` (upload flow e2e)~~ ✓
6. `preview.tsx` + `slideshow.tsx` (playback)
7. `floating-actions.tsx` + `editor.tsx` (polish)
8. `image-decorations.ts`

## Error Handling

- WebCodecs unavailable: block upload with error message
- Conversion failure: show error, don't create asset
