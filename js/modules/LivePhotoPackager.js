// Packages a rendered clip and its key frame as an iOS Live Photo: a JPEG and
// a QuickTime movie that Photos pairs through a shared content identifier.
//
// Pairing alone isn't enough for the Lock Screen, which refuses to animate a
// Live Photo ("Motion not available") unless the movie looks like one from the
// iPhone camera. Apple doesn't document that check. What is written here is
// what others measured from camera files and found the Lock Screen needs:
//   - a `live-photo-info` timed-metadata track with one record per video frame
//   - the still's moment as a sample holding still-image-time (-1) and an
//     identity still-image-transform, in a 600 timescale
//   - both tracks referring to the video track ('cdsc')
// The movie itself must be HEVC, at most 1920 px on its long side, with the
// still at least half a second in — the exporter takes care of those.
//
// The track layout and the camera reference values come from LivePaper
// (github.com/Yuyang16Z/LivePaper, MIT — notice at the end of this file). The
// MOV rewriting follows efella/LivePhoto (MIT), vendored in ../vendor.
import LivePhotoMaker from '../vendor/livephoto.js';

const METADATA_TIMESCALE = 600; // the camera's

// ---------------------------------------------------------------- bytes

const ascii = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
const utf8 = (s) => new TextEncoder().encode(s);
const zeros = (n) => new Uint8Array(n);

function u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; }
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; }
function i32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n); return b; }
function f64(n) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, n); return b; }

function hex(s) {
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16);
  return b;
}

function concat(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

// [size][type][payload]; key tables and metadata samples put a numeric key id
// where the four-character type would be
function box(type, ...payload) {
  const body = concat(payload);
  return concat([u32(8 + body.length), typeof type === 'number' ? u32(type) : ascii(type), body]);
}

function fullBox(type, version, flags, ...payload) {
  return box(type, u32((version << 24) | flags), ...payload);
}

// ---------------------------------------------------------------- reading

function readBoxes(data, start, end) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const boxes = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = view.getUint32(pos);
    let header = 8;
    const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
    if (size === 1) { size = view.getUint32(pos + 8) * 4294967296 + view.getUint32(pos + 12); header = 16; }
    else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) throw new Error(`Corrupt video file (box '${type}' at ${pos})`);
    boxes.push({ type, start: pos, payload: pos + header, end: pos + size });
    pos += size;
  }
  return boxes;
}

function child(data, parent, type) {
  return readBoxes(data, parent.payload, parent.end).find((b) => b.type === type) || null;
}

function descend(data, parent, types) {
  for (const type of types) {
    if (!parent) return null;
    parent = child(data, parent, type);
  }
  return parent;
}

// ---------------------------------------------------------------- camera reference values

// live-photo-info's setup data: a binary plist naming iPhone OS 17.0 and the
// capture frameworks' versions, and the camera's capture size
const CAMERA_SETUP_PLIST = hex(
  '62706c6973743030d301020304050c5f10214c69766550686f746f4d65746164'
  + '61746153657475704461746156657273696f6e5d53797374656d56657273696f'
  + '6e5f10114672616d65776f726b56657273696f6e731001d3060708090a0b5f10'
  + '1350726f647563744275696c6456657273696f6e5b50726f647563744e616d65'
  + '5e50726f6475637456657273696f6e583231413532373768596950686f6e6520'
  + '4f535431372e30d40d0e0f10111213145a436f72654d6f74696f6e5d434d4361'
  + '7074757265436f72655e483130495350536572766963657359436f72654d6564'
  + '696158323836382e302e32573434362e352e335432302e325e333034352e3639'
  + '2e322e31312e340008000f0033004100550057005e00740080008f009800a200'
  + 'a700b000bb00c900d800e200eb00f300f8000000000000020100000000000000'
  + '1500000000000000000000000000000107');
const CAMERA_DIMENSIONS = [1920, 1440];

// One camera-info record (136 bytes), repeated for every frame
const CAMERA_INFO_RECORD = hex(
  '03000000bdc36d3ce3b5eb6d800000007b80ad425a2d64410a08cb3e7feea6bd'
  + '79e9f63f000080400400ff000000000000000000000000000000000000000000'
  + '07000000525e873ee66e52bf1b2a6ac4d37862bf761ed23dde3f8ec313f52f39'
  + 'b2f04439ff309dbf1a17f1ed1b070000206796ed1b0700000000000000000000'
  + '0000000000000000');

const STILL_IMAGE_TIME_KEY = 'com.apple.quicktime.still-image-time';
const STILL_IMAGE_TRANSFORM_KEY = 'com.apple.quicktime.live-photo-still-image-transform';
const INFO_KEY = 'com.apple.quicktime.live-photo-info';
// The doubled prefix is what the camera writes
const INFO_DATA_TYPE = 'com.apple.quicktime.com.apple.quicktime.live-photo-info';

// QuickTime well-known data types
const TYPE_RAW = 0;
const TYPE_INT8 = 0x41;
const TYPE_FLOAT64_MATRIX = 0x53;

const keyDeclaration = (key) => box('keyd', ascii('mdta'), ascii(key));
const wellKnownType = (type) => box('dtyp', u32(0), u32(type));

// ---------------------------------------------------------------- metadata tracks

// A timed-metadata track ('mebx' samples) describing the video track.
// `samples` are equal-sized and stored back to back from `chunkOffset`.
function metadataTrack({ trackId, videoTrackId, movieTimescale, keys, sampleCount, sampleSize, sampleTicks, startSeconds, chunkOffset }) {
  const toMovie = (ticks) => Math.max(1, Math.round((ticks / METADATA_TIMESCALE) * movieTimescale));
  const startMovie = Math.round(startSeconds * movieTimescale);
  const mediaTicks = sampleCount * sampleTicks;
  const durationMovie = toMovie(mediaTicks);

  const matrix = concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);
  // flags 0xf = enabled | in movie | in preview | in poster
  const tkhd = fullBox('tkhd', 0, 0xf, u32(0), u32(0), u32(trackId), u32(0), u32(startMovie + durationMovie),
    zeros(8), zeros(8), matrix, u32(0), u32(0));

  // An empty edit holds the track back until its first sample's moment
  const edits = [];
  if (startMovie > 0) edits.push(concat([u32(startMovie), i32(-1), u32(0x10000)]));
  edits.push(concat([u32(durationMovie), i32(0), u32(0x10000)]));
  const edts = box('edts', fullBox('elst', 0, 0, u32(edits.length), ...edits));

  const tref = box('tref', box('cdsc', u32(videoTrackId)));

  const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(METADATA_TIMESCALE), u32(mediaTicks), u16(0x55c4), u16(0));
  const hdlr = fullBox('hdlr', 0, 0, ascii('mhlrmeta'), zeros(12), zeros(1));
  const gmhd = box('gmhd', fullBox('gmin', 0, 0, u16(0x40), u16(0x8000), u16(0x8000), u16(0x8000), u16(0), u16(0)));
  const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('alis', 0, 1)));

  // Sample description: 6 reserved bytes, data reference index 1, the key table
  const mebx = box('mebx', zeros(6), u16(1), box('keys', ...keys));
  const stbl = box('stbl',
    fullBox('stsd', 0, 0, u32(1), mebx),
    fullBox('stts', 0, 0, u32(1), u32(sampleCount), u32(sampleTicks)),
    fullBox('stsc', 0, 0, u32(1), u32(1), u32(sampleCount), u32(1)),
    fullBox('stsz', 0, 0, u32(sampleSize), u32(sampleCount)),
    fullBox('stco', 0, 0, u32(1), u32(chunkOffset)));

  return box('trak', tkhd, edts, tref, box('mdia', mdhd, hdlr, box('minf', gmhd, dinf, stbl)));
}

// Movie-level QuickTime metadata (moov/meta, no version/flags) with 'mdta' string keys
function movieMetadata(items) {
  const keys = items.map(([name]) => concat([u32(8 + name.length), ascii('mdta'), ascii(name)]));
  const values = items.map(([, value], i) => box(i + 1, box('data', u32(1), u32(0), utf8(value)))); // type 1 = UTF-8
  return box('meta',
    fullBox('hdlr', 0, 0, u32(0), ascii('mdta'), zeros(12), zeros(1)),
    fullBox('keys', 0, 0, u32(items.length), ...keys),
    box('ilst', ...values));
}

function isoDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:`
    + `${p(date.getSeconds())}${sign}${p(Math.floor(abs / 60))}${p(abs % 60)}`;
}

// ---------------------------------------------------------------- movie

// Rewrap an MP4 (one HEVC/H.264 video track, samples untouched) as the MOV
// half of a Live Photo. Returns the parts of the new file.
function buildMovie(data, { contentId, frameCount, fps, stillTime, creationDate }) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const top = readBoxes(data, 0, data.length);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Error("Not an MP4 video (no 'moov' box)");

  const mvhd = child(data, moov, 'mvhd');
  const mvhdVersion = data[mvhd.payload];
  const movieTimescale = view.getUint32(mvhd.payload + (mvhdVersion === 1 ? 20 : 12));
  const nextTrackIdOffset = mvhd.payload + (mvhdVersion === 1 ? 108 : 96);

  // New layout: ftyp wide [original media data] mdat(metadata samples) moov
  const head = [box('ftyp', ascii('qt  '), u32(0x20050300), ascii('qt  ')), box('wide')];
  let pos = head[0].length + head[1].length;
  const kept = [];
  for (const b of top) {
    if (b.type === 'ftyp' || b.type === 'moov') continue;
    kept.push({ start: b.start, end: b.end, delta: pos - b.start });
    pos += b.end - b.start;
  }
  const moved = (offset) => {
    const range = kept.find((k) => offset >= k.start && offset < k.end);
    if (!range) throw new Error('Video sample data is outside the media boxes');
    return offset + range.delta;
  };

  // Metadata samples: one live-photo-info record per frame, then the still's sample
  const infoSample = box(1, CAMERA_INFO_RECORD);
  const identity = concat([1, 0, 0, 0, 1, 0, 0, 0, 1].map(f64));
  const stillSample = concat([box(1, new Uint8Array([0xff])), box(2, identity)]); // int8 -1, identity 3x3
  const infoSamples = new Uint8Array(infoSample.length * frameCount);
  for (let i = 0; i < frameCount; i++) infoSamples.set(infoSample, i * infoSample.length);
  const metadataMdat = box('mdat', infoSamples, stillSample);
  const infoOffset = pos + 8;
  const stillOffset = infoOffset + infoSamples.length;

  // Existing tracks: fix chunk offsets for the new layout, drop old metadata
  let videoTrackId = null;
  let maxTrackId = 0;
  const tracks = [];
  const others = [];
  for (const c of readBoxes(data, moov.payload, moov.end)) {
    if (c.type === 'trak') {
      const trak = data.slice(c.start, c.end);
      const trakView = new DataView(trak.buffer);
      const tkhd = child(data, c, 'tkhd');
      const trackId = view.getUint32(tkhd.payload + (data[tkhd.payload] === 1 ? 20 : 12));
      maxTrackId = Math.max(maxTrackId, trackId);
      trak[tkhd.start - c.start + 11] |= 0xf;

      const hdlr = descend(data, c, ['mdia', 'hdlr']);
      const handler = hdlr && String.fromCharCode(...data.subarray(hdlr.payload + 8, hdlr.payload + 12));
      if (handler === 'vide' && videoTrackId === null) videoTrackId = trackId;

      const stbl = descend(data, c, ['mdia', 'minf', 'stbl']);
      const offsets = stbl && (child(data, stbl, 'stco') || child(data, stbl, 'co64'));
      if (offsets) {
        const count = view.getUint32(offsets.payload + 4);
        const base = offsets.payload + 8 - c.start;
        for (let i = 0; i < count; i++) {
          if (offsets.type === 'stco') {
            trakView.setUint32(base + 4 * i, moved(trakView.getUint32(base + 4 * i)));
          } else {
            const value = moved(trakView.getUint32(base + 8 * i) * 4294967296 + trakView.getUint32(base + 8 * i + 4));
            trakView.setUint32(base + 8 * i, Math.floor(value / 4294967296));
            trakView.setUint32(base + 8 * i + 4, value % 4294967296);
          }
        }
      }
      tracks.push(trak);
    } else if (c.type !== 'udta' && c.type !== 'meta' && c.type !== 'mvhd') {
      others.push(data.subarray(c.start, c.end));
    }
  }
  if (videoTrackId === null) throw new Error('This file has no video track');

  const infoTrackId = Math.max(view.getUint32(nextTrackIdOffset), maxTrackId + 1);
  const stillTrackId = infoTrackId + 1;
  const newMvhd = data.slice(mvhd.start, mvhd.end);
  new DataView(newMvhd.buffer).setUint32(nextTrackIdOffset - mvhd.start, stillTrackId + 1);

  const infoTrack = metadataTrack({
    trackId: infoTrackId,
    videoTrackId,
    movieTimescale,
    keys: [box(1,
      keyDeclaration(INFO_KEY),
      box('dtyp', u32(1), ascii(INFO_DATA_TYPE)), // 1 = reverse-DNS named type
      box('setu', box('cfgv', CAMERA_SETUP_PLIST), box('dims', u32(CAMERA_DIMENSIONS[0]), u32(CAMERA_DIMENSIONS[1]))),
      box('ctps', wellKnownType(TYPE_RAW)))],
    sampleCount: frameCount,
    sampleSize: infoSample.length,
    sampleTicks: Math.round(METADATA_TIMESCALE / fps),
    startSeconds: 0,
    chunkOffset: infoOffset
  });

  const stillTrack = metadataTrack({
    trackId: stillTrackId,
    videoTrackId,
    movieTimescale,
    keys: [
      box(1, keyDeclaration(STILL_IMAGE_TIME_KEY), wellKnownType(TYPE_INT8)),
      box(2, keyDeclaration(STILL_IMAGE_TRANSFORM_KEY), wellKnownType(TYPE_FLOAT64_MATRIX))
    ],
    sampleCount: 1,
    sampleSize: stillSample.length,
    sampleTicks: 1, // one tick, like the camera
    startSeconds: stillTime,
    chunkOffset: stillOffset
  });

  const meta = movieMetadata([
    ['com.apple.quicktime.content.identifier', contentId],
    ['com.apple.quicktime.creationdate', isoDate(creationDate)]
  ]);
  const newMoov = box('moov', newMvhd, ...tracks, ...others, meta, infoTrack, stillTrack);

  return [...head, ...kept.map((k) => data.subarray(k.start, k.end)), metadataMdat, newMoov];
}

// video: MP4 Blob (HEVC, no audio) of `frameCount` frames at `fps`.
// still: JPEG Blob of the frame shown at `stillTime` seconds.
// Resolves with { photo, video } Blobs to import into Photos together.
export async function packageLivePhoto({ video, still, frameCount, fps, stillTime }) {
  const contentId = crypto.randomUUID().toUpperCase();
  const creationDate = new Date();

  const movieParts = buildMovie(new Uint8Array(await video.arrayBuffer()), { contentId, frameCount, fps, stillTime, creationDate });
  const photoBytes = LivePhotoMaker.addLivePhotoExif(new Uint8Array(await still.arrayBuffer()), contentId, creationDate);

  return {
    photo: new Blob([photoBytes], { type: 'image/jpeg' }),
    video: new Blob(movieParts, { type: 'video/quicktime' })
  };
}

// LivePaper's notice, for the metadata layout and camera reference values above:
//
// MIT License
//
// Copyright (c) 2026 Yuyang Zeng
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
