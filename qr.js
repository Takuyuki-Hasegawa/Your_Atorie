(function (root) {
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  const ECC = {
    1: [16, 10, 1, 16],
    2: [28, 16, 1, 28],
    3: [44, 26, 1, 44],
    4: [64, 18, 2, 32],
    5: [86, 24, 2, 43],
    6: [108, 16, 4, 27],
    7: [124, 18, 4, 31],
    8: [154, 22, 2, 38, 2, 39],
    9: [182, 22, 3, 36, 2, 37],
    10: [216, 26, 4, 43, 1, 44]
  };

  const ALIGN = {
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50]
  };

  const remainderBits = version => (version >= 2 && version <= 6 ? 7 : 0);

  function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i += 1) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j += 1) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, degree) {
    const gen = rsGenerator(degree);
    const buf = data.concat(new Array(degree).fill(0));
    for (let i = 0; i < data.length; i += 1) {
      const coef = buf[i];
      if (!coef) continue;
      for (let j = 0; j < gen.length; j += 1) buf[i + j] ^= mul(gen[j], coef);
    }
    return buf.slice(data.length);
  }

  function bitsToBytes(bits) {
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] || 0);
      bytes.push(value);
    }
    return bytes;
  }

  function encodeBytes(text, version) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const [dataCount] = ECC[version];
    const lengthBits = version >= 10 ? 16 : 8;
    const bits = [];
    const push = (value, width) => {
      for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
    };
    push(0b0100, 4);
    push(bytes.length, lengthBits);
    bytes.forEach(byte => push(byte, 8));
    const capacity = dataCount * 8;
    const rest = capacity - bits.length;
    if (rest < 0) return null;
    push(0, Math.min(4, rest));
    while (bits.length % 8) bits.push(0);
    const data = bitsToBytes(bits);
    const pads = [0xec, 0x11];
    while (data.length < dataCount) data.push(pads[data.length % 2]);
    return data;
  }

  function pickVersion(text) {
    for (let version = 1; version <= 10; version += 1) {
      if (encodeBytes(text, version)) return version;
    }
    return 0;
  }

  function blocksFor(data, version) {
    const spec = ECC[version];
    const ecCount = spec[1];
    const groups = [];
    for (let i = 2; i < spec.length; i += 2) groups.push([spec[i], spec[i + 1]]);
    const blocks = [];
    let offset = 0;
    groups.forEach(([count, dataPerBlock]) => {
      for (let i = 0; i < count; i += 1) {
        const block = data.slice(offset, offset + dataPerBlock);
        offset += dataPerBlock;
        blocks.push({ data: block, ec: rsRemainder(block, ecCount) });
      }
    });
    const interleaved = [];
    const maxData = Math.max(...blocks.map(block => block.data.length));
    for (let i = 0; i < maxData; i += 1) {
      blocks.forEach(block => {
        if (i < block.data.length) interleaved.push(block.data[i]);
      });
    }
    const maxEc = blocks[0].ec.length;
    for (let i = 0; i < maxEc; i += 1) {
      blocks.forEach(block => interleaved.push(block.ec[i]));
    }
    const bits = [];
    interleaved.forEach(byte => {
      for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
    });
    for (let i = 0; i < remainderBits(version); i += 1) bits.push(0);
    return bits;
  }

  function empty(size, fill = 0) {
    return Array.from({ length: size }, () => new Array(size).fill(fill));
  }

  function fillRect(grid, r, c, h, w, value) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) grid[r + y][c + x] = value;
    }
  }

  function finder(matrix, reserved, row, col) {
    fillRect(reserved, row, col, 7, 7, 1);
    fillRect(matrix, row, col, 7, 7, 1);
    fillRect(matrix, row + 1, col + 1, 5, 5, 0);
    fillRect(matrix, row + 2, col + 2, 3, 3, 1);
  }

  function alignment(matrix, reserved, row, col) {
    fillRect(reserved, row - 2, col - 2, 5, 5, 1);
    fillRect(matrix, row - 2, col - 2, 5, 5, 1);
    fillRect(matrix, row - 1, col - 1, 3, 3, 0);
    matrix[row][col] = 1;
  }

  function placeFunction(matrix, reserved, version) {
    const size = matrix.length;
    finder(matrix, reserved, 0, 0);
    finder(matrix, reserved, 0, size - 7);
    finder(matrix, reserved, size - 7, 0);
    fillRect(reserved, 7, 0, 1, 8, 1);
    fillRect(reserved, 0, 7, 8, 1, 1);
    fillRect(reserved, 7, size - 8, 1, 8, 1);
    fillRect(reserved, 0, size - 8, 8, 1, 1);
    fillRect(reserved, size - 8, 0, 1, 8, 1);
    fillRect(reserved, size - 8, 7, 8, 1, 1);
    for (let i = 8; i < size - 8; i += 1) {
      reserved[6][i] = 1;
      reserved[i][6] = 1;
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
    }
    reserved[8][8] = 1;
    const positions = ALIGN[version] || [];
    positions.forEach(r => {
      positions.forEach(c => {
        if (reserved[r][c]) return;
        alignment(matrix, reserved, r, c);
      });
    });
    reserved[8][size - 8] = 1;
    matrix[8][size - 8] = 1;
    for (let i = 0; i < 8; i += 1) {
      reserved[8][i] = 1;
      reserved[i][8] = 1;
      reserved[8][size - 1 - i] = 1;
      reserved[size - 1 - i][8] = 1;
    }
    reserved[8][7] = 1;
    reserved[7][8] = 1;
    if (version >= 7) {
      for (let i = 0; i < 6; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          reserved[i][size - 11 + j] = 1;
          reserved[size - 11 + j][i] = 1;
        }
      }
    }
  }

  function masked(row, col, mask) {
    switch (mask) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return (row * col) % 2 + (row * col) % 3 === 0;
      case 6: return ((row * col) % 2 + (row * col) % 3) % 2 === 0;
      default: return ((row + col) % 2 + (row * col) % 3) % 2 === 0;
    }
  }

  function placeData(matrix, reserved, bits, mask) {
    const size = matrix.length;
    let bit = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      for (let i = 0; i < size; i += 1) {
        const row = upward ? size - 1 - i : i;
        for (let k = 0; k < 2; k += 1) {
          const c = col - k;
          if (reserved[row][c]) continue;
          let value = bits[bit] || 0;
          bit += 1;
          if (masked(row, c, mask)) value ^= 1;
          matrix[row][c] = value;
        }
      }
      upward = !upward;
    }
  }

  function formatBits(mask) {
    const data = mask;
    let rem = data << 10;
    for (let i = 14; i >= 10; i -= 1) {
      if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  function versionBits(version) {
    let rem = version << 12;
    for (let i = 17; i >= 12; i -= 1) {
      if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
    }
    return (version << 12) | rem;
  }

  function bitAt(value, index) {
    return (value >> index) & 1;
  }

  function drawFormat(matrix, mask) {
    const size = matrix.length;
    const bits = formatBits(mask);
    const set = (r, c, index) => {
      matrix[r][c] = bitAt(bits, index);
    };
    for (let i = 0; i <= 5; i += 1) set(8, i, i);
    set(8, 7, 6);
    set(8, 8, 7);
    set(7, 8, 8);
    for (let i = 9; i <= 14; i += 1) set(14 - i, 8, i);
    for (let i = 0; i <= 7; i += 1) set(size - 1 - i, 8, i);
    for (let i = 8; i <= 14; i += 1) set(8, size - 15 + i, i);
    matrix[8][size - 8] = 1;
  }

  function drawVersion(matrix, version) {
    if (version < 7) return;
    const size = matrix.length;
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = bitAt(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      matrix[a][b] = bit;
      matrix[b][a] = bit;
    }
  }

  function penalty(matrix) {
    const size = matrix.length;
    let score = 0;
    const runScore = line => {
      let run = 1;
      for (let i = 1; i <= line.length; i += 1) {
        if (i < line.length && line[i] === line[i - 1]) {
          run += 1;
          continue;
        }
        if (run >= 5) score += run - 2;
        run = 1;
      }
    };
    for (let r = 0; r < size; r += 1) {
      runScore(matrix[r]);
      const col = matrix.map(row => row[r]);
      runScore(col);
    }
    for (let r = 0; r < size - 1; r += 1) {
      for (let c = 0; c < size - 1; c += 1) {
        const v = matrix[r][c];
        if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) score += 3;
      }
    }
    const finder = [1, 0, 1, 1, 1, 0, 1];
    const hasFinder = line => {
      for (let i = 0; i <= line.length - 11; i += 1) {
        const left = line.slice(i, i + 4).every(v => v === 0) && finder.every((v, j) => line[i + 4 + j] === v);
        const right = finder.every((v, j) => line[i + j] === v) && line.slice(i + 7, i + 11).every(v => v === 0);
        if (left || right) score += 40;
      }
    };
    for (let r = 0; r < size; r += 1) {
      hasFinder(matrix[r]);
      hasFinder(matrix.map(row => row[r]));
    }
    let dark = 0;
    matrix.forEach(row => row.forEach(cell => {
      dark += cell;
    }));
    const percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function build(text) {
    const version = pickVersion(text);
    if (!version) throw new Error('too long');
    const size = version * 4 + 17;
    const data = encodeBytes(text, version);
    const bits = blocksFor(data, version);
    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
      const matrix = empty(size, 0);
      const reserved = empty(size, 0);
      placeFunction(matrix, reserved, version);
      placeData(matrix, reserved, bits, mask);
      drawFormat(matrix, mask);
      drawVersion(matrix, version);
      const score = penalty(matrix);
      if (score < bestScore) {
        bestScore = score;
        best = matrix;
      }
    }
    return best;
  }

  function qrSvg(text) {
    const matrix = build(String(text));
    const quiet = 4;
    const dim = matrix.length + quiet * 2;
    let d = '';
    matrix.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" aria-hidden="true"><rect width="100%" height="100%" fill="#fff"/><path fill="#111" d="${d}"/></svg>`;
  }

  root.qrSvg = qrSvg;
  if (typeof module !== 'undefined' && module.exports) module.exports = { qrSvg };
}(typeof globalThis !== 'undefined' ? globalThis : this));
