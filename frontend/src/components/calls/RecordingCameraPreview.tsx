import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { startRecordingCamera, stopRecordingCamera } from "../../lib/recordingMedia";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";

export default function RecordingCameraPreview() {
  const recording = useCallsStore((s) => s.recording);
  const recordingCameraPreview = useStore((s) => s.recordingCameraPreview);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);

  const visible = recording && recordingCameraPreview;

  useEffect(() => {
    if (!visible) {
      stopRecordingCamera();
      setStream(null);
      setLoading(false);
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
  }, [visible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
  }, [stream]);

  if (!visible) return null;

  const showVideo = stream && !loading;

  return (
    <div className="recording-camera-preview" aria-label="Aperçu caméra enregistrement">
      {showVideo ? (
        <video ref={videoRef} autoPlay muted playsInline className="recording-camera-preview__video" />
      ) : (
        <div className="recording-camera-preview__placeholder">
          <Video size={22} className="text-muted-500" aria-hidden />
        </div>
      )}
    </div>
  );
}
