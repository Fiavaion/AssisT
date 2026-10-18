/**
 * Zip archives assembled byte by byte, so the suites can hand the reader files no zip library
 * would ever produce: a data descriptor, a legacy name, a wrong checksum, a Zip64 flag, an
 * encrypted flag, a truncated body. Node's zlib supplies the deflate and an independent CRC32, so
 * a mistake in the reader's own table cannot agree with itself.
 */

import { deflateRawSync, crc32 } from 'node:zlib';

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const DESCRIPTOR_SIGNATURE = 0x08074b50;
const END_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

/** @param {Buffer} buffer @returns {ArrayBuffer} exactly those bytes, as a file input would give. */
export const toArrayBuffer = buffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

/**
 * Assemble an archive.
 *
 * Each entry: `{name, data, method, utf8, dataDescriptor, encrypted, crc, zip64, nameBytes,
 * localOffset}`. The last five exist only so a test can write a header no honest zipper would.
 *
 * @param {Array<Object>} entries
 * @param {Object} [options] - `{comment, diskNumber, totalEntries, zip64Locator, centralOffset}`,
 *   again so that a malformed end record can be written deliberately.
 * @returns {ArrayBuffer}
 */
export function buildZip(entries, options = {}) {
  const {
    comment = '',
    diskNumber = 0,
    totalEntries,
    zip64Locator = false,
    centralOffset,
  } = options;
  const body = [];
  const central = [];
  let offset = 0;

  for (const spec of entries) {
    const {
      name,
      data = '',
      method = 0,
      utf8 = true,
      dataDescriptor = false,
      encrypted = false,
      crc: crcOverride,
      zip64 = false,
      nameBytes,
      localOffset,
    } = spec;

    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const crc = crcOverride === undefined ? crc32(raw) : crcOverride;
    const nameBuffer = nameBytes || Buffer.from(name, 'utf8');
    const flags = (utf8 ? 0x0800 : 0) | (dataDescriptor ? 0x0008 : 0) | (encrypted ? 0x0001 : 0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(dataDescriptor ? 0 : crc >>> 0, 14);
    local.writeUInt32LE(dataDescriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(dataDescriptor ? 0 : raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);

    const start = offset;
    body.push(local, nameBuffer, compressed);
    offset += local.length + nameBuffer.length + compressed.length;

    if (dataDescriptor) {
      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(DESCRIPTOR_SIGNATURE, 0);
      descriptor.writeUInt32LE(crc >>> 0, 4);
      descriptor.writeUInt32LE(compressed.length, 8);
      descriptor.writeUInt32LE(raw.length, 12);
      body.push(descriptor);
      offset += descriptor.length;
    }

    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(flags, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(crc >>> 0, 16);
    header.writeUInt32LE(zip64 ? 0xffffffff : compressed.length, 20);
    header.writeUInt32LE(zip64 ? 0xffffffff : raw.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt32LE(localOffset === undefined ? start : localOffset, 42);
    central.push(header, nameBuffer);
  }

  const directory = Buffer.concat(central);
  const commentBuffer = Buffer.from(comment, 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(diskNumber, 4);
  end.writeUInt16LE(diskNumber, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(totalEntries === undefined ? entries.length : totalEntries, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(centralOffset === undefined ? offset : centralOffset, 16);
  end.writeUInt16LE(commentBuffer.length, 20);

  const tail = [directory];
  if (zip64Locator) {
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, 0);
    tail.push(locator);
  }
  tail.push(end, commentBuffer);

  return toArrayBuffer(Buffer.concat([...body, ...tail]));
}
