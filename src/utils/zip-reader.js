/**
 * A read-only zip reader, small enough to own.
 *
 * An `.xmind` file is a zip holding one or two small text entries beside whatever images and
 * attachments the student put in their map. Reading those two entries needs a central-directory
 * parse and an inflate, and the browser already has the inflate:
 * `DecompressionStream('deflate-raw')`. A zip library would add a dependency, bundle weight and an
 * attack surface for a feature most students use once (ADR 0003), so this module exists instead.
 * It has no writer, creates no files, and never treats an entry name as a path.
 *
 * Two rules keep it honest against files it did not produce:
 *
 *  - **Sizes, offsets, method and flags come from the central directory, never from the local
 *    header.** An archive written as a stream sets general-purpose bit 3 and leaves the local
 *    header's CRC and sizes as zeros, filling them in a data descriptor after the data. Only the
 *    name and extra-field lengths are read locally, because that is the one thing the directory
 *    cannot say. This is also the safer reading: the directory is what the archive itself
 *    considers authoritative.
 *  - **The inflated size is measured while it is being inflated, not afterwards.** A few hundred
 *    kilobytes of zeros expand to a gigabyte, and a reader that decides afterwards has already
 *    lost. Every chunk is counted as it arrives and the stream is cancelled the moment an entry or
 *    the archive passes its cap.
 *
 * Anything this reader is not certain it understands — Zip64, encryption, several disks, a
 * truncated file, an unknown compression method, a checksum that does not match, the same name
 * listed twice — is refused with
 * one sentence a student can act on, rather than a partial read or a stack trace.
 */

/** Largest a single entry may inflate to: 20 MB, when the files we want are a few hundred KB. */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

/** Largest everything this reader inflates from one archive may come to: 50 MB. */
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

/** More entries than any hand-made document has; a directory longer than this is not a document. */
const MAX_ENTRIES = 1024;

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

const END_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;

/** The value a 32-bit field carries when the real one lives in a Zip64 extra field. */
const ZIP64_SENTINEL = 0xffffffff;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8_NAME = 0x0800;

const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;

/** The largest zip comment, and so the furthest back the end record can be. */
const MAX_COMMENT = 0xffff;

/**
 * An error with a code a caller can branch on and a message a student can read, so the import
 * dialog can say "this file is encrypted" without parsing English.
 */
export class ZipError extends Error {
  /**
   * @param {string} code - machine-readable reason, e.g. `ZIP64`.
   * @param {string} message - one sentence naming what is wrong.
   */
  constructor(code, message) {
    super(message);
    this.name = 'ZipError';
    this.code = code;
  }
}

const megabytes = bytes => Math.round(bytes / (1024 * 1024));

let crcTable = null;

/** The standard CRC32 table, built once on first use rather than held as 1 KB of source. */
function tableOf() {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  return crcTable;
}

/**
 * @param {Uint8Array} bytes
 * @returns {number} the CRC32 the zip format stores, as an unsigned 32-bit number.
 */
function crc32(bytes) {
  const table = tableOf();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Decode an entry name. Bit 11 promises UTF-8; without it the bytes are nominally CP437, and
 * reading them as latin1 keeps every ASCII name exact and turns the rest into something visible
 * rather than throwing. A name is only ever a key here, so a wrong accent costs nothing.
 */
function decodeName(bytes, utf8) {
  if (utf8) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

/**
 * Find the end-of-central-directory record, which a trailing comment can push away from the end.
 *
 * The comment is free text, so the record's four signature bytes can turn up inside it, nearer the
 * end of the file than the real record. A candidate is believed only when the comment length it
 * declares runs exactly to the end of the file; one that merely fits is a coincidence in somebody's
 * comment, and taking it would read a good archive as an empty one.
 */
function findEnd(view, length) {
  const earliest = Math.max(0, length - END_SIZE - MAX_COMMENT);
  for (let at = length - END_SIZE; at >= earliest; at -= 1) {
    if (view.getUint32(at, true) !== END_SIGNATURE) {
      continue;
    }
    if (at + END_SIZE + view.getUint16(at + 20, true) === length) {
      return at;
    }
  }
  throw new ZipError(
    'NOT_A_ZIP',
    'This file has no zip directory at its end, so it is either not a zip file or it is truncated.'
  );
}

/** Read the directory headers into plain records, refusing anything structurally beyond us. */
function readDirectory(view, bytes, length, end, maxEntries) {
  if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR_SIGNATURE) {
    throw new ZipError('ZIP64', 'This archive is in the Zip64 format, which AssisT cannot read.');
  }

  const thisDisk = view.getUint16(end + 4, true);
  const directoryDisk = view.getUint16(end + 6, true);
  const onThisDisk = view.getUint16(end + 8, true);
  const total = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryAt = view.getUint32(end + 16, true);

  if (thisDisk !== 0 || directoryDisk !== 0 || onThisDisk !== total) {
    throw new ZipError(
      'MULTI_DISK',
      'This archive is split across several disks, and AssisT can only read a whole archive.'
    );
  }
  if (total === 0xffff || directorySize === ZIP64_SENTINEL || directoryAt === ZIP64_SENTINEL) {
    throw new ZipError('ZIP64', 'This archive is in the Zip64 format, which AssisT cannot read.');
  }
  if (total > maxEntries) {
    throw new ZipError(
      'TOO_MANY_ENTRIES',
      `This archive holds ${total} entries, more than the ${maxEntries} AssisT will open.`
    );
  }
  if (directoryAt + directorySize > length) {
    throw new ZipError(
      'BAD_DIRECTORY',
      'This archive names a directory that lies outside the file, so it cannot be read.'
    );
  }

  const entries = [];
  const names = new Set();
  let at = directoryAt;
  for (let index = 0; index < total; index += 1) {
    if (at + CENTRAL_SIZE > length || view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new ZipError(
        'BAD_DIRECTORY',
        'This archive has a damaged directory, so AssisT cannot list what is inside it.'
      );
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);

    if (at + CENTRAL_SIZE + nameLength > length) {
      throw new ZipError(
        'BAD_DIRECTORY',
        'This archive has a damaged directory, so AssisT cannot list what is inside it.'
      );
    }
    const name = decodeName(
      bytes.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength),
      (flags & FLAG_UTF8_NAME) !== 0
    );

    // Two entries under one name is how an archive shows one file to a scanner and another to
    // the reader that takes the last. There is no right answer, so there is no answer.
    if (names.has(name)) {
      throw new ZipError(
        'DUPLICATE_ENTRY',
        `This archive lists the entry ${name} more than once, so AssisT cannot tell which one to read.`
      );
    }
    names.add(name);

    if (flags & FLAG_ENCRYPTED) {
      throw new ZipError(
        'ENCRYPTED',
        `The entry ${name} is encrypted, and AssisT cannot open an encrypted archive.`
      );
    }
    if (
      compressedSize === ZIP64_SENTINEL ||
      size === ZIP64_SENTINEL ||
      localAt === ZIP64_SENTINEL
    ) {
      throw new ZipError('ZIP64', 'This archive is in the Zip64 format, which AssisT cannot read.');
    }
    if (localAt + LOCAL_SIZE > length) {
      throw new ZipError(
        'TRUNCATED',
        `This archive is truncated: the entry ${name} starts past the end of the file.`
      );
    }

    entries.push({ name, method, crc, compressedSize, size, localAt });
    at += CENTRAL_SIZE + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Where an entry's data starts: only the local name and extra lengths are trusted here. */
function dataStart(view, length, entry) {
  if (view.getUint32(entry.localAt, true) !== LOCAL_SIGNATURE) {
    throw new ZipError(
      'BAD_DIRECTORY',
      `This archive's directory does not match its contents at the entry ${entry.name}.`
    );
  }
  const nameLength = view.getUint16(entry.localAt + 26, true);
  const extraLength = view.getUint16(entry.localAt + 28, true);
  const start = entry.localAt + LOCAL_SIZE + nameLength + extraLength;
  if (start + entry.compressedSize > length) {
    throw new ZipError(
      'TRUNCATED',
      `This archive is truncated: the entry ${entry.name} runs past the end of the file.`
    );
  }
  return start;
}

const tooLarge = (name, cap) =>
  new ZipError(
    'ENTRY_TOO_LARGE',
    `The entry ${name} unpacks to more than ${megabytes(cap) || 1} MB, which is more than AssisT will open.`
  );

const archiveTooLarge = cap =>
  new ZipError(
    'ARCHIVE_TOO_LARGE',
    `This archive unpacks to more than ${megabytes(cap) || 1} MB in total, which is more than AssisT will open.`
  );

/**
 * Inflate one deflated entry, counting the output as it arrives so a zip bomb is stopped at the
 * cap rather than after it.
 */
async function inflate(compressed, entry, limits) {
  const { Decompressor, entryCap, archiveCap, spent } = limits;
  if (typeof Decompressor !== 'function') {
    throw new ZipError(
      'NO_INFLATE',
      'This browser cannot unpack compressed zip entries, so AssisT cannot open this file.'
    );
  }

  const stream = new Decompressor('deflate-raw');
  const writer = stream.writable.getWriter();
  // The write is not awaited: a large entry would otherwise sit in backpressure waiting for a
  // reader that has not started. A failure here surfaces when the reader rejects.
  const written = writer.write(compressed).then(() => writer.close());
  written.catch(() => {});

  const reader = stream.readable.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > entryCap) {
        await reader.cancel();
        throw tooLarge(entry.name, entryCap);
      }
      if (spent + size > archiveCap) {
        await reader.cancel();
        throw archiveTooLarge(archiveCap);
      }
      parts.push(value);
    }
  } catch (error) {
    if (error instanceof ZipError) {
      throw error;
    }
    throw new ZipError(
      'CORRUPT_ENTRY',
      `The entry ${entry.name} is damaged and could not be unpacked.`
    );
  }

  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/**
 * Read a zip archive.
 *
 * Every entry the filter admits is unpacked during this call, so the archive returned answers
 * synchronously and the caps are accounted for in one place. Entry names are keys and nothing
 * else: no path is resolved, nothing is written, and `../` in a name is simply part of the key.
 *
 * @param {ArrayBuffer|ArrayBufferView} input - the whole file.
 * @param {Object} [options]
 * @param {(name: string) => boolean} [options.include] - which entries to unpack; the default
 *   unpacks everything, and a caller that wants two small files should say so rather than pay for
 *   an embedded video.
 * @param {number} [options.maxEntryBytes=MAX_ENTRY_BYTES] - cap on one entry's unpacked size.
 * @param {number} [options.maxTotalBytes=MAX_TOTAL_BYTES] - cap on everything unpacked together.
 * @param {number} [options.maxEntries=MAX_ENTRIES] - cap on how many entries the directory lists.
 * @param {Function} [options.decompressionStream] - the inflater, defaulting to the platform's
 *   `DecompressionStream`. Tests supply Node's, which jsdom does not expose.
 * @returns {Promise<{names: string[], has: (name: string) => boolean,
 *   bytes: (name: string) => Uint8Array|null, text: (name: string) => string|null}>} `names` lists
 *   every entry in the archive in directory order; `bytes` and `text` answer for the ones that
 *   were unpacked and give null for a directory, a filtered-out entry or a name that is not there.
 * @throws {ZipError} NOT_A_ZIP, BAD_DIRECTORY, TRUNCATED, ZIP64, ENCRYPTED, MULTI_DISK,
 *   DUPLICATE_ENTRY, UNSUPPORTED_METHOD, CORRUPT_ENTRY, NO_INFLATE, TOO_MANY_ENTRIES,
 *   ENTRY_TOO_LARGE or ARCHIVE_TOO_LARGE — each with one sentence naming what is wrong.
 */
export async function readZip(input, options = {}) {
  const {
    include = () => true,
    maxEntryBytes = MAX_ENTRY_BYTES,
    maxTotalBytes = MAX_TOTAL_BYTES,
    maxEntries = MAX_ENTRIES,
    decompressionStream = globalThis.DecompressionStream,
  } = options;

  // `instanceof` is avoided: a buffer read by a file input and one handed over by a test runner
  // can come from different realms, and the brand check is the one that holds in both.
  const view = ArrayBuffer.isView(input);
  if (!view && Object.prototype.toString.call(input) !== '[object ArrayBuffer]') {
    throw new ZipError('NOT_A_ZIP', 'AssisT was given something that is not a file to open.');
  }
  const bytes = view
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input);
  const length = bytes.length;
  if (length < END_SIZE) {
    throw new ZipError(
      'NOT_A_ZIP',
      'This file has no zip directory at its end, so it is either not a zip file or it is truncated.'
    );
  }

  const data = new DataView(bytes.buffer, bytes.byteOffset, length);
  const entries = readDirectory(data, bytes, length, findEnd(data, length), maxEntries);

  const contents = new Map();
  let spent = 0;

  for (const entry of entries) {
    if (entry.name.endsWith('/') || !include(entry.name)) {
      continue;
    }
    if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATED) {
      throw new ZipError(
        'UNSUPPORTED_METHOD',
        `The entry ${entry.name} uses compression method ${entry.method}, and AssisT reads only stored and deflated entries.`
      );
    }
    if (entry.size > maxEntryBytes) {
      throw tooLarge(entry.name, maxEntryBytes);
    }
    if (spent + entry.size > maxTotalBytes) {
      throw archiveTooLarge(maxTotalBytes);
    }

    const start = dataStart(data, length, entry);
    const compressed = bytes.subarray(start, start + entry.compressedSize);
    const unpacked =
      entry.method === METHOD_STORED
        ? compressed.slice()
        : await inflate(compressed, entry, {
            Decompressor: decompressionStream,
            entryCap: maxEntryBytes,
            archiveCap: maxTotalBytes,
            spent,
          });

    if (crc32(unpacked) !== entry.crc) {
      throw new ZipError(
        'CORRUPT_ENTRY',
        `The entry ${entry.name} does not match the checksum stored with it, so this archive is damaged.`
      );
    }

    spent += unpacked.length;
    contents.set(entry.name, unpacked);
  }

  return Object.freeze({
    names: entries.map(entry => entry.name),
    has: name => contents.has(name),
    bytes: name => contents.get(name) || null,
    text: name => (contents.has(name) ? new TextDecoder('utf-8').decode(contents.get(name)) : null),
  });
}
