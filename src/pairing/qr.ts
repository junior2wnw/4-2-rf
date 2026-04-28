import QRCode from "qrcode";
import { PairingInvite, encodePairingInvite } from "./invite.js";

export type QrFormat = "svg" | "terminal" | "data_url";

export interface QrRenderOptions {
  readonly format: QrFormat;
  readonly margin?: number;
  readonly scale?: number;
  readonly errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

export interface RenderedQr {
  readonly format: QrFormat;
  readonly contentType: string;
  readonly body: string;
}

export interface QrRenderer {
  readonly id: string;
  render(data: string, options: QrRenderOptions): Promise<RenderedQr>;
}

export class QrcodeRenderer implements QrRenderer {
  readonly id = "qrcode-renderer";

  async render(data: string, options: QrRenderOptions): Promise<RenderedQr> {
    const qrOptions = {
      errorCorrectionLevel: options.errorCorrectionLevel ?? "M",
      margin: options.margin ?? 2,
      scale: options.scale ?? 6
    } as const;

    if (options.format === "terminal") {
      return {
        format: "terminal",
        contentType: "text/plain; charset=utf-8",
        body: await QRCode.toString(data, { ...qrOptions, type: "terminal" })
      };
    }

    if (options.format === "data_url") {
      return {
        format: "data_url",
        contentType: "text/plain; charset=utf-8",
        body: await QRCode.toDataURL(data, qrOptions)
      };
    }

    return {
      format: "svg",
      contentType: "image/svg+xml",
      body: await QRCode.toString(data, { ...qrOptions, type: "svg" })
    };
  }
}

export async function renderPairingQr(
  invite: PairingInvite,
  renderer: QrRenderer = new QrcodeRenderer(),
  options: QrRenderOptions = { format: "svg" }
): Promise<RenderedQr> {
  return renderer.render(encodePairingInvite(invite), options);
}
