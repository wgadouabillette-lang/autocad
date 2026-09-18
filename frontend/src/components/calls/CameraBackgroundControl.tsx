import clsx from "clsx";
import { Ban, Plus, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { CAMERA_BG_IMAGE_MAX } from "../../lib/cameraBackgroundStorage";
import { hasCameraBackgroundAccess } from "../../lib/subscriptionPlans";
import { useCameraBackgroundStore } from "../../store/useCameraBackgroundStore";
import { useStore } from "../../store/useStore";

export default function CameraBackgroundControl() {
  const mode = useCameraBackgroundStore((s) => s.mode);
  const images = useCameraBackgroundStore((s) => s.images);
  const selectedImageId = useCameraBackgroundStore((s) => s.selectedImageId);
  const busy = useCameraBackgroundStore((s) => s.busy);
  const error = useCameraBackgroundStore((s) => s.error);
  const hydrate = useCameraBackgroundStore((s) => s.hydrate);
  const setMode = useCameraBackgroundStore((s) => s.setMode);
  const selectImage = useCameraBackgroundStore((s) => s.selectImage);
  const addImageFromFile = useCameraBackgroundStore((s) => s.addImageFromFile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const canUseCustomBackgrounds = hasCameraBackgroundAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const requireProOrSettings = () => {
    if (canUseCustomBackgrounds) return false;
    openSettingsTab("usage");
    return true;
  };

  return (
    <div className="camera-bg-control" role="group" aria-label="Fond caméra">
      <div className="camera-bg-control__tray">
        <button
          type="button"
          className={clsx("camera-bg-control__swatch", mode === "none" && "is-selected")}
          disabled={busy}
          aria-pressed={mode === "none"}
          aria-label="Aucun fond"
          title="Aucun"
          onClick={() => void setMode("none")}
        >
          <span className="camera-bg-control__swatch-face camera-bg-control__swatch-face--none">
            <Ban size={13} strokeWidth={1.75} aria-hidden />
          </span>
        </button>

        <button
          type="button"
          className={clsx("camera-bg-control__swatch", mode === "blur" && "is-selected")}
          disabled={busy}
          aria-pressed={mode === "blur"}
          aria-label={
            canUseCustomBackgrounds ? "Fond flou" : "Fond flou — disponible avec Pro"
          }
          title={canUseCustomBackgrounds ? "Flou" : "Pro requis"}
          onClick={() => {
            if (requireProOrSettings()) return;
            void setMode("blur");
          }}
        >
          <span className="camera-bg-control__swatch-face camera-bg-control__swatch-face--blur">
            <Sparkles size={13} strokeWidth={1.75} aria-hidden />
          </span>
        </button>

        {images.map((image) => (
          <button
            key={image.id}
            type="button"
            className={clsx(
              "camera-bg-control__swatch",
              mode === "image" && selectedImageId === image.id && "is-selected",
            )}
            disabled={busy}
            aria-pressed={mode === "image" && selectedImageId === image.id}
            aria-label={
              canUseCustomBackgrounds ? "Fond image" : "Fond image — disponible avec Pro"
            }
            title={canUseCustomBackgrounds ? "Image" : "Pro requis"}
            onClick={() => {
              if (requireProOrSettings()) return;
              void selectImage(image.id);
            }}
          >
            <span className="camera-bg-control__swatch-face">
              <img src={image.url} alt="" className="camera-bg-control__thumb" />
            </span>
          </button>
        ))}

        <button
          type="button"
          className="camera-bg-control__swatch camera-bg-control__swatch--add"
          disabled={busy}
          aria-label={
            canUseCustomBackgrounds
              ? images.length >= CAMERA_BG_IMAGE_MAX
                ? "Ajouter une image (remplace la plus ancienne)"
                : "Ajouter une image"
              : "Ajouter une image — disponible avec Pro"
          }
          title={canUseCustomBackgrounds ? "Ajouter" : "Pro requis"}
          onClick={() => {
            if (requireProOrSettings()) return;
            fileInputRef.current?.click();
          }}
        >
          <span className="camera-bg-control__swatch-face camera-bg-control__swatch-face--add">
            <Plus size={14} strokeWidth={2} aria-hidden />
          </span>
        </button>
      </div>

      {error ? <p className="camera-bg-control__error">{error}</p> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="camera-bg-control__file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (requireProOrSettings()) return;
          void addImageFromFile(file);
        }}
      />
    </div>
  );
}
