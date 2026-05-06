export type OscArg =
  | { type: "f"; value: number }
  | { type: "i"; value: number };

export type DecodedOscMessage = {
  address: string;
  typeTags: string[];
  args: Array<number | string>;
};

function toOscStringBuffer(value: string): Buffer {
  const base = Buffer.from(`${value}\0`, "utf8");
  const padding = (4 - (base.length % 4)) % 4;
  return padding === 0 ? base : Buffer.concat([base, Buffer.alloc(padding)]);
}

function toOscArgBuffer(arg: OscArg): Buffer {
  const buffer = Buffer.alloc(4);

  if (arg.type === "f") {
    buffer.writeFloatBE(arg.value, 0);
    return buffer;
  }

  buffer.writeInt32BE(arg.value, 0);
  return buffer;
}

export function encodeOscMessage(address: string, args: OscArg[]): Buffer {
  if (!address.startsWith("/")) {
    throw new Error("OSC address invalido.");
  }

  const addressBuffer = toOscStringBuffer(address);
  const typeTags = `,${args.map((arg) => arg.type).join("")}`;
  const typeTagBuffer = toOscStringBuffer(typeTags);
  const argBuffers = args.map((arg) => toOscArgBuffer(arg));

  return Buffer.concat([addressBuffer, typeTagBuffer, ...argBuffers]);
}

function readOscString(buffer: Buffer, startOffset: number): {
  value: string;
  nextOffset: number;
} {
  let cursor = startOffset;
  while (cursor < buffer.length && buffer[cursor] !== 0) {
    cursor += 1;
  }

  if (cursor >= buffer.length) {
    throw new Error("OSC string malformada.");
  }

  const value = buffer.toString("utf8", startOffset, cursor);
  const rawLength = cursor - startOffset + 1;
  const paddedLength = Math.ceil(rawLength / 4) * 4;
  return {
    value,
    nextOffset: startOffset + paddedLength,
  };
}

export function decodeOscMessage(buffer: Buffer): DecodedOscMessage {
  const addressInfo = readOscString(buffer, 0);
  const typeTagInfo = readOscString(buffer, addressInfo.nextOffset);
  const typeTagRaw = typeTagInfo.value;

  if (!typeTagRaw.startsWith(",")) {
    throw new Error("OSC typetag invalida.");
  }

  const typeTags = typeTagRaw.slice(1).split("").filter(Boolean);
  const args: Array<number | string> = [];
  let cursor = typeTagInfo.nextOffset;

  for (const tag of typeTags) {
    if (tag === "f") {
      if (cursor + 4 > buffer.length) {
        throw new Error("OSC float truncado.");
      }
      args.push(buffer.readFloatBE(cursor));
      cursor += 4;
      continue;
    }

    if (tag === "i") {
      if (cursor + 4 > buffer.length) {
        throw new Error("OSC int truncado.");
      }
      args.push(buffer.readInt32BE(cursor));
      cursor += 4;
      continue;
    }

    if (tag === "s") {
      const textInfo = readOscString(buffer, cursor);
      args.push(textInfo.value);
      cursor = textInfo.nextOffset;
      continue;
    }

    throw new Error(`OSC typetag nao suportada: ${tag}`);
  }

  return {
    address: addressInfo.value,
    typeTags,
    args,
  };
}
