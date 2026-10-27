const WIDTH = 640;
const HEIGHT = 400;
const thumbnails = new WeakMap<Blob, Promise<string | undefined>>();

function render(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        // Crop to the card's aspect ratio, like `object-fit: cover`.
        const scale = Math.max(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight) || 1;
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const context = canvas.getContext("2d")!;
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(undefined);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
    image.src = url;
  });
}

/** A small JPEG data URL of a cover image, kept in the library index so cards don't open the lesson. */
export function coverThumbnail(blob: Blob): Promise<string | undefined> {
  let thumbnail = thumbnails.get(blob);
  if (!thumbnail) {
    thumbnail = render(blob);
    thumbnails.set(blob, thumbnail);
  }
  return thumbnail;
}
