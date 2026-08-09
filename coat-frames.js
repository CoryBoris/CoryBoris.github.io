/**
 * Coat frame sequence loader.
 *
 * Replaces the old two-<video> approach (forward file + pre-reversed file).
 *
 * Why: the coat WebM is VP9 *with alpha*, which no GPU can decode - alpha in VP9
 * is a second independent VP9 stream, so Chromium decodes it in software. On top
 * of that the keyframes were a full second apart, so every `currentTime = x`
 * seek had to decode up to 24 dependent frames before it could paint. That is
 * what produced the delay-then-lurch on scroll, and no amount of preloading can
 * fix it because it is decode cost, not download cost.
 *
 * Here every frame is an independent WebP shipped inside one binary bundle:
 *   - One streamed request, so we get honest byte-level progress for the splash.
 *   - Random access to any frame is an array index, not a video seek.
 *   - Reverse playback is just counting down, so the reversed asset is gone.
 *   - load() resolves only once every frame has been decoded, so callers can
 *     make a real guarantee that nothing will buffer later.
 */
(function () {
  'use strict';

  var MANIFEST_URL = 'assets/coat_frames.json';
  var BUNDLE_URL = 'assets/coat_frames.bin';

  // Resident ImageBitmap budget. Each bitmap is width*height*4 bytes (~4.7 MB at
  // 1080x1080), so this is the memory dial. Holding all 241 frames as bitmaps
  // would be ~1.1 GB, which is why we keep a window instead of the whole set.
  // Kept deliberately small on touch devices - iOS Safari will kill a tab that
  // grows too large, and the <img> fallback covers any frame not resident.
  var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var BITMAP_CACHE_LIMIT = isTouch ? 10 : 32;

  // Downloading dominates, so weight the progress bar towards it.
  var DOWNLOAD_SHARE = 0.9;

  var DECODE_BATCH = 8;
  var FETCH_ATTEMPTS = 3;

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function withRetry(task) {
    var attempt = 0;
    function run() {
      attempt++;
      return task().catch(function (err) {
        if (attempt >= FETCH_ATTEMPTS) throw err;
        // Back off briefly - covers a dropped connection rather than a 404.
        return delay(attempt * 400).then(run);
      });
    }
    return run();
  }

  function fetchManifest() {
    return withRetry(function () {
      return fetch(MANIFEST_URL, { cache: 'force-cache' }).then(function (res) {
        if (!res.ok) throw new Error('coat manifest HTTP ' + res.status);
        return res.json();
      });
    });
  }

  /**
   * Download the bundle, reporting real progress as bytes arrive.
   * Falls back to a non-streaming read where ReadableStream is unavailable.
   */
  function fetchBundle(expectedBytes, onBytes) {
    return withRetry(function () {
      return fetch(BUNDLE_URL, { cache: 'force-cache' }).then(function (res) {
        if (!res.ok) throw new Error('coat bundle HTTP ' + res.status);

        if (!res.body || !res.body.getReader) {
          return res.arrayBuffer().then(function (buf) {
            onBytes(expectedBytes);
            return new Uint8Array(buf);
          });
        }

        var reader = res.body.getReader();
        var chunks = [];
        var received = 0;

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              var merged = new Uint8Array(received);
              var offset = 0;
              for (var i = 0; i < chunks.length; i++) {
                merged.set(chunks[i], offset);
                offset += chunks[i].length;
              }
              return merged;
            }
            chunks.push(result.value);
            received += result.value.length;
            onBytes(received);
            return pump();
          });
        }

        return pump();
      });
    });
  }

  function FrameSequence(manifest, frames) {
    this.width = manifest.width;
    this.height = manifest.height;
    this.fps = manifest.fps;
    this.frameCount = frames.length;
    this._frames = frames;
    this._bitmaps = new Map();   // index -> ImageBitmap (insertion-ordered = LRU)
    this._pinned = new Set();    // never evicted
    this._prewarmToken = 0;
  }

  /**
   * Keep these frames as true ImageBitmaps for the lifetime of the page.
   * Used for the section rest positions so every settled state is a plain GPU
   * blit with zero decode.
   */
  FrameSequence.prototype.pin = function (indices) {
    var self = this;
    return Promise.all(indices.map(function (index) {
      var frame = self._frames[index];
      if (!frame) return null;
      return createImageBitmap(frame.blob).then(function (bitmap) {
        self._bitmaps.set(index, bitmap);
        self._pinned.add(index);
      }).catch(function () { /* fall back to the <img> for this frame */ });
    }));
  };

  FrameSequence.prototype._remember = function (index, bitmap) {
    this._bitmaps.set(index, bitmap);
    if (this._bitmaps.size <= BITMAP_CACHE_LIMIT) return;
    var iterator = this._bitmaps.keys();
    var step = iterator.next();
    while (!step.done && this._bitmaps.size > BITMAP_CACHE_LIMIT) {
      var key = step.value;
      if (!this._pinned.has(key)) {
        var stale = this._bitmaps.get(key);
        this._bitmaps.delete(key);
        if (stale && stale.close) stale.close();
      }
      step = iterator.next();
    }
  };

  /**
   * Decode the frames along a path into ImageBitmaps ahead of time.
   * createImageBitmap runs off the main thread, so this costs the animation
   * nothing. Purely an optimisation: draw() works with or without it.
   */
  FrameSequence.prototype.prewarm = function (fromIndex, toIndex) {
    var self = this;
    var token = ++this._prewarmToken;
    var step = toIndex >= fromIndex ? 1 : -1;
    var queue = [];
    for (var i = fromIndex; step > 0 ? i <= toIndex : i >= toIndex; i += step) {
      if (!this._bitmaps.has(i)) queue.push(i);
    }

    // Sequential, not parallel: avoids a memory spike on long segments.
    function next() {
      if (token !== self._prewarmToken || !queue.length) return;
      var index = queue.shift();
      var frame = self._frames[index];
      if (!frame) return next();
      return createImageBitmap(frame.blob).then(function (bitmap) {
        if (token !== self._prewarmToken) {
          if (bitmap.close) bitmap.close();
          return;
        }
        self._remember(index, bitmap);
        return next();
      }).catch(function () { return next(); });
    }

    next();
  };

  /**
   * Paint a frame. Prefers a resident ImageBitmap; otherwise draws the decoded
   * <img>, which the browser may have to re-decode (a few ms for one
   * independent WebP - versus the ~24-frame dependency chain a video seek
   * needed). Never async, never stalls.
   */
  FrameSequence.prototype.draw = function (ctx, index) {
    var frame = this._frames[index];
    if (!frame) return false;
    var source = this._bitmaps.get(index) || frame.img;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(source, 0, 0, this.width, this.height);
    return true;
  };

  /**
   * Fetch and fully decode the sequence.
   * @param {Object} options
   * @param {function(number)} [options.onProgress] 0..1
   * @param {number[]} [options.pin] frame indices to hold as ImageBitmaps
   * @returns {Promise<FrameSequence>} resolves only when every frame is decoded
   */
  function load(options) {
    var opts = options || {};
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var report = function (value) {
      onProgress(Math.max(0, Math.min(1, value)));
    };

    return fetchManifest().then(function (manifest) {
      var sizes = manifest.sizes;
      var totalBytes = sizes.reduce(function (a, b) { return a + b; }, 0);

      return fetchBundle(totalBytes, function (received) {
        report((received / totalBytes) * DOWNLOAD_SHARE);
      }).then(function (bytes) {
        // Slice the bundle into one Blob per frame and wrap each in an <img>.
        var frames = [];
        var offset = 0;
        for (var i = 0; i < sizes.length; i++) {
          var blob = new Blob([bytes.subarray(offset, offset + sizes[i])], { type: manifest.mime || 'image/webp' });
          offset += sizes[i];
          var img = new Image();
          img.decoding = 'sync';
          img.src = URL.createObjectURL(blob);
          frames.push({ blob: blob, img: img });
        }

        // Decode in batches so the main thread stays responsive and the splash
        // progress keeps moving. img.decode() resolves only once the frame is
        // genuinely paintable - this is what makes the no-buffering promise real.
        var decoded = 0;
        function decodeBatch(start) {
          if (start >= frames.length) return Promise.resolve();
          var batch = frames.slice(start, start + DECODE_BATCH);
          return Promise.all(batch.map(function (frame) {
            return frame.img.decode ? frame.img.decode().catch(function () {}) : Promise.resolve();
          })).then(function () {
            decoded += batch.length;
            report(DOWNLOAD_SHARE + (decoded / frames.length) * (1 - DOWNLOAD_SHARE));
            return decodeBatch(start + DECODE_BATCH);
          });
        }

        return decodeBatch(0).then(function () {
          var sequence = new FrameSequence(manifest, frames);
          return sequence.pin(opts.pin || []).then(function () {
            report(1);
            return sequence;
          });
        });
      });
    });
  }

  window.CoatFrames = { load: load };
})();
