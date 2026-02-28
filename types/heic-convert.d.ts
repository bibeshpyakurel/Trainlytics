declare module "heic-convert" {
  function convert(input: {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<Uint8Array | Buffer>;

  export = convert;
}
