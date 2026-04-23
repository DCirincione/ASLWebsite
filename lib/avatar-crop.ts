export type AvatarDimensions = {
  width: number;
  height: number;
};

export type AvatarOffset = {
  x: number;
  y: number;
};

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_CROP_SIZE = 220;
export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 3;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

export const readImageDimensions = (src: string) =>
  new Promise<AvatarDimensions>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = src;
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = src;
  });

export const getAvatarMetrics = (dimensions: AvatarDimensions, zoom: number) => {
  const baseScale = Math.max(AVATAR_CROP_SIZE / dimensions.width, AVATAR_CROP_SIZE / dimensions.height);
  const scale = baseScale * zoom;
  const scaledWidth = dimensions.width * scale;
  const scaledHeight = dimensions.height * scale;
  const maxOffsetX = Math.max(0, (scaledWidth - AVATAR_CROP_SIZE) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - AVATAR_CROP_SIZE) / 2);

  return {
    scale,
    scaledWidth,
    scaledHeight,
    maxOffsetX,
    maxOffsetY,
  };
};

export const clampAvatarOffset = (offset: AvatarOffset, dimensions: AvatarDimensions, zoom: number) => {
  const { maxOffsetX, maxOffsetY } = getAvatarMetrics(dimensions, zoom);

  return {
    x: clamp(offset.x, -maxOffsetX, maxOffsetX),
    y: clamp(offset.y, -maxOffsetY, maxOffsetY),
  };
};

export const getAvatarCropMetrics = (dimensions: AvatarDimensions, zoom: number, offset: AvatarOffset) => {
  const clampedOffset = clampAvatarOffset(offset, dimensions, zoom);
  const { scaledWidth, scaledHeight } = getAvatarMetrics(dimensions, zoom);

  return {
    offset: clampedOffset,
    scaledWidth,
    scaledHeight,
    left: (AVATAR_CROP_SIZE - scaledWidth) / 2 + clampedOffset.x,
    top: (AVATAR_CROP_SIZE - scaledHeight) / 2 + clampedOffset.y,
  };
};

export const renderCroppedAvatar = async (
  src: string,
  dimensions: AvatarDimensions,
  zoom: number,
  offset: AvatarOffset,
) => {
  const image = await loadImage(src);
  const { scaledWidth, scaledHeight, left, top } = getAvatarCropMetrics(dimensions, zoom, offset);
  const outputScale = AVATAR_OUTPUT_SIZE / AVATAR_CROP_SIZE;
  const canvas = document.createElement("canvas");

  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create image canvas");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    left * outputScale,
    top * outputScale,
    scaledWidth * outputScale,
    scaledHeight * outputScale,
  );

  return canvas.toDataURL("image/jpeg", 0.92);
};
