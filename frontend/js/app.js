/* ===== ImageCropMaster – Front (Netlify-friendly) =====
   Auto-route:
   - Si servi directement par Cloud Run  -> API_BASE = ''
   - Si front sur Netlify avec proxy     -> API_BASE = '/api'
*/
const API_BASE = location.hostname.endsWith('.run.app') ? '' : '/api';

// State
let currentFilename = null;
let currentPreviewFilename = null;
let imageAspectRatio = 1;
let cropOrientation = 'portrait';

// DOM
const fileInput = document.getElementById('file-input');
const cameraInput = document.getElementById('camera-input');
const uploadProgress = document.getElementById('upload-progress');
const progressBar = document.getElementById('progress-bar');
const imageInfoPanel = document.getElementById('image-info-panel');
const imageInfo = document.getElementById('image-info');
const qualityIndicators = document.getElementById('quality-indicators');
const cropPanel = document.getElementById('crop-panel');
const imagePreview = document.getElementById('image-preview');
const cropOverlay = document.getElementById('crop-overlay');
const processingPanel = document.getElementById('processing-panel');
const resultsPanel = document.getElementById('results-panel');
const processedInfo = document.getElementById('processed-info');
const errorAlert = document.getElementById('error-alert');
const errorMessage = document.getElementById('error-message');

// Controls
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');
const focusXSlider = document.getElementById('focus-x-slider');
const focusYSlider = document.getElementById('focus-y-slider');
const processBtn = document.getElementById('process-btn');
const resetBtn = document.getElementById('reset-btn');
const reloadBtn = document.getElementById('reload-btn');
const saveToPhotosBtn = document.getElementById('save-to-photos-btn');
const newImageBtn = document.getElementById('new-image-btn');

// Events
fileInput.addEventListener('change', handleFileSelect);
cameraInput.addEventListener('change', handleFileSelect);
zoomSlider.addEventListener('input', updateCropOverlay);
focusXSlider.addEventListener('input', updateCropOverlay);
focusYSlider.addEventListener('input', updateCropOverlay);
processBtn.addEventListener('click', processImage);
resetBtn.addEventListener('click', resetControls);
reloadBtn.addEventListener('click', () => window.location.reload());
saveToPhotosBtn.addEventListener('click', downloadProcessedImage);
newImageBtn.addEventListener('click', resetApplication);
document.querySelectorAll('input[name="orientation"]').forEach(r => {
  r.addEventListener('change', e => { cropOrientation = e.target.value; updateCropOverlay(); });
});

// Helpers
const api = (p) => `${API_BASE}${p}`;

function handleFileSelect(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  hideError();

  // 500MB hard limit (aligné backend)
  if (file.size > 500 * 1024 * 1024) {
    showError('File size exceeds 500MB limit');
    return;
  }

  // UI
  uploadProgress.classList.remove('d-none');
  progressBar.style.width = '0%';

  // XHR pour vrai suivi de progression (Fetch ne donne pas le progress upload)
  const form = new FormData();
  form.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', api('/upload'), true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${pct}%`;
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
    } catch (e) {
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
  imagePreview.src = api(`/preview/${currentPreviewFilename}`);
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
  saveToPhotosBtn.dataset.filename = data.output_filename;
  resultsPanel.classList.remove('d-none');
}

// ⬇️ Correction pour Notion
async function downloadProcessedImage() {
  const fn = saveToPhotosBtn.dataset.filename;
  if (!fn) return;
  const url = api(`/download/${fn}`);

  const inIframe = (window.location !== window.parent.location);

  try {
    // Cas Notion (iframe) → Blob + link
    if (inIframe) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fn;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      return;
    }

    // Sinon → Web Share API si dispo
    if (navigator.share && navigator.canShare) {
      const resp = await fetch(url, { cache: 'no-store' });
      const blob = await resp.blob();
      const file = new File([blob], fn, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'Cropped Image', files: [file] });
        return;
      }
    }

    // Fallback direct
    window.location.href = url;
  } catch (err) {
    console.error(err);
    showError('Download failed: ' + err.message);
  }
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
  if (currentFilename) {
    fetch(api('/cleanup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: [currentFilename] })
    }).catch(()=>{});
  }
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

function hideError() {
  errorAlert.classList.add('d-none');
}

// Nettoyage silencieux à la fermeture
window.addEventListener('beforeunload', () => {
  if (!currentFilename) return;
  try {
    const blob = new Blob([JSON.stringify({ filenames:[currentFilename] })], { type:'application/json' });
    navigator.sendBeacon(api('/cleanup'), blob);
  } catch {}
});
