/**
 * The zip reader is fed files a student picked off their own disk, so the suite is written the way
 * an attacker would write it: every archive here is assembled byte by byte by `buildZip`, including
 * the malformed ones a library would never produce.
 */

import {
  DecompressionStream as NodeDecompressionStream,
  ReadableStream,
  WritableStream,
} from 'node:stream/web';
import { ZipError, readZip } from '../../../src/utils/zip-reader.js';
import { buildZip, toArrayBuffer } from './zip-fixtures.js';

/** Every call goes through Node's implementation, because jsdom hides the platform one. */
const read = (buffer, options = {}) =>
  readZip(buffer, { decompressionStream: NodeDecompressionStream, ...options });

/**
 * A stand-in inflater that would hand over a kilobyte at a time for ever, recording each pull. A
 * reader that measured the output only once the stream had finished would hang here.
 */
function endlessInflater(pulls) {
  return class {
    constructor() {
      this.writable = new WritableStream();
      this.readable = new ReadableStream({
        pull(controller) {
          pulls.push(pulls.length + 1);
          controller.enqueue(new Uint8Array(1024));
        },
      });
    }
  };
}

/** The ZipError a call throws, or null when it does not throw. */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ZipError);
    expect(error.message).toMatch(/^[A-Z].*\.$/s);
    return error;
  }
  return null;
}

describe('readZip — reading', () => {
  it('reads a stored entry as bytes and as UTF-8 text', async () => {
    const archive = await read(buildZip([{ name: 'hello.txt', data: 'Grüße, Welt' }]));
    expect(archive.names).toEqual(['hello.txt']);
    expect(archive.has('hello.txt')).toBe(true);
    expect(archive.text('hello.txt')).toBe('Grüße, Welt');
    expect(Array.from(archive.bytes('hello.txt'))).toEqual(
      Array.from(Buffer.from('Grüße, Welt', 'utf8'))
    );
  });

  it('inflates a deflated entry', async () => {
    const data = 'sheet '.repeat(400);
    const archive = await read(buildZip([{ name: 'content.json', data, method: 8 }]));
    expect(archive.text('content.json')).toBe(data);
  });

  it('reads a stored entry without any inflater at all', async () => {
    const archive = await readZip(buildZip([{ name: 'a.txt', data: 'plain' }]), {
      decompressionStream: null,
    });
    expect(archive.text('a.txt')).toBe('plain');
  });

  it('uses the platform DecompressionStream when the caller supplies none', async () => {
    const before = globalThis.DecompressionStream;
    globalThis.DecompressionStream = NodeDecompressionStream;
    try {
      const archive = await readZip(buildZip([{ name: 'z', data: 'ab'.repeat(200), method: 8 }]));
      expect(archive.text('z')).toBe('ab'.repeat(200));
    } finally {
      globalThis.DecompressionStream = before;
    }
  });

  it('lists names in central-directory order and reports nothing for a directory entry', async () => {
    const archive = await read(
      buildZip([
        { name: 'META-INF/', data: '' },
        { name: 'content.json', data: '[]' },
        { name: 'metadata.json', data: '{}' },
      ])
    );
    expect(archive.names).toEqual(['META-INF/', 'content.json', 'metadata.json']);
    expect(archive.has('META-INF/')).toBe(false);
    expect(archive.bytes('META-INF/')).toBeNull();
    expect(archive.text('missing.json')).toBeNull();
  });

  it('takes the sizes from the central directory when the local header carries zeros', async () => {
    const data = 'descriptor '.repeat(50);
    const archive = await read(
      buildZip([{ name: 'content.xml', data, method: 8, dataDescriptor: true }])
    );
    expect(archive.text('content.xml')).toBe(data);
  });

  it('decodes a UTF-8 name when the flag says so, and a legacy name without throwing', async () => {
    const archive = await read(
      buildZip([
        { name: 'résumé.txt', data: 'a' },
        { name: 'legacy', nameBytes: Buffer.from('caf\xe9.txt', 'latin1'), utf8: false, data: 'b' },
      ])
    );
    expect(archive.names).toEqual(['résumé.txt', 'café.txt']);
    expect(archive.text('café.txt')).toBe('b');
  });

  it('finds the directory when a comment follows the end record', async () => {
    const archive = await read(
      buildZip([{ name: 'a.txt', data: 'x' }], {
        comment: 'made by a zipper that talks '.repeat(9),
      })
    );
    expect(archive.text('a.txt')).toBe('x');
  });

  it('is not fooled by an end-of-directory signature inside the comment', async () => {
    // 50 4B 05 06, then eighteen zero bytes: a complete, empty end record, sitting in the comment
    // nearer the end of the file than the real one.
    const decoy = `PK\u0005\u0006${'\u0000'.repeat(18)}`;
    for (const comment of [
      `${decoy}tail`,
      `before ${decoy} after`,
      `PK\u0005\u0006${'A'.repeat(40)}`,
    ]) {
      const archive = await read(buildZip([{ name: 'a.txt', data: 'x' }], { comment }));
      expect(archive.names).toEqual(['a.txt']);
      expect(archive.text('a.txt')).toBe('x');
    }
  });

  it('inflates only the entries the filter includes, but still lists them all', async () => {
    const archive = await read(
      buildZip([
        { name: 'content.json', data: '[1]', method: 8 },
        { name: 'attachments/huge.bin', data: 'x'.repeat(5000), method: 8 },
      ]),
      { include: name => name === 'content.json' }
    );
    expect(archive.names).toEqual(['content.json', 'attachments/huge.bin']);
    expect(archive.text('content.json')).toBe('[1]');
    expect(archive.has('attachments/huge.bin')).toBe(false);
    expect(archive.bytes('attachments/huge.bin')).toBeNull();
  });

  it('treats a name as a key and never as a path', async () => {
    const archive = await read(buildZip([{ name: '../../etc/passwd', data: 'nope' }]));
    expect(archive.names).toEqual(['../../etc/passwd']);
    expect(archive.text('../../etc/passwd')).toBe('nope');
    expect(archive.text('etc/passwd')).toBeNull();
  });

  it('does not answer for inherited object keys', async () => {
    const archive = await read(buildZip([{ name: 'a.txt', data: 'x' }]));
    expect(archive.has('toString')).toBe(false);
    expect(archive.bytes('constructor')).toBeNull();
  });
});

describe('readZip — refusals', () => {
  it('refuses a file with no end-of-directory record', async () => {
    const whole = Buffer.from(buildZip([{ name: 'a.txt', data: 'x' }]));
    const error = await refusal(() => read(toArrayBuffer(whole.subarray(0, whole.length - 8))));
    expect(error.code).toBe('NOT_A_ZIP');
    expect(error.message).toMatch(/zip/i);
  });

  it('refuses an archive whose entry data lies past the end of the file', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'a.txt', data: 'x', localOffset: 900000 }]))
    );
    expect(error.code).toBe('TRUNCATED');
  });

  it('refuses a central directory that points outside the buffer', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'a.txt', data: 'x' }], { centralOffset: 900000 }))
    );
    expect(error.code).toBe('BAD_DIRECTORY');
  });

  it('refuses a Zip64 size sentinel', async () => {
    const error = await refusal(() => read(buildZip([{ name: 'a.txt', data: 'x', zip64: true }])));
    expect(error.code).toBe('ZIP64');
    expect(error.message).toMatch(/Zip64/);
  });

  it('refuses a Zip64 end-of-directory locator', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'a.txt', data: 'x' }], { zip64Locator: true }))
    );
    expect(error.code).toBe('ZIP64');
  });

  it('refuses an encrypted entry', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'secret.json', data: 'x', encrypted: true }]))
    );
    expect(error.code).toBe('ENCRYPTED');
    expect(error.message).toContain('secret.json');
  });

  it('refuses a multi-disk archive', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'a.txt', data: 'x' }], { diskNumber: 2 }))
    );
    expect(error.code).toBe('MULTI_DISK');
  });

  it('refuses an unsupported compression method', async () => {
    const error = await refusal(() => read(buildZip([{ name: 'a.txt', data: 'x', method: 12 }])));
    expect(error.code).toBe('UNSUPPORTED_METHOD');
    expect(error.message).toContain('a.txt');
  });

  it('refuses an entry whose contents do not match its checksum', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'content.json', data: 'hello', method: 8, crc: 1 }]))
    );
    expect(error.code).toBe('CORRUPT_ENTRY');
    expect(error.message).toContain('content.json');
  });

  it('refuses a stored entry whose contents do not match its checksum', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'content.json', data: 'hello', crc: 1 }]))
    );
    expect(error.code).toBe('CORRUPT_ENTRY');
  });

  it('refuses an entry that inflates past the per-entry cap', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'bomb.bin', data: 'a'.repeat(200000), method: 8 }]), {
        maxEntryBytes: 1024,
      })
    );
    expect(error.code).toBe('ENTRY_TOO_LARGE');
    expect(error.message).toContain('bomb.bin');
  });

  it('refuses an archive that inflates past the total cap', async () => {
    const error = await refusal(() =>
      read(
        buildZip([
          { name: 'one.bin', data: 'a'.repeat(4000), method: 8 },
          { name: 'two.bin', data: 'b'.repeat(4000), method: 8 },
        ]),
        { maxEntryBytes: 5000, maxTotalBytes: 6000 }
      )
    );
    expect(error.code).toBe('ARCHIVE_TOO_LARGE');
  });

  it('stops the inflate at the cap instead of after it', async () => {
    const pulls = [];
    const error = await refusal(() =>
      readZip(buildZip([{ name: 'bomb.bin', data: 'a'.repeat(64), method: 8 }]), {
        decompressionStream: endlessInflater(pulls),
        maxEntryBytes: 4096,
      })
    );
    expect(error.code).toBe('ENTRY_TOO_LARGE');
    // The stub would hand over a gigabyte if asked; the cap is four kilobytes, so only a handful
    // of chunks may ever be pulled. Reading first and measuring afterwards would never finish.
    expect(pulls.length).toBeLessThan(32);
    expect(pulls.length).toBeGreaterThan(0);
  });

  it('refuses a stored entry that is larger than the per-entry cap', async () => {
    const error = await refusal(() =>
      read(buildZip([{ name: 'big.bin', data: 'a'.repeat(5000) }]), { maxEntryBytes: 1024 })
    );
    expect(error.code).toBe('ENTRY_TOO_LARGE');
  });

  it('refuses an archive holding more entries than the cap allows', async () => {
    const entries = Array.from({ length: 12 }, (_unused, index) => ({
      name: `f${index}.txt`,
      data: 'x',
    }));
    const error = await refusal(() => read(buildZip(entries), { maxEntries: 8 }));
    expect(error.code).toBe('TOO_MANY_ENTRIES');
  });

  it('refuses a deflated entry when the platform cannot inflate', async () => {
    const error = await refusal(() =>
      readZip(buildZip([{ name: 'a.txt', data: 'compressed', method: 8 }]), {
        decompressionStream: null,
      })
    );
    expect(error.code).toBe('NO_INFLATE');
  });

  it('refuses a central directory whose headers do not start with the right signature', async () => {
    const whole = Buffer.from(buildZip([{ name: 'a.txt', data: 'x' }]));
    const directoryStart = whole.length - 22 - 46 - 'a.txt'.length;
    whole.writeUInt32LE(0x01020304, directoryStart);
    const error = await refusal(() => read(toArrayBuffer(whole)));
    expect(error.code).toBe('BAD_DIRECTORY');
  });

  it('refuses something that is not a zip at all', async () => {
    const error = await refusal(() =>
      read(toArrayBuffer(Buffer.from('this is a plain text file')))
    );
    expect(error.code).toBe('NOT_A_ZIP');
  });
});

describe('readZip — caps', () => {
  const MB = 1024 * 1024;
  // Stored, so the test spends its time on the reader rather than on deflating test data.
  const zeros = size => ({ data: Buffer.alloc(size) });
  const SLOW = 30000;

  it(
    'opens an entry of exactly 20 MB by default, and refuses one byte more',
    async () => {
      const archive = await read(buildZip([{ name: 'a.bin', ...zeros(20 * MB) }]));
      expect(archive.bytes('a.bin')).toHaveLength(20 * MB);

      const error = await refusal(() => read(buildZip([{ name: 'a.bin', ...zeros(20 * MB + 1) }])));
      expect(error.code).toBe('ENTRY_TOO_LARGE');
      expect(error.message).toBe(
        'The entry a.bin unpacks to more than 20 MB, which is more than AssisT will open.'
      );
    },
    SLOW
  );

  it(
    'opens 50 MB in total by default, and refuses one byte more',
    async () => {
      const parts = last => [
        { name: 'a.bin', ...zeros(20 * MB) },
        { name: 'b.bin', ...zeros(20 * MB) },
        { name: 'c.bin', ...zeros(last) },
      ];
      const archive = await read(buildZip(parts(10 * MB)));
      expect(archive.bytes('c.bin')).toHaveLength(10 * MB);

      const error = await refusal(() => read(buildZip(parts(10 * MB + 1))));
      expect(error.code).toBe('ARCHIVE_TOO_LARGE');
      expect(error.message).toBe(
        'This archive unpacks to more than 50 MB in total, which is more than AssisT will open.'
      );
    },
    SLOW
  );

  it('lists 1,024 entries by default, and refuses one more', async () => {
    const entries = length =>
      Array.from({ length }, (_unused, index) => ({ name: `f${index}`, data: '' }));
    const archive = await read(buildZip(entries(1024)));
    expect(archive.names).toHaveLength(1024);

    const error = await refusal(() => read(buildZip(entries(1025))));
    expect(error.code).toBe('TOO_MANY_ENTRIES');
    expect(error.message).toBe(
      'This archive holds 1025 entries, more than the 1024 AssisT will open.'
    );
  });

  it('refuses an archive that lists the same name twice, rather than answering with the last', async () => {
    const error = await refusal(() =>
      read(
        buildZip([
          { name: 'content.json', data: 'first' },
          { name: 'other.txt', data: 'x' },
          { name: 'content.json', data: 'second' },
        ])
      )
    );
    expect(error.code).toBe('DUPLICATE_ENTRY');
    expect(error.message).toBe(
      'This archive lists the entry content.json more than once, so AssisT cannot tell which one to read.'
    );
  });

  it('refuses a duplicate name even when the filter would have skipped it', async () => {
    const error = await refusal(() =>
      read(
        buildZip([
          { name: 'a.bin', data: '1' },
          { name: 'a.bin', data: '2' },
        ]),
        { include: name => name === 'content.json' }
      )
    );
    expect(error.code).toBe('DUPLICATE_ENTRY');
  });

  it('accepts an entry that sits exactly on the cap', async () => {
    const archive = await read(buildZip([{ name: 'a.bin', data: 'a'.repeat(1024), method: 8 }]), {
      maxEntryBytes: 1024,
      maxTotalBytes: 1024,
    });
    expect(archive.bytes('a.bin')).toHaveLength(1024);
  });
});
