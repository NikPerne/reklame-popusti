/**
 * Barcode helpers for the scanner. Product barcodes are EAN-13, EAN-8 or UPC-A; their last
 * digit is a checksum, which filters out misreads from a shaky camera.
 */
export function isValidEan(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop() ?? -1;
  // Weights 3,1,3,1,... from the right (excluding the check digit).
  const sum = digits.reverse().reduce((total, d, i) => total + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-A codes are EAN-13 codes with a leading 0; stores list them that way. */
export function toEan13(code: string): string {
  return code.length === 12 ? `0${code}` : code;
}

type StopScanning = () => void;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

declare const BarcodeDetector:
  | ((new (options: { formats: string[] }) => BarcodeDetectorLike) & {
      getSupportedFormats?: () => Promise<string[]>;
    })
  | undefined;

const FORMATS = ['ean_13', 'ean_8', 'upc_a'];

/**
 * Starts the rear camera in `video` and calls `onCode` with each valid barcode it sees.
 * Uses the browser's BarcodeDetector where available (Chrome on Android), otherwise loads
 * ZXing on demand (Safari). Rejects if the camera can't be used.
 */
export async function startScanning(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<StopScanning> {
  const report = (raw: string) => {
    const code = raw.trim();
    if (isValidEan(code)) onCode(toEan13(code));
  };

  if (typeof BarcodeDetector !== 'undefined') {
    const supported = (await BarcodeDetector.getSupportedFormats?.()) ?? FORMATS;
    if (FORMATS.some((f) => supported.includes(f))) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      const detector = new BarcodeDetector({
        formats: FORMATS.filter((f) => supported.includes(f)),
      });
      let active = true;
      const tick = async () => {
        if (!active) return;
        try {
          for (const barcode of await detector.detect(video)) report(barcode.rawValue);
        } catch {
          // A frame that can't be read; try the next one.
        }
        if (active) setTimeout(() => void tick(), 200);
      };
      void tick();
      return () => {
        active = false;
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      };
    }
  }

  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: 'environment' }, audio: false },
    video,
    (result) => {
      if (result) report(result.getText());
    },
  );
  return () => controls.stop();
}
