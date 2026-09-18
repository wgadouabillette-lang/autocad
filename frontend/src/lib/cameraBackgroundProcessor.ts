/** Local camera virtual background: none | blur | custom image. */

export type CameraBackgroundMode = "none" | "blur" | "image";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
/** Landscape model is sharper on webcam aspect ratios. */
const SELFIE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite";

/** Soft edge width (px at output resolution). */
const MASK_FEATHER_PX = 5;

type MaskBuffer = {
  getAsFloat32Array?: () => Float32Array;
  getAsUint8Array?: () => Uint8Array;
  close?: () => void;
  width: number;
  height: number;
};

type SegmentResult = {
  categoryMask?: MaskBuffer;
  confidenceMasks?: MaskBuffer[];
};

type ImageSegmenterLike = {
  segmentForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
    callback: (result: SegmentResult) => void,
  ) => void;
  close: () => void;
};

let segmenterPromise: Promise<ImageSegmenterLike | null> | null = null;

async function loadSegmenter(): Promise<ImageSegmenterLike | null> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      let segmenter: ImageSegmenterLike | null = null;
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          const fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
          segmenter = (await vision.ImageSegmenter.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: SELFIE_MODEL,
              delegate,
            },
            runningMode: "VIDEO",
            outputCategoryMask: true,
            outputConfidenceMasks: true,
          })) as unknown as ImageSegmenterLike;
          break;
        } catch (error) {
          console.warn(`[cameraBackground] segmenter ${delegate} failed`, error);
        }
      }
      return segmenter;
    } catch (error) {
      console.warn("[cameraBackground] MediaPipe load failed", error);
      segmenterPromise = null;
      return null;
    }
  })();
  return segmenterPromise;
}

/**
 * Build a soft person alpha mask into `maskCtx` at `outW`×`outH`.
 * Prefer confidence floats; fall back to feathered category mask.
 */
function paintSoftPersonMask(
  maskCtx: CanvasRenderingContext2D,
  softCtx: CanvasRenderingContext2D,
  softCanvas: HTMLCanvasElement,
  result: SegmentResult,
  outW: number,
  outH: number,
): boolean {
  const confidence = result.confidenceMasks?.[0] ?? result.confidenceMasks?.[1];
  const category = result.categoryMask;

  let srcW = 0;
  let srcH = 0;
  let alphas: Float32Array | null = null;

  if (confidence?.getAsFloat32Array) {
    const data = confidence.getAsFloat32Array();
    srcW = confidence.width;
    srcH = confidence.height;
    alphas = new Float32Array(data.length);
    // Detect polarity: mean confidence — if high, treat as background channel.
    let sum = 0;
    const step = Math.max(1, Math.floor(data.length / 256));
    let samples = 0;
    for (let i = 0; i < data.length; i += step) {
      sum += data[i];
      samples += 1;
    }
    const mean = samples ? sum / samples : 0.5;
    const invert = mean > 0.55;
    for (let i = 0; i < data.length; i++) {
      const v = invert ? 1 - data[i] : data[i];
      // Contrast curve: keep center soft, push midtones toward person/bg.
      const shaped = Math.min(1, Math.max(0, (v - 0.2) / 0.55));
      alphas[i] = shaped * shaped * (3 - 2 * shaped); // smoothstep
    }
  } else if (category?.getAsUint8Array) {
    const data = category.getAsUint8Array();
    srcW = category.width;
    srcH = category.height;
    let personSamples = 0;
    const sampleStep = Math.max(1, Math.floor(data.length / 200));
    for (let i = 0; i < data.length; i += sampleStep) {
      if (data[i] > 0) personSamples += 1;
    }
    const invert = personSamples / Math.ceil(data.length / sampleStep) > 0.65;
    alphas = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const isPerson = invert ? data[i] === 0 : data[i] > 0;
      alphas[i] = isPerson ? 1 : 0;
    }
  } else {
    return false;
  }

  softCanvas.width = srcW;
  softCanvas.height = srcH;
  const imageData = softCtx.createImageData(srcW, srcH);
  const px = imageData.data;
  for (let i = 0; i < alphas.length; i++) {
    const a = Math.round(alphas[i] * 255);
    const j = i * 4;
    px[j] = 255;
    px[j + 1] = 255;
    px[j + 2] = 255;
    px[j + 3] = a;
  }
  softCtx.putImageData(imageData, 0, 0);

  // Upscale with smoothing, then feather edges at output resolution.
  maskCtx.save();
  maskCtx.clearRect(0, 0, outW, outH);
  maskCtx.imageSmoothingEnabled = true;
  maskCtx.imageSmoothingQuality = "high";
  maskCtx.filter = `blur(${MASK_FEATHER_PX}px)`;
  maskCtx.drawImage(softCanvas, 0, 0, outW, outH);
  maskCtx.filter = "none";
  maskCtx.restore();

  confidence?.close?.();
  category?.close?.();
  result.confidenceMasks?.forEach((m) => {
    if (m !== confidence) m.close?.();
  });

  return true;
}

export type CameraBackgroundProcessor = {
  getMode: () => CameraBackgroundMode;
  setMode: (mode: CameraBackgroundMode) => Promise<void>;
  setBackgroundImage: (blob: Blob | null) => Promise<void>;
  attachRawTrack: (track: MediaStreamTrack) => Promise<MediaStreamTrack>;
  getOutputTrack: () => MediaStreamTrack | null;
  getRawTrack: () => MediaStreamTrack | null;
  detach: () => void;
  destroy: () => void;
};

export function createCameraBackgroundProcessor(): CameraBackgroundProcessor {
  let mode: CameraBackgroundMode = "none";
  let rawTrack: MediaStreamTrack | null = null;
  let outputTrack: MediaStreamTrack | null = null;
  let captureStream: MediaStream | null = null;
  let rafId = 0;
  let running = false;
  let destroyed = false;
  let bgImage: HTMLImageElement | null = null;
  let bgObjectUrl: string | null = null;
  let lastTimestamp = -1;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const blurCanvas = document.createElement("canvas");
  const blurCtx = blurCanvas.getContext("2d");
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const softMaskCanvas = document.createElement("canvas");
  const softMaskCtx = softMaskCanvas.getContext("2d", { willReadFrequently: true });
  const personCanvas = document.createElement("canvas");
  const personCtx = personCanvas.getContext("2d");

  function stopLoop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function teardownOutput() {
    stopLoop();
    if (outputTrack && outputTrack !== rawTrack) {
      outputTrack.stop();
    }
    outputTrack = null;
    captureStream = null;
  }

  function teardownRawSink() {
    video.pause();
    video.srcObject = null;
  }

  function revokeBgUrl() {
    if (bgObjectUrl) {
      URL.revokeObjectURL(bgObjectUrl);
      bgObjectUrl = null;
    }
  }

  async function ensureProcessingPipeline(raw: MediaStreamTrack): Promise<MediaStreamTrack> {
    if (!ctx || !blurCtx || !maskCtx || !softMaskCtx || !personCtx) {
      throw new Error("Canvas 2D indisponible pour les fonds caméra.");
    }

    const segmenter = await loadSegmenter();
    if (!segmenter) {
      throw new Error("Segmentation caméra indisponible.");
    }

    teardownOutput();
    video.srcObject = new MediaStream([raw]);
    await video.play().catch(() => undefined);

    for (let i = 0; i < 20 && video.videoWidth === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }

    const width = raw.getSettings().width || video.videoWidth || 640;
    const height = raw.getSettings().height || video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    blurCanvas.width = width;
    blurCanvas.height = height;
    maskCanvas.width = width;
    maskCanvas.height = height;
    personCanvas.width = width;
    personCanvas.height = height;

    captureStream = canvas.captureStream(30);
    outputTrack = captureStream.getVideoTracks()[0] ?? null;
    if (!outputTrack) {
      throw new Error("Impossible de créer le flux fond caméra.");
    }

    running = true;
    lastTimestamp = -1;

    const tick = () => {
      if (!running || destroyed || !outputTrack || outputTrack.readyState !== "live") return;
      rafId = requestAnimationFrame(tick);

      if (video.readyState < 2 || video.videoWidth === 0) return;

      const w = canvas.width;
      const h = canvas.height;
      const now = Math.max(performance.now(), lastTimestamp + 1);
      lastTimestamp = now;

      try {
        segmenter.segmentForVideo(video, now, (result) => {
          if (!running || !ctx || !blurCtx || !maskCtx || !softMaskCtx || !personCtx) return;

          const ok = paintSoftPersonMask(maskCtx, softMaskCtx, softMaskCanvas, result, w, h);
          if (!ok) {
            ctx.drawImage(video, 0, 0, w, h);
            return;
          }

          // Background
          if (mode === "image" && bgImage?.complete && bgImage.naturalWidth > 0) {
            const scale = Math.max(w / bgImage.naturalWidth, h / bgImage.naturalHeight);
            const dw = bgImage.naturalWidth * scale;
            const dh = bgImage.naturalHeight * scale;
            ctx.drawImage(bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
          } else {
            blurCtx.filter = "blur(16px)";
            blurCtx.drawImage(video, 0, 0, w, h);
            blurCtx.filter = "none";
            ctx.drawImage(blurCanvas, 0, 0);
          }

          // Person with soft alpha mask
          personCtx.clearRect(0, 0, w, h);
          personCtx.drawImage(video, 0, 0, w, h);
          personCtx.globalCompositeOperation = "destination-in";
          personCtx.drawImage(maskCanvas, 0, 0, w, h);
          personCtx.globalCompositeOperation = "source-over";
          ctx.drawImage(personCanvas, 0, 0);
        });
      } catch (error) {
        console.warn("[cameraBackground] frame failed", error);
        ctx.drawImage(video, 0, 0, w, h);
      }
    };

    rafId = requestAnimationFrame(tick);
    return outputTrack;
  }

  async function refreshOutput(): Promise<MediaStreamTrack | null> {
    if (!rawTrack || rawTrack.readyState !== "live") {
      teardownOutput();
      teardownRawSink();
      return null;
    }

    if (mode === "none" || (mode === "image" && !bgImage)) {
      teardownOutput();
      teardownRawSink();
      outputTrack = rawTrack;
      return rawTrack;
    }

    return ensureProcessingPipeline(rawTrack);
  }

  return {
    getMode: () => mode,

    async setMode(next) {
      if (destroyed) return;
      mode = next;
      await refreshOutput();
    },

    async setBackgroundImage(blob) {
      if (destroyed) return;
      revokeBgUrl();
      bgImage = null;
      if (!blob) {
        await refreshOutput();
        return;
      }
      bgObjectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image de fond invalide."));
        img.src = bgObjectUrl!;
      });
      bgImage = img;
      await refreshOutput();
    },

    async attachRawTrack(track) {
      if (destroyed) throw new Error("Processor détruit.");
      rawTrack = track;
      const out = await refreshOutput();
      return out ?? track;
    },

    getOutputTrack() {
      return outputTrack;
    },

    getRawTrack() {
      return rawTrack;
    },

    detach() {
      stopLoop();
      teardownOutput();
      teardownRawSink();
      if (rawTrack) {
        rawTrack.stop();
        rawTrack = null;
      }
    },

    destroy() {
      destroyed = true;
      stopLoop();
      teardownOutput();
      teardownRawSink();
      if (rawTrack) {
        rawTrack.stop();
        rawTrack = null;
      }
      revokeBgUrl();
      bgImage = null;
    },
  };
}

let sharedProcessor: CameraBackgroundProcessor | null = null;

export function getCameraBackgroundProcessor(): CameraBackgroundProcessor {
  if (!sharedProcessor) {
    sharedProcessor = createCameraBackgroundProcessor();
  }
  return sharedProcessor;
}

export function destroyCameraBackgroundProcessor(): void {
  sharedProcessor?.destroy();
  sharedProcessor = null;
}
