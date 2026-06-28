declare module 'qrcode' {
  export interface QRCodeToBufferOptions {
    type: 'png';
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    scale?: number;
  }

  export function toBuffer(text: string, options: QRCodeToBufferOptions): Promise<Buffer>;

  const QRCode: {
    toBuffer: typeof toBuffer;
  };

  export default QRCode;
}
