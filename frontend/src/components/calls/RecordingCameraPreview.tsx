import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { hasFormaDesktop } from "../../lib/formaDesktop";
import { startRecordingCamera, stopRecordingCamera } from "../../lib/recordingMedia";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";

export default function RecordingCameraPreview() {
  const recording = useCallsStore((s) => s.recording);
  const recordingCameraPreview = useStore((s) => s.recordingCameraPreview);
  const recordingCameraMirrorPreview = useStore((s) => s.recordingCameraMirrorPreview);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const desktop = hasFormaDesktop();

  const visible = recording && recordingCameraPreview;

  // Desktop: floating always-on-top window so the camera stays over Chrome/Google etc.
  useEffect(() => {
    if (!desktop) return;
    const api = window.formaDesktop;
    if (!api?.showRecordingCameraOverlay || !api.hideRecordingCameraOverlay) return;

    if (!visible) {
      void api.hideRecordingCameraOverlay?.();
      return;
    }

    void api.showRecordingCameraOverlay({ mirror: recordingCameraMirrorPreview });
    return () => {
      void api.hideRecordingCameraOverlay?.();
    };
  }, [desktop, visible, recordingCameraMirrorPreview]);

  useEffect(() => {
    if (!desktop || !visible) return;
    void window.formaDesktop?.updateRecordingCameraOverlay?.({
      mirror: recordingCameraMirrorPreview,
    });
  }, [desktop, visible, recordingCameraMirrorPreview]);

  // Browser / non-desktop: in-app bubble only.
  useEffect(() => {
    if (desktop || !visible) {
      if (!desktop) {
        stopRecordingCamera();
        setStream(null);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);

    void startRecordingCamera()
      .then((media) => {
        if (cancelled) return;
        setStream(media);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStream(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      stopRecordingCamera();
      setStream(null);
      setLoading(false);
    };
  }, [desktop, visible]);

  useEffect(() => {
    if (desktop) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
  }, [desktop, stream]);

  if (!visible || desktop) return null;

  const showVideo = stream && !loading;

  return (
    <div className="recording-camera-preview" aria-label="Aperçu caméra enregistrement">
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={clsx(
            "recording-camera-preview__video",
            recordingCameraMirrorPreview && "recording-camera-preview__video--mirrored",
          )}
        />
      ) : (
        <div className="recording-camera-preview__placeholder">
          <Video size={22} className="text-muted-500" aria-hidden />
        </div>
      )}
    </div>
  );
}
