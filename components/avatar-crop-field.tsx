"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AvatarImage } from "@/components/avatar-image";
import {
  AVATAR_CROP_SIZE,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  clampAvatarOffset,
  getAvatarCropMetrics,
  readFileAsDataUrl,
  readImageDimensions,
  renderCroppedAvatar,
  type AvatarDimensions,
  type AvatarOffset,
} from "@/lib/avatar-crop";

export type AvatarCropFieldHandle = {
  getCroppedImage: () => Promise<string | null>;
  hasSelectedImage: () => boolean;
};

type AvatarCropFieldProps = {
  cropButtonLabel?: string;
  fileButtonLabel?: string;
  helpText: string;
  initialPreviewSrc?: string | null;
  inputId: string;
  inputName?: string;
  label: string;
  onImageSelected?: () => void;
  pickerVariant?: "button" | "input";
  required?: boolean;
};

export const AvatarCropField = forwardRef<AvatarCropFieldHandle, AvatarCropFieldProps>(function AvatarCropField(
  {
    cropButtonLabel = "Edit / Crop Image",
    fileButtonLabel = "Choose Photo",
    helpText,
    initialPreviewSrc,
    inputId,
    inputName,
    label,
    onImageSelected,
    pickerVariant = "input",
    required = false,
  },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarDragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: AvatarOffset;
  } | null>(null);
  const [avatarSource, setAvatarSource] = useState("");
  const [avatarDimensions, setAvatarDimensions] = useState<AvatarDimensions | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(AVATAR_MIN_ZOOM);
  const [avatarOffset, setAvatarOffset] = useState<AvatarOffset>({ x: 0, y: 0 });
  const [avatarDragging, setAvatarDragging] = useState(false);
  const [cropEditorOpen, setCropEditorOpen] = useState(false);
  const [loadingExistingImage, setLoadingExistingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      getCroppedImage: async () => {
        if (!avatarSource || !avatarDimensions) return null;

        return renderCroppedAvatar(avatarSource, avatarDimensions, avatarZoom, avatarOffset).catch(() => null);
      },
      hasSelectedImage: () => Boolean(avatarSource && avatarDimensions),
    }),
    [avatarDimensions, avatarOffset, avatarSource, avatarZoom],
  );

  const avatarCropMetrics =
    avatarSource && avatarDimensions
      ? getAvatarCropMetrics(avatarDimensions, avatarZoom, avatarOffset)
      : null;

  const avatarPreviewStyle = avatarCropMetrics
    ? {
        width: `${(avatarCropMetrics.scaledWidth / AVATAR_CROP_SIZE) * 100}%`,
        height: `${(avatarCropMetrics.scaledHeight / AVATAR_CROP_SIZE) * 100}%`,
        left: `${(avatarCropMetrics.left / AVATAR_CROP_SIZE) * 100}%`,
        top: `${(avatarCropMetrics.top / AVATAR_CROP_SIZE) * 100}%`,
      }
    : null;

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      setErrorMessage("Please upload an image file for your profile picture.");
      return;
    }

    if (file.size > AVATAR_MAX_BYTES) {
      event.target.value = "";
      setErrorMessage("Please choose a profile picture under 5MB.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file).catch(() => "");
    if (!dataUrl) {
      event.target.value = "";
      setErrorMessage("Unable to read your profile picture. Try another image.");
      return;
    }

    const dimensions = await readImageDimensions(dataUrl).catch(() => null);
    if (!dimensions) {
      event.target.value = "";
      setErrorMessage("Unable to read your profile picture. Try another image.");
      return;
    }

    setAvatarSource(dataUrl);
    setAvatarDimensions(dimensions);
    setAvatarZoom(AVATAR_MIN_ZOOM);
    setAvatarOffset({ x: 0, y: 0 });
    setCropEditorOpen(false);
    setErrorMessage(null);
    onImageSelected?.();
  };

  const handleAvatarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avatarSource || !avatarDimensions) return;

    event.preventDefault();
    avatarDragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: avatarOffset,
    };
    setAvatarDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAvatarPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avatarDimensions || !avatarDragState.current || avatarDragState.current.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - avatarDragState.current.startX;
    const deltaY = event.clientY - avatarDragState.current.startY;

    setAvatarOffset(
      clampAvatarOffset(
        {
          x: avatarDragState.current.startOffset.x + deltaX,
          y: avatarDragState.current.startOffset.y + deltaY,
        },
        avatarDimensions,
        avatarZoom,
      ),
    );
  };

  const handleAvatarPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (avatarDragState.current?.pointerId !== event.pointerId) return;

    avatarDragState.current = null;
    setAvatarDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const openCropEditor = async () => {
    if (avatarSource && avatarDimensions) {
      setCropEditorOpen((previous) => !previous);
      return;
    }

    if (!initialPreviewSrc) return;

    setLoadingExistingImage(true);
    const dimensions = await readImageDimensions(initialPreviewSrc).catch(() => null);
    setLoadingExistingImage(false);

    if (!dimensions) {
      setErrorMessage("Unable to open your current profile picture for cropping. Upload another image instead.");
      return;
    }

    setAvatarSource(initialPreviewSrc);
    setAvatarDimensions(dimensions);
    setAvatarZoom(AVATAR_MIN_ZOOM);
    setAvatarOffset({ x: 0, y: 0 });
    setCropEditorOpen(true);
    setErrorMessage(null);
    onImageSelected?.();
  };

  const hasEditableImage = Boolean((avatarSource && avatarDimensions) || initialPreviewSrc);

  return (
    <>
      <div className="account-signup-avatar">
        <div className="account-avatar account-signup-avatar__preview" aria-hidden>
          {avatarPreviewStyle ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="account-signup-cropper__image"
              src={avatarSource}
              alt=""
              draggable={false}
              style={avatarPreviewStyle}
            />
          ) : (
            <AvatarImage src={initialPreviewSrc} alt="" loading="eager" />
          )}
        </div>
        <div className="form-control avatar-upload">
          <label htmlFor={inputId}>{label}</label>
          {pickerVariant === "input" ? (
            <input
              id={inputId}
              name={inputName ?? inputId}
              type="file"
              accept="image/*"
              onChange={(event) => void handleAvatarChange(event)}
              required={required}
            />
          ) : (
            <div className="account-signup-avatar__actions">
              <input
                ref={fileInputRef}
                id={inputId}
                name={inputName ?? inputId}
                type="file"
                accept="image/*"
                onChange={(event) => void handleAvatarChange(event)}
                className="sr-only"
              />
              <button className="button ghost" type="button" onClick={() => fileInputRef.current?.click()}>
                {fileButtonLabel}
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => void openCropEditor()}
                disabled={!hasEditableImage || loadingExistingImage}
              >
                {loadingExistingImage ? "Loading..." : cropEditorOpen ? "Done Cropping" : cropButtonLabel}
              </button>
            </div>
          )}
          <p className="form-help">{helpText}</p>
          {pickerVariant === "input" && avatarSource ? (
            <div className="account-signup-avatar__actions">
              <button
                className="button ghost"
                type="button"
                onClick={() => setCropEditorOpen((previous) => !previous)}
              >
                {cropEditorOpen ? "Done Cropping" : "Edit / Crop Picture"}
              </button>
            </div>
          ) : null}
          {errorMessage ? <p className="form-help error">{errorMessage}</p> : null}
        </div>
      </div>
      {cropEditorOpen && avatarSource ? (
        <div className="account-signup-cropper">
          <div
            className={`account-signup-cropper__viewport${avatarDragging ? " is-dragging" : ""}`}
            onPointerDown={handleAvatarPointerDown}
            onPointerMove={handleAvatarPointerMove}
            onPointerUp={handleAvatarPointerEnd}
            onPointerCancel={handleAvatarPointerEnd}
          >
            {avatarCropMetrics ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="account-signup-cropper__image"
                src={avatarSource}
                alt=""
                draggable={false}
                style={{
                  width: `${avatarCropMetrics.scaledWidth}px`,
                  height: `${avatarCropMetrics.scaledHeight}px`,
                  left: `${avatarCropMetrics.left}px`,
                  top: `${avatarCropMetrics.top}px`,
                }}
              />
            ) : (
              <div className="account-signup-cropper__empty">
                <p>Upload your photo</p>
              </div>
            )}
          </div>
          <div className="account-signup-cropper__controls">
            <label htmlFor={`${inputId}-zoom`}>Zoom</label>
            <input
              id={`${inputId}-zoom`}
              name={`${inputName ?? inputId}-zoom`}
              type="range"
              min={AVATAR_MIN_ZOOM}
              max={AVATAR_MAX_ZOOM}
              step="0.01"
              value={avatarZoom}
              onChange={(event) => {
                if (!avatarDimensions) return;
                const nextZoom = Number(event.target.value);
                setAvatarZoom(nextZoom);
                setAvatarOffset((previous) => clampAvatarOffset(previous, avatarDimensions, nextZoom));
              }}
            />
            <div className="account-signup-cropper__meta">
              <p className="form-help">Drag your photo to center yourself in the circle.</p>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  setAvatarZoom(AVATAR_MIN_ZOOM);
                  setAvatarOffset({ x: 0, y: 0 });
                }}
              >
                Reset Crop
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});

AvatarCropField.displayName = "AvatarCropField";
