<script>
/* ===== ImageCropMaster – Front (Netlify + Notion safe) =====
   Routage :
   - Servi directement par Cloud Run  -> API_BASE = ''
   - Servi via Netlify (proxy)        -> API_BASE = '/api' (ou window.__API_BASE__)
*/
const API_BASE = location.hostname.endsWith('.run.app')
  ? ''
  : (window.__API_BASE__ || '/api');

// Etat
let currentFilename = null;
let currentPreviewFilename = null;
let imageAspectRatio = 1;
let cropOrientation = 'portrait';

// DOM
const fileInput          = document.getElementById('file-input');
const cameraInput        = document.getElementById('camera-input');
const uploadProgress     = document.getElementById('upload-progress');
const progressBar        = document.getElementById('progress-bar');
const imageInfoPanel     = document.getElementById('image-info-panel');
const imageInfo          = document.getElementById('image-info');
const qualityIndicators  = document.getElementById('quality-indicators');
const cropPanel          = document.getElementById('crop-panel');
const imagePreview       = document.getElementById('image-preview');
const cropOverlay        = document.getElementById('crop-overlay');
const processingPanel    = document.getElementById('processing-panel');
const resultsPanel       = document.getElementById('results-panel');
const processedInfo      = document.getElementById('processed-info');
const errorAlert         = document.getElementById('error-alert');
const errorMessage       = document.getElementById('error-message');

// Contrôles
const zoomSlider   = document.getElementById('zoom-slider');
const zoomValue    = document.getElementById('zoom-value');
const focusXSlider = document.getElementById('focus-x-slider');
const focusYSlider = document.getElementById('focus-y-slider');
const processBtn   = document.getElementById('process-btn');
const resetBtn     = document.getElementById('reset-btn');
const reloadBtn    = document.getElementById('reload-btn');
const saveToFilesBtn   = document.getElementById('save-to-photos-btn');
const newImageBtn  = document.getElementById('new-image-btn');

// Events
fileInput.addEventListener('change', handleFileSelect);
cameraInput.addEventListener('change', handleFileSelect);
zoomSlider.addEventListener('input', updateCropOverlay);
focusXSlider.addEventListener('input', updateCropOverlay);
focusYSlider.addEventListener('input', updateCropOverlay);
processBtn.addEventListener('click', processImage);
resetBtn.addEventListener('click', resetControls);
reloadBtn.addEventListener('click', () => window.location.reload());
saveToFilesBtn.addEventListener('click', downloadProcessedImage);
newImageBtn.addEventListener('click', resetApplication);
document.querySelectorAll('input[name="orientation"]').forEach(r => {
  r.addEventListener('change', e => { cropOrientation = e.target.value; updateCropOverlay(); });
});

// Helper
const api = (p) => `${API_BASE}${p}`;

function handleFileSelect(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  hideError();

  if (file.size > 500 * 1024 * 1024) { // 500MB
    showError('File size exceeds 500MB limit');
    return;
  }

  uploadProgress.classList.remove('d-none');
  progressBar.style.width = '0%';

  const form = new FormData();
  form.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', api('/upload'), true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      progressBar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
    }
  };

  xhr.onload = () => {
    uploadProgress.classList.add('d-none');
    try {
      const data = JSON.parse(xhr.responseText || '{}');
      if (!xhr.status || xhr.status >= 400 || data.error) {
        showError(data.error || `Upload failed (${xhr.status})`);
        return;
      }
      currentFilename = data.filename;
      currentPreviewFilename = data.preview_filename || data.filename;
      displayImageInfo(data.image_info);
      displayQualityIndicators(data.image_info);
      loadImagePreview();
      startKeepAlive(); // 🔁 empêche le TTL serveur d’expirer pendant l’édition
    } catch {
      showError('Upload failed: invalid server response');
    }
  };

  xhr.onerror = () => {
    uploadProgress.classList.add('d-none');
    showError('Upload failed: network error');
  };

  xhr.send(form);
}

function displayImageInfo(info) {
  const colorProfileBadge = getColorProfileBadge(info.color_profile_type);
  imageInfo.innerHTML = `
    <table class="table table-sm">
      <tr><td><strong>Format:</strong></td><td>${info.format}</td></tr>
      <tr><td><strong>Dimensions:</strong></td><td>${info.width} × ${info.height}px</td></tr>
      <tr><td><strong>Aspect Ratio:</strong></td><td>${info.aspect_ratio}</td></tr>
      <tr><td><strong>Color Mode:</strong></td><td>${info.color_type}</td></tr>
      <tr><td><strong>Bit Depth:</strong></td><td>${info.bit_depth}-bit</td></tr>
      <tr><td><strong>Color Profile:</strong></td><td>${colorProfileBadge}</td></tr>
      <tr><td><strong>File Size:</strong></td><td>${info.file_size_human}</td></tr>
      ${info.exif_orientation && info.exif_orientation !== 1
        ? `<tr><td><strong>EXIF Orientation:</strong></td><td>Rotation applied (${info.exif_orientation})</td></tr>` : ''}
    </table>`;
  imageInfoPanel.classList.remove('d-none');
  imageAspectRatio = info.aspect_ratio;
}

function getColorProfileBadge(t) {
  const b = {
    'sRGB':'<span class="badge bg-success">sRGB</span>',
    'Adobe RGB':'<span class="badge bg-info">Adobe RGB</span>',
    'ProPhoto RGB':'<span class="badge bg-warning">ProPhoto RGB</span>',
    'Display P3':'<span class="badge bg-primary">Display P3</span>',
    'Custom':'<span class="badge bg-secondary">Custom Profile</span>',
    'None':'<span class="badge bg-dark">No Profile</span>',
    'Unknown':'<span class="badge bg-secondary">Unknown</span>'
  };
  return b[t] || b['Unknown'];
}

function displayQualityIndicators(info) {
  const out = [];
  if (info.format === 'TIFF' && info.bit_depth === 16) out.push('<span class="badge bg-success me-2"><i data-feather="award"></i> Professional 16-bit TIFF</span>');
  else if (info.format === 'PNG' && info.bit_depth >= 8) out.push('<span class="badge bg-primary me-2"><i data-feather="check-circle"></i> Lossless PNG</span>');
  else if (info.format === 'JPEG') out.push('<span class="badge bg-info me-2"><i data-feather="image"></i> High-Quality JPEG</span>');
  else if (info.format === 'WEBP') out.push('<span class="badge bg-info me-2"><i data-feather="image"></i> Modern WebP</span>');

  const mp = (info.width * info.height) / 1_000_000;
  if (mp >= 20) out.push('<span class="badge bg-success me-2"><i data-feather="maximize"></i> Ultra High Resolution</span>');
  else if (mp >= 10) out.push('<span class="badge bg-primary me-2"><i data-feather="monitor"></i> High Resolution</span>');

  if (['Adobe RGB','ProPhoto RGB'].includes(info.color_profile_type)) out.push('<span class="badge bg-warning me-2"><i data-feather="aperture"></i> Wide Color Gamut</span>');
  else if (info.color_profile_type === 'Display P3') out.push('<span class="badge bg-info me-2"><i data-feather="smartphone"></i> Modern Display Profile</span>');

  qualityIndicators.innerHTML = out.join('');
  try { feather.replace(); } catch {}
}

function loadImagePreview() {
  imagePreview.src = api(`/preview/${encodeURIComponent(currentPreviewFilename)}`) + `?t=${Date.now()}`;
  imagePreview.onload = () => {
    cropPanel.classList.remove('d-none');
    updateCropOverlay();
  };
}

function updateCropOverlay() {
  const zoom = parseFloat(zoomSlider.value);
  const fx = parseFloat(focusXSlider.value);
  const fy = parseFloat(focusYSlider.value);
  zoomValue.textContent = zoom.toFixed(1);

  const rect = imagePreview.getBoundingClientRect();
  const targetRatio = cropOrientation === 'portrait' ? 2/3 : 3/2;
  const zoomFactor = 1 / zoom;

  const actualRatio = imagePreview.naturalWidth / imagePreview.naturalHeight;

  let cropW, cropH;
  if (actualRatio >= targetRatio) {
    cropH = rect.height * zoomFactor;
    cropW = cropH * targetRatio;
  } else {
    cropW = rect.width * zoomFactor;
    cropH = cropW / targetRatio;
  }

  if (cropOrientation === 'portrait') cropH = cropW * 3/2;
  else cropW = cropH * 3/2;

  const cx = rect.width * fx;
  const cy = rect.height * fy;
  let left = cx - cropW / 2;
  let top  = cy - cropH / 2;

  left = Math.max(0, Math.min(left, rect.width - cropW));
  top  = Math.max(0, Math.min(top,  rect.height - cropH));

  if (left + cropW > rect.width) {
    cropW = rect.width - left;
    cropH = cropOrientation === 'portrait' ? cropW * 3/2 : cropW * 2/3;
  }
  if (top + cropH > rect.height) {
    cropH = rect.height - top;
    cropW = cropOrientation === 'portrait' ? cropH * 2/3 : cropH * 3/2;
  }

  cropOverlay.style.width = `${cropW}px`;
  cropOverlay.style.height = `${cropH}px`;
  cropOverlay.style.left = `${left}px`;
  cropOverlay.style.top = `${top}px`;
}

function processImage() {
  if (!currentFilename) return;
  hideError();
  processingPanel.classList.remove('d-none');
  cropPanel.classList.add('d-none');

  const payload = {
    filename: currentFilename,
    focus_x: parseFloat(focusXSlider.value),
    focus_y: parseFloat(focusYSlider.value),
    zoom: parseFloat(zoomSlider.value),
    orientation: cropOrientation
  };

  fetch(api('/process'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept':'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(data => {
    processingPanel.classList.add('d-none');
    if (data.error) {
      showError(data.error);
      cropPanel.classList.remove('d-none');
      return;
    }
    displayProcessedInfo(data);
  })
  .catch(err => {
    processingPanel.classList.add('d-none');
    cropPanel.classList.remove('d-none');
    showError('Processing failed: ' + err.message);
  });
}

function displayProcessedInfo(data) {
  const info = data.processed_info;
  const colorProfileBadge = getColorProfileBadge(info.color_profile_type);

  processedInfo.innerHTML = `
    <table class="table table-sm">
      <tr><td><strong>Format:</strong></td><td>${info.format}</td></tr>
      <tr><td><strong>Dimensions:</strong></td><td>${info.width} × ${info.height}px</td></tr>
      <tr><td><strong>Aspect Ratio:</strong></td><td>${info.aspect_ratio} (${cropOrientation})</td></tr>
      <tr><td><strong>Color Profile:</strong></td><td>${colorProfileBadge}</td></tr>
      <tr><td><strong>File Size:</strong></td><td>${info.file_size_human}</td></tr>
    </table>`;
  saveToFilesBtn.dataset.filename = data.output_filename;
  resultsPanel.classList.remove('d-none');
}

// Téléchargement robuste (Notion webview/desktop)
async function downloadProcessedImage() {
  const fn = saveToFilesBtn.dataset.filename;
  if (!fn) return;
  const url = api(`/download/${encodeURIComponent(fn)}`) + `?t=${Date.now()}`;

  try {
    // Essai direct (évite certains 404 furtifs liés au cache/proxy)
    let resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok && resp.status === 404) {
      // courte attente si le fichier vient d’être finalisé sur Cloud Run
      await new Promise(r => setTimeout(r, 400));
      resp = await fetch(url, { cache: 'no-store' });
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const mime = blob.type || 'application/octet-stream';

    // 1) File System Access API (Chromium / webviews modernes)
    if ('showSaveFilePicker' in window) {
      try {
        const suggestedName = extractFilenameFromDisposition(resp.headers.get('Content-Disposition')) || fn;
        const ext = (suggestedName.split('.').pop() || '').toLowerCase();
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'Image', accept: { [mime]: ext ? [`.${ext}`] : ['.jpg','.jpeg','.png','.tif','.webp'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        pingRelease(fn); // indique au serveur qu’on a sauvegardé
        return;
      } catch (e) {
        console.warn('showSaveFilePicker denied -> anchor fallback', e);
      }
    }

    // 2) ancre + download
    try {
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fn;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      pingRelease(fn);
      return;
    } catch (e) {
      console.warn('anchor fallback failed -> window.open', e);
    }

    // 3) ouvrir le blob (dernier recours sans popup)
    try {
      const objectUrl = URL.createObjectURL(blob);
      const w = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!w) window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      pingRelease(fn);
      return;
    } catch {
      window.location.href = url;
      pingRelease(fn);
    }
  } catch (err) {
    console.error(err);
    showError('Download failed: ' + (err?.message || err));
  }
}

function extractFilenameFromDisposition(cd) {
  if (!cd) return null;
  // content-disposition: attachment; filename="foo.jpg"
  const m = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\"/g, '')); } catch { return m[1]; }
}

// Ping keep-alive (empêche la collecte TTL quand l’onglet Notion “fait semblant” d’être inactif)
let keepAliveTimer = null;
function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    if (!currentFilename) return;
    navigator.sendBeacon(api('/keepalive'), new Blob([JSON.stringify({ filename: currentFilename })], { type:'application/json' }));
  }, 20_000); // toutes les 20s
}
function stopKeepAlive() { if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; } }

// Indique au serveur qu’on n’a plus besoin des fichiers (soft-delete différée)
function pingRelease(fn) {
  try {
    fetch(api('/release'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ filename: fn || currentFilename })
    }).catch(()=>{});
  } catch {}
}

function resetControls() {
  zoomSlider.value = '1';
  focusXSlider.value = '0.5';
  focusYSlider.value = '0.5';
  const portrait = document.getElementById('portrait');
  if (portrait) portrait.checked = true;
  cropOrientation = 'portrait';
  updateCropOverlay();
}

function resetApplication() {
  stopKeepAlive();
  currentFilename = null;
  currentPreviewFilename = null;
  fileInput.value = '';
  cameraInput.value = '';
  imageInfoPanel.classList.add('d-none');
  cropPanel.classList.add('d-none');
  resultsPanel.classList.add('d-none');
  resetControls();
  hideError();
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorAlert.classList.remove('d-none');
}
function hideError() { errorAlert.classList.add('d-none'); }

/* IMPORTANT :
   ❌ SUPPRIMÉ: beforeunload/cleanup.
   Notion recharge/sub-frame → provoquait destruction prématurée du fichier => 404.
*/
</script>
