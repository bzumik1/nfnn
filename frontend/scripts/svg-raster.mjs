const SUBSAMPLE_ROWS = 16;
const CURVE_STEP_PIXELS = 1;
const IDENTITY = [1, 0, 0, 1, 0, 0];

const ALLOWED_ATTRIBUTES = {
  svg: new Set(['xmlns', 'viewBox', 'width', 'height']),
  title: new Set([]),
  g: new Set(['transform', 'id', 'class']),
  path: new Set(['d', 'fill', 'fill-rule', 'transform', 'id', 'class']),
};

function unsupported(what) {
  return new Error(`${what} is not supported: the launch icon is drawn from filled paths only`);
}

function attributesOf(source) {
  const attributes = {};
  for (const [, name, value] of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attributes[name] = value;
  }
  return attributes;
}

function multiply([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function matrixOf(transform) {
  if (transform === undefined) {
    return IDENTITY;
  }
  const match = /^\s*matrix\(([^)]*)\)\s*$/.exec(transform);
  const values = match?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!values || values.length !== 6 || values.some(Number.isNaN)) {
    throw unsupported(`the transform "${transform}"`);
  }
  return values;
}

function colourOf(fill) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fill ?? '');
  if (!match) {
    throw unsupported(`the fill "${fill}"`);
  }
  const hex =
    match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
}

function ruleOf(fillRule) {
  if (fillRule === undefined || fillRule === 'nonzero' || fillRule === 'evenodd') {
    return fillRule ?? 'nonzero';
  }
  throw unsupported(`the fill-rule "${fillRule}"`);
}

function elementsOf(text) {
  const paths = [];
  const stack = [IDENTITY];
  let viewBox;
  for (const [, closing, name, source, selfClosing] of text.matchAll(
    /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g,
  )) {
    if (!(name in ALLOWED_ATTRIBUTES)) {
      throw unsupported(`the element <${name}>`);
    }
    if (closing) {
      if (name === 'g') {
        stack.pop();
      }
      continue;
    }
    const attributes = attributesOf(source);
    for (const attribute of Object.keys(attributes)) {
      if (!ALLOWED_ATTRIBUTES[name].has(attribute)) {
        throw unsupported(`the attribute ${attribute} of <${name}>`);
      }
    }
    const transform = multiply(stack.at(-1), matrixOf(attributes.transform));
    if (name === 'svg') {
      viewBox = attributes.viewBox
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
    } else if (name === 'g' && !selfClosing) {
      stack.push(transform);
    } else if (name === 'path') {
      paths.push({
        d: attributes.d ?? '',
        colour: colourOf(attributes.fill),
        rule: ruleOf(attributes['fill-rule']),
        transform,
      });
    }
  }
  if (!viewBox || viewBox.length !== 4 || viewBox.some(Number.isNaN)) {
    throw unsupported('an SVG without a viewBox of four numbers');
  }
  return { viewBox, paths };
}

function polygonsOf(d, transform) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const polygons = [];
  let polygon;
  let command;
  let at = 0;
  const number = () => {
    const value = Number(tokens[at++]);
    if (Number.isNaN(value)) {
      throw unsupported(`the path data near "${tokens[at - 1]}"`);
    }
    return value;
  };
  const place = (x, y) => [
    transform[0] * x + transform[2] * y + transform[4],
    transform[1] * x + transform[3] * y + transform[5],
  ];
  let current = [0, 0];
  let start = [0, 0];
  while (at < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[at])) {
      command = tokens[at++];
    }
    if (command === 'M') {
      current = [number(), number()];
      start = current;
      polygon = [place(...current)];
      polygons.push(polygon);
      command = 'L';
    } else if (command === 'L') {
      current = [number(), number()];
      polygon.push(place(...current));
    } else if (command === 'C') {
      const controls = [current, [number(), number()], [number(), number()], [number(), number()]];
      const placed = controls.map((point) => place(...point));
      const length = placed
        .slice(1)
        .reduce(
          (sum, point, index) =>
            sum + Math.hypot(point[0] - placed[index][0], point[1] - placed[index][1]),
          0,
        );
      const steps = Math.max(2, Math.ceil(length / CURVE_STEP_PIXELS));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const u = 1 - t;
        const weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        polygon.push(
          [0, 1].map((axis) =>
            placed.reduce((sum, point, index) => sum + point[axis] * weights[index], 0),
          ),
        );
      }
      current = controls[3];
    } else if (command === 'Z') {
      current = start;
      command = undefined;
    } else {
      throw unsupported(`the path command "${command}"`);
    }
  }
  return polygons;
}

function edgesOf(polygons) {
  return polygons.flatMap((polygon) =>
    polygon
      .map((from, index) => [from, polygon[(index + 1) % polygon.length]])
      .filter(([from, to]) => from[1] !== to[1])
      .map(([from, to]) => ({
        top: Math.min(from[1], to[1]),
        bottom: Math.max(from[1], to[1]),
        x: from[0],
        y: from[1],
        slope: (to[0] - from[0]) / (to[1] - from[1]),
        winding: to[1] > from[1] ? 1 : -1,
      })),
  );
}

function addSpan(row, from, to, weight) {
  const left = Math.max(0, from);
  const right = Math.min(row.length, to);
  if (right <= left) {
    return;
  }
  const first = Math.floor(left);
  const last = Math.floor(right);
  if (first === last) {
    row[first] += (right - left) * weight;
    return;
  }
  row[first] += (first + 1 - left) * weight;
  for (let pixel = first + 1; pixel < last; pixel++) {
    row[pixel] += weight;
  }
  if (last < row.length) {
    row[last] += (right - last) * weight;
  }
}

function edgesByRow(edges, height) {
  const rows = Array.from({ length: height }, () => []);
  for (const edge of edges) {
    const first = Math.max(0, Math.floor(edge.top));
    const last = Math.min(height - 1, Math.floor(edge.bottom));
    for (let y = first; y <= last; y++) {
      rows[y].push(edge);
    }
  }
  return rows;
}

function coverageOf(edges, rule, width, height) {
  const coverage = new Float64Array(width * height);
  const weight = 1 / SUBSAMPLE_ROWS;
  const rows = edgesByRow(edges, height);
  for (let y = 0; y < height; y++) {
    const row = coverage.subarray(y * width, (y + 1) * width);
    for (let sample = 0; sample < SUBSAMPLE_ROWS; sample++) {
      const scan = y + (sample + 0.5) / SUBSAMPLE_ROWS;
      const crossings = rows[y]
        .filter((edge) => edge.top <= scan && scan < edge.bottom)
        .map((edge) => ({ x: edge.x + (scan - edge.y) * edge.slope, winding: edge.winding }))
        .sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let index = 0; index < crossings.length - 1; index++) {
        winding += rule === 'evenodd' ? 1 : crossings[index].winding;
        const inside = rule === 'evenodd' ? winding % 2 === 1 : winding !== 0;
        if (inside) {
          addSpan(row, crossings[index].x, crossings[index + 1].x, weight);
        }
      }
    }
  }
  return coverage;
}

export function rasterizeSvg(text, { width, height }) {
  const { viewBox, paths } = elementsOf(text);
  const [minX, minY, boxWidth, boxHeight] = viewBox;
  const scale = Math.min(width / boxWidth, height / boxHeight);
  const fit = [
    scale,
    0,
    0,
    scale,
    (width - boxWidth * scale) / 2 - minX * scale,
    (height - boxHeight * scale) / 2 - minY * scale,
  ];
  const premultiplied = new Float64Array(width * height * 4);
  for (const path of paths) {
    const coverage = coverageOf(
      edgesOf(polygonsOf(path.d, multiply(fit, path.transform))),
      path.rule,
      width,
      height,
    );
    for (let pixel = 0; pixel < coverage.length; pixel++) {
      const alpha = Math.min(1, coverage[pixel]);
      if (alpha === 0) {
        continue;
      }
      const at = pixel * 4;
      for (let channel = 0; channel < 3; channel++) {
        premultiplied[at + channel] =
          path.colour[channel] * alpha + premultiplied[at + channel] * (1 - alpha);
      }
      premultiplied[at + 3] = alpha + premultiplied[at + 3] * (1 - alpha);
    }
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let at = 0; at < premultiplied.length; at += 4) {
    const alpha = premultiplied[at + 3];
    if (alpha === 0) {
      continue;
    }
    for (let channel = 0; channel < 3; channel++) {
      pixels[at + channel] = Math.min(255, Math.round(premultiplied[at + channel] / alpha));
    }
    pixels[at + 3] = Math.round(alpha * 255);
  }
  return { width, height, channels: 4, pixels };
}
