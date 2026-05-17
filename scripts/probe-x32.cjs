const dgram = require("dgram");

const PORT = 10023;
const TIMEOUT_MS = 400;
const candidates = process.argv.slice(2);

function padOscString(value) {
  const base = Buffer.from(`${value}\0`, "utf8");
  const padding = (4 - (base.length % 4)) % 4;
  return padding === 0 ? base : Buffer.concat([base, Buffer.alloc(padding)]);
}

function encodeQuery(address) {
  return Buffer.concat([padOscString(address), padOscString(",")]);
}

function decodeOsc(buffer) {
  let offset = 0;
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  const address = buffer.slice(offset, end).toString("utf8");
  offset = end + 1;
  offset = Math.ceil(offset / 4) * 4;
  const typeTags = buffer.slice(offset, buffer.indexOf(0, offset)).toString("utf8");
  offset = buffer.indexOf(0, offset) + 1;
  offset = Math.ceil(offset / 4) * 4;
  const args = [];
  for (const tag of typeTags.slice(1)) {
    if (tag === "s") {
      end = offset;
      while (end < buffer.length && buffer[end] !== 0) end += 1;
      args.push(buffer.slice(offset, end).toString("utf8"));
      offset = end + 1;
      offset = Math.ceil(offset / 4) * 4;
    }
  }
  return { address, args };
}

function probe(ip) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, TIMEOUT_MS);

    socket.on("message", (packet) => {
      clearTimeout(timer);
      try {
        const decoded = decodeOsc(packet);
        socket.close();
        resolve({ ip, address: decoded.address, args: decoded.args });
      } catch (error) {
        socket.close();
        resolve({ ip, error: String(error) });
      }
    });

    socket.send(encodeQuery("/ch/01/config/name"), PORT, ip, (error) => {
      if (error) {
        clearTimeout(timer);
        socket.close();
        resolve(null);
      }
    });
  });
}

async function main() {
  const ips =
    candidates.length > 0
      ? candidates
      : Array.from({ length: 254 }, (_, index) => `192.168.0.${index + 1}`);

  const hits = [];
  const batchSize = 20;
  for (let index = 0; index < ips.length; index += batchSize) {
    const batch = ips.slice(index, index + batchSize);
    const results = await Promise.all(batch.map((ip) => probe(ip)));
    for (const result of results) {
      if (result) hits.push(result);
    }
  }

  if (hits.length === 0) {
    console.log("Nenhuma resposta OSC na porta 10023.");
    process.exit(1);
  }

  for (const hit of hits) {
    console.log(JSON.stringify(hit));
  }
}

main();
