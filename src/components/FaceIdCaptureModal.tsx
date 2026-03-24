import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, LoaderCircle, X } from 'lucide-react';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
const TRAIN_SECONDS = 10;
const TEST_SECONDS = 3;
const SAMPLE_INTERVAL_MS = 150;
const MIN_TRAIN_FRAMES = 20;
const MIN_TEST_FRAMES = 6;
const MAX_MEAN_DESCRIPTOR_DISTANCE = 0.46;

type FaceIdMode = 'train' | 'test';

type CaptureResult = {
  mode: FaceIdMode;
  personName: string;
  embedding: number[];
  acceptedFrames: number;
  qualityScore: number;
  snapshots: Blob[];
};

type FaceIdCaptureModalProps = {
  isOpen: boolean;
  mode: FaceIdMode;
  onClose: () => void;
  onComplete: (result: CaptureResult) => Promise<void>;
};

let modelLoadPromise: Promise<void> | null = null;

function normalizeVector(vector: number[]): number[] {
  const sum = vector.reduce((acc, value) => acc + value * value, 0);
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm <= 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}

function averageDescriptors(descriptors: Float32Array[]): number[] {
  if (descriptors.length === 0) {
    return [];
  }

  const size = descriptors[0].length;
  const totals = new Array<number>(size).fill(0);
  for (const descriptor of descriptors) {
    for (let index = 0; index < size; index += 1) {
      totals[index] += descriptor[index];
    }
  }

  return normalizeVector(totals.map((value) => value / descriptors.length));
}

function euclideanDistance(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    total += delta * delta;
  }

  return Math.sqrt(total);
}

function descriptorSpread(descriptors: Float32Array[], centroid: number[]): number {
  if (descriptors.length === 0 || centroid.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const distances = descriptors.map((descriptor) => euclideanDistance(Array.from(descriptor), centroid));
  const total = distances.reduce((acc, value) => acc + value, 0);
  return total / distances.length;
}

function angleHintForElapsed(elapsedMs: number): string {
  const elapsed = elapsedMs / 1000;
  if (elapsed < 2) return 'Face forward';
  if (elapsed < 4) return 'Turn slightly left';
  if (elapsed < 6) return 'Turn slightly right';
  if (elapsed < 8) return 'Tilt up then down';
  return 'Hold steady and blink naturally';
}

async function ensureModelsLoaded(): Promise<void> {
  if (!modelLoadPromise) {
    modelLoadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => undefined);
  }

  await modelLoadPromise;
}

export function FaceIdCaptureModal({ isOpen, mode, onClose, onComplete }: FaceIdCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const sampleRef = useRef<number | null>(null);
  const samplingInFlightRef = useRef(false);

  const [personName, setPersonName] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(mode === 'train' ? TRAIN_SECONDS : TEST_SECONDS);
  const [sampleAttempts, setSampleAttempts] = useState(0);
  const [acceptedFrames, setAcceptedFrames] = useState(0);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const title = mode === 'train' ? 'Train Face ID' : 'Test Face ID';
  const canStart = mode === 'test' || personName.trim().length > 0;

  const runSeconds = useMemo(() => (mode === 'train' ? TRAIN_SECONDS : TEST_SECONDS), [mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setPersonName('');
    setIsPreparing(false);
    setIsRunning(false);
    setIsSubmitting(false);
    setSampleAttempts(0);
    setAcceptedFrames(0);
    setSecondsLeft(runSeconds);
    setStatus('');
    setErrorMessage('');
  }, [isOpen, runSeconds]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function stopCamera() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (sampleRef.current !== null) {
      window.clearInterval(sampleRef.current);
      sampleRef.current = null;
    }

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  async function sampleFrame(descriptors: Float32Array[], snapshots: Blob[]) {
    if (samplingInFlightRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      return;
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    samplingInFlightRef.current = true;
    try {
      let detection: any = null;

      try {
        detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.7 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
      } catch {
        detection = null;
      }

      if (!detection?.descriptor) {
        return;
      }

      const normalizedDescriptor = new Float32Array(normalizeVector(Array.from(detection.descriptor)));

      const frameArea = width * height;
      const box = detection?.detection?.box;
      const boxArea = box && typeof box.width === 'number' && typeof box.height === 'number'
        ? box.width * box.height
        : 0;
      const faceCoverage = frameArea > 0 ? boxArea / frameArea : 0;

      if (faceCoverage < 0.08 || faceCoverage > 0.7) {
        return;
      }

      descriptors.push(normalizedDescriptor);
      setAcceptedFrames((count) => count + 1);

      if (mode === 'train' && snapshots.length < 8) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.9);
        });

        if (blob) {
          snapshots.push(blob);
        }
      }
    } finally {
      samplingInFlightRef.current = false;
    }
  }

  async function startCapture() {
    setErrorMessage('');
    setStatus('Preparing camera...');
    setSampleAttempts(0);
    setAcceptedFrames(0);
    setSecondsLeft(runSeconds);
    setIsPreparing(true);

    const descriptors: Float32Array[] = [];
    const snapshots: Blob[] = [];

    try {
      await ensureModelsLoaded();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new Error('Camera preview not available.');
      }

      video.srcObject = stream;
      await video.play();

      setIsPreparing(false);
      setIsRunning(true);
      setStatus(mode === 'train' ? 'Move your head with the prompts.' : 'Look at the camera.');

      const startedAt = Date.now();

      sampleRef.current = window.setInterval(() => {
        setSampleAttempts((count) => count + 1);
        void sampleFrame(descriptors, snapshots);
      }, SAMPLE_INTERVAL_MS);

      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, runSeconds - Math.floor(elapsed / 1000));
        setSecondsLeft(remaining);

        if (mode === 'train') {
          setStatus(angleHintForElapsed(elapsed));
        }

        if (elapsed >= runSeconds * 1000) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (sampleRef.current !== null) {
            window.clearInterval(sampleRef.current);
            sampleRef.current = null;
          }

          void finalizeCapture(descriptors, snapshots);
        }
      }, 200);
    } catch (error) {
      stopCamera();
      setIsPreparing(false);
      setIsRunning(false);
      setStatus('');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize camera.');
    }
  }

  async function finalizeCapture(descriptors: Float32Array[], snapshots: Blob[]) {
    stopCamera();
    setIsRunning(false);

    if (descriptors.length === 0) {
      setStatus('');
      setErrorMessage(
        mode === 'train'
          ? 'No face descriptors were captured. Try again in brighter light and keep your full face visible.'
          : 'No face descriptors were captured. Try again and look directly at the camera.'
      );
      return;
    }

    const requiredFrames = mode === 'train' ? MIN_TRAIN_FRAMES : MIN_TEST_FRAMES;
    if (descriptors.length < requiredFrames) {
      setStatus('');
      setErrorMessage(`Capture quality too low. Need at least ${requiredFrames} accepted frames; got ${descriptors.length}.`);
      return;
    }

    const embedding = averageDescriptors(descriptors);
    if (embedding.length === 0) {
      setStatus('');
      setErrorMessage('Failed to compute face embedding. Please try again.');
      return;
    }

    const meanDistance = descriptorSpread(descriptors, embedding);
    if (!Number.isFinite(meanDistance) || meanDistance > MAX_MEAN_DESCRIPTOR_DISTANCE) {
      setStatus('');
      setErrorMessage('Face capture was inconsistent across frames. Keep your full face centered and try again.');
      return;
    }

    const coverageScore = Math.min(1, descriptors.length / Math.max(1, runSeconds * 4));
    const consistencyScore = Math.max(0, 1 - meanDistance / MAX_MEAN_DESCRIPTOR_DISTANCE);
    const avgScore = Number((0.65 * coverageScore + 0.35 * consistencyScore).toFixed(4));

    setStatus('Submitting Face ID...');
    setIsSubmitting(true);

    try {
      await onComplete({
        mode,
        personName: personName.trim(),
        embedding,
        acceptedFrames: descriptors.length,
        qualityScore: avgScore,
        snapshots,
      });
      setStatus('Done');
      onClose();
    } catch (error) {
      setStatus('');
      setErrorMessage(error instanceof Error ? error.message : 'Face ID request failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isBusy = isPreparing || isRunning || isSubmitting;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">{title}</h2>
              <button
                onClick={onClose}
                disabled={isBusy}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {mode === 'train' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Name</label>
                  <input
                    type="text"
                    value={personName}
                    disabled={isBusy}
                    onChange={(event) => setPersonName(event.target.value)}
                    placeholder="Enter person name"
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="rounded-xl border border-slate-700 bg-slate-950 p-2 overflow-hidden">
                <video ref={videoRef} playsInline muted className="w-full rounded-lg aspect-video bg-black object-cover" />
              </div>

              <canvas ref={canvasRef} className="hidden" />

              <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 text-sm text-slate-300 flex flex-wrap gap-4">
                <span>Time Left: <strong className="text-white">{secondsLeft}s</strong></span>
                <span>Sample Attempts: <strong className="text-white">{sampleAttempts}</strong></span>
                <span>Accepted Frames: <strong className="text-white">{acceptedFrames}</strong></span>
                {status && <span className="text-blue-300">{status}</span>}
              </div>

              {errorMessage && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {errorMessage}
                </p>
              )}

              <p className="text-xs text-slate-400">
                {mode === 'train'
                  ? 'Training requires stable, high-confidence face descriptors across many frames.'
                  : 'Testing requires a stable high-confidence face capture before matching.'}
              </p>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isBusy}
                className="px-4 py-2.5 border border-slate-700 hover:border-slate-500 text-slate-200 font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void startCapture()}
                disabled={!canStart || isBusy}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {isPreparing ? 'Preparing...' : isRunning ? 'Capturing...' : isSubmitting ? 'Saving...' : 'Start'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
