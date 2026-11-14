/**
 * Zero-dependency ISO/IEC 18004 QR Code encoder & accessible SVG renderer.
 * Supports UTF-8 Byte mode across Versions 1–10 (Error Correction Level M).
 */

// Version 1..10 parameters for Error Correction Level M:
// [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
const VERSION_PARAMS_M = [
  null,
  [26, 10, 1, 16, 0, 0],
  [44, 16, 1, 28, 0, 0],
  [70, 26, 1, 44, 0, 0],
  [100, 18, 2, 32, 0, 0],
  [134, 24, 2, 43, 0, 0],
  [172, 16, 4, 27, 0, 0],
  [196, 18, 4, 31, 0, 0],
  [242, 22, 2, 38, 2, 39],
  [292, 22, 3, 36, 2, 37],
  [346, 26, 4, 43, 1, 44],
];

const ALIGNMENT_COORDS = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

// Precompute GF(256) log/exp tables with primitive polynomial 0x11D
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data, ecLen) {
  const gen = buildGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function appendBits(bitBuffer, value, bitLength) {
  for (let i = bitLength - 1; i >= 0; i--) {
    bitBuffer.push((value >>> i) & 1);
  }
}

function selectVersion(byteLength) {
  for (let v = 1; v <= 10; v++) {
    const [, , g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_PARAMS_M[v];
    const totalDataCodewords = g1Blocks * g1Data + g2Blocks * g2Data;
    const countBits = v <= 9 ? 8 : 16;
    const neededBits = 4 + countBits + byteLength * 8;
    if (neededBits <= totalDataCodewords * 8) {
      return v;
    }
  }
  throw new RangeError("QR payload exceeds Version 10-M capacity");
}

function encodeCodewords(bytes, version) {
  const [, ecLen, g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_PARAMS_M[version];
  const totalDataCodewords = g1Blocks * g1Data + g2Blocks * g2Data;
  const capacityBits = totalDataCodewords * 8;

  const bits = [];
  appendBits(bits, 0b0100, 4); // Byte mode
  appendBits(bits, bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  // Terminator (up to 4 zero bits)
  const terminatorLen = Math.min(4, capacityBits - bits.length);
  appendBits(bits, 0, terminatorLen);

  // Byte-align with zero bits
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | bits[i * 8 + b];
    }
    dataCodewords[i] = val;
  }

  // Pad alternating 0xEC, 0x11
  let padToggle = 0;
  for (let i = bits.length / 8; i < totalDataCodewords; i++) {
    dataCodewords[i] = padToggle === 0 ? 0xec : 0x11;
    padToggle ^= 1;
  }

  // Split into blocks & compute EC per block
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  for (let i = 0; i < g1Blocks; i++) {
    const block = dataCodewords.subarray(offset, offset + g1Data);
    offset += g1Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, ecLen));
  }
  for (let i = 0; i < g2Blocks; i++) {
    const block = dataCodewords.subarray(offset, offset + g2Data);
    offset += g2Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, ecLen));
  }

  // Interleave data codewords, then EC codewords
  const interleaved = [];
  const maxDataLen = Math.max(g1Data, g2Data);
  for (let col = 0; col < maxDataLen; col++) {
    for (const block of dataBlocks) {
      if (col < block.length) {
        interleaved.push(block[col]);
      }
    }
  }
  for (let col = 0; col < ecLen; col++) {
    for (const block of ecBlocks) {
      interleaved.push(block[col]);
    }
  }

  return interleaved;
}

function drawFinderPattern(modules, isFunction, size, top, left) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const r = top + dr;
      const c = left + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) {
        continue;
      }
      const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const onOuterRing = dr === 0 || dr === 6 || dc === 0 || dc === 6;
      const inInnerSquare = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      modules[r][c] = inOuter && (onOuterRing || inInnerSquare);
      isFunction[r][c] = true;
    }
  }
}

function drawAlignmentPattern(modules, isFunction, centerR, centerC) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      modules[centerR + dr][centerC + dc] = dist !== 1;
      isFunction[centerR + dr][centerC + dc] = true;
    }
  }
}

function drawFormatBits(modules, isFunction, size, mask) {
  // EC Level M indicator = 0b00
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  const getBit = (i) => ((bits >>> i) & 1) !== 0;

  // First copy around top-left finder
  for (let i = 0; i <= 5; i++) {
    modules[i][8] = getBit(i);
    isFunction[i][8] = true;
  }
  modules[7][8] = getBit(6);
  isFunction[7][8] = true;
  modules[8][8] = getBit(7);
  isFunction[8][8] = true;
  modules[8][7] = getBit(8);
  isFunction[8][7] = true;
  for (let i = 9; i < 15; i++) {
    modules[8][14 - i] = getBit(i);
    isFunction[8][14 - i] = true;
  }

  // Second copy split across top-right & bottom-left
  for (let i = 0; i < 8; i++) {
    modules[8][size - 1 - i] = getBit(i);
    isFunction[8][size - 1 - i] = true;
  }
  for (let i = 8; i < 15; i++) {
    modules[size - 15 + i][8] = getBit(i);
    isFunction[size - 15 + i][8] = true;
  }

  // Dark module
  modules[size - 8][8] = true;
  isFunction[size - 8][8] = true;
}

function drawVersionBits(modules, isFunction, size, version) {
  if (version < 7) {
    return;
  }
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[a][b] = bit;
    isFunction[a][b] = true;
    modules[b][a] = bit;
    isFunction[b][a] = true;
  }
}

function shouldInvertModule(mask, r, c) {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function computePenaltyScore(modules, size) {
  let score = 0;

  // Rule 1: Adjacent runs >= 5 in rows and columns
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of identical modules
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = modules[r][c];
      if (
        val === modules[r][c + 1] &&
        val === modules[r + 1][c] &&
        val === modules[r + 1][c + 1]
      ) {
        score += 3;
      }
    }
  }

  // Rule 3: Finder-like 1:1:3:1:1 patterns bounded by 4 light modules
  const matchesFinderLike = (line, idx) => {
    const pattern = [true, false, true, true, true, false, true];
    for (let k = 0; k < 7; k++) {
      if (line[idx + k] !== pattern[k]) return false;
    }
    const leftClear =
      idx >= 4 && !line[idx - 1] && !line[idx - 2] && !line[idx - 3] && !line[idx - 4];
    const rightClear =
      idx + 10 < line.length &&
      !line[idx + 7] &&
      !line[idx + 8] &&
      !line[idx + 9] &&
      !line[idx + 10];
    return leftClear || rightClear;
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 7; c++) {
      if (matchesFinderLike(modules[r], c)) score += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    const colLine = Array.from({ length: size }, (_, r) => modules[r][c]);
    for (let r = 0; r <= size - 7; r++) {
      if (matchesFinderLike(colLine, r)) score += 40;
    }
  }

  // Rule 4: Balance of dark and light modules
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) darkCount++;
    }
  }
  const total = size * size;
  const k = Math.ceil((Math.abs(darkCount * 20 - total * 10) + total - 1) / (2 * total)) - 1;
  score += Math.max(0, k) * 10;

  return score;
}

/**
 * Encodes a UTF-8 string into a boolean 2D QR module matrix (`true` = dark).
 *
 * @param {string} text
 * @returns {{ size: number, version: number, modules: boolean[][] }}
 */
export function encodeQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text));
  const version = selectVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = encodeCodewords(bytes, version);

  const baseModules = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

  // Timing patterns
  for (let i = 0; i < size; i++) {
    const dark = i % 2 === 0;
    baseModules[6][i] = dark;
    isFunction[6][i] = true;
    baseModules[i][6] = dark;
    isFunction[i][6] = true;
  }

  // Three corner finder patterns + separators
  drawFinderPattern(baseModules, isFunction, size, 0, 0);
  drawFinderPattern(baseModules, isFunction, size, 0, size - 7);
  drawFinderPattern(baseModules, isFunction, size, size - 7, 0);

  // Alignment patterns (skipping the three finder corners)
  const coords = ALIGNMENT_COORDS[version];
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      const isCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === coords.length - 1) ||
        (i === coords.length - 1 && j === 0);
      if (!isCorner) {
        drawAlignmentPattern(baseModules, isFunction, coords[i], coords[j]);
      }
    }
  }

  // Reserve format & version areas before placing data bits
  drawFormatBits(baseModules, isFunction, size, 0);
  drawVersionBits(baseModules, isFunction, size, version);

  // Place interleaved data + EC bits in upward/downward 2-column zigzags
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5; // Skip vertical timing column
    }
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
            bitIdx++;
          }
          baseModules[r][c] = dark;
        }
      }
    }
  }

  // Evaluate all 8 masks and choose lowest penalty
  let bestMask = 0;
  let bestScore = Infinity;
  let bestModules = null;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row, r) =>
      row.map((val, c) =>
        isFunction[r][c] ? val : val !== shouldInvertModule(mask, r, c)
      )
    );
    drawFormatBits(candidate, isFunction, size, mask);
    const penalty = computePenaltyScore(candidate, size);
    if (penalty < bestScore) {
      bestScore = penalty;
      bestMask = mask;
      bestModules = candidate;
    }
  }

  return { size, version, mask: bestMask, modules: bestModules };
}

/**
 * Renders a scannable, accessible SVG element for the given URL/text.
 * Includes a mandatory 4-module quiet zone for instant mobile camera recognition.
 *
 * @param {string} text
 * @param {{ label?: string, margin?: number }} [options]
 * @returns {SVGSVGElement}
 */
export function createQrSvgElement(text, options = {}) {
  const { size, modules } = encodeQrMatrix(text);
  const margin = typeof options.margin === "number" ? options.margin : 4;
  const total = size + margin * 2;
  const svgNS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${total} ${total}`);
  svg.setAttribute("width", "224");
  svg.setAttribute("height", "224");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    options.label || `QR code linking to ${text}`
  );
  svg.classList.add("qr-svg");

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("width", String(total));
  bg.setAttribute("height", String(total));
  bg.setAttribute("rx", "2.5");
  bg.setAttribute("fill", "#ffffff");
  svg.appendChild(bg);

  const segments = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        segments.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }

  const fg = document.createElementNS(svgNS, "path");
  fg.setAttribute("d", segments.join(""));
  fg.setAttribute("fill", "#060913");
  fg.setAttribute("shape-rendering", "crispEdges");
  svg.appendChild(fg);

  return svg;
}
