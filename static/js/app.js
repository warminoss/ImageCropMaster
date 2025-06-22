// Image Cropper Application
let currentFilename = null;
let currentPreviewFilename = null;
let imageAspectRatio = 1;
let cropOrientation = 'portrait';

// DOM Elements
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

// Event Listeners
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

// Orientation radio buttons
document.querySelectorAll('input[name="orientation"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        cropOrientation = e.target.value;
        updateCropOverlay();
    });
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset any previous errors
    hideError();

    // Validate file size (500MB limit)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
        showError('File size exceeds 500MB limit');
        return;
    }

    // Show upload progress
    uploadProgress.classList.remove('d-none');
    progressBar.style.width = '0%';

    const formData = new FormData();
    formData.append('file', file);

    // Simulate progress (actual progress tracking would require XMLHttpRequest)
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 10;
        progressBar.style.width = `${Math.min(progress, 90)}%`;
    }, 100);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        clearInterval(progressInterval);
        progressBar.style.width = '100%';
        
        setTimeout(() => {
            uploadProgress.classList.add('d-none');
            
            if (data.error) {
                showError(data.error);
                return;
            }

            currentFilename = data.filename;
            currentPreviewFilename = data.preview_filename || data.filename;
            displayImageInfo(data.image_info);
            displayQualityIndicators(data.image_info);
            loadImagePreview();
        }, 500);
    })
    .catch(error => {
        clearInterval(progressInterval);
        uploadProgress.classList.add('d-none');
        showError('Upload failed: ' + error.message);
    });
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
            ${info.exif_orientation && info.exif_orientation !== 1 ? 
                `<tr><td><strong>EXIF Orientation:</strong></td><td>Rotation applied (${info.exif_orientation})</td></tr>` : ''}
        </table>
    `;
    imageInfoPanel.classList.remove('d-none');
    imageAspectRatio = info.aspect_ratio;
}

function getColorProfileBadge(profileType) {
    const badges = {
        'sRGB': '<span class="badge bg-success">sRGB</span>',
        'Adobe RGB': '<span class="badge bg-info">Adobe RGB</span>',
        'ProPhoto RGB': '<span class="badge bg-warning">ProPhoto RGB</span>',
        'Display P3': '<span class="badge bg-primary">Display P3</span>',
        'Custom': '<span class="badge bg-secondary">Custom Profile</span>',
        'None': '<span class="badge bg-dark">No Profile</span>',
        'Unknown': '<span class="badge bg-secondary">Unknown</span>'
    };
    return badges[profileType] || badges['Unknown'];
}

function displayQualityIndicators(info) {
    const indicators = [];
    
    // Format quality indicator
    if (info.format === 'TIFF' && info.bit_depth === 16) {
        indicators.push('<span class="badge bg-success me-2"><i data-feather="award"></i> Professional 16-bit TIFF</span>');
    } else if (info.format === 'PNG' && info.bit_depth >= 8) {
        indicators.push('<span class="badge bg-primary me-2"><i data-feather="check-circle"></i> Lossless PNG</span>');
    } else if (info.format === 'JPEG') {
        indicators.push('<span class="badge bg-info me-2"><i data-feather="image"></i> High-Quality JPEG</span>');
    } else if (info.format === 'WEBP') {
        indicators.push('<span class="badge bg-info me-2"><i data-feather="image"></i> Modern WebP</span>');
    }
    
    // Resolution indicator
    const megapixels = (info.width * info.height) / 1000000;
    if (megapixels >= 20) {
        indicators.push('<span class="badge bg-success me-2"><i data-feather="maximize"></i> Ultra High Resolution</span>');
    } else if (megapixels >= 10) {
        indicators.push('<span class="badge bg-primary me-2"><i data-feather="monitor"></i> High Resolution</span>');
    }
    
    // Color profile indicator
    if (info.color_profile_type === 'Adobe RGB' || info.color_profile_type === 'ProPhoto RGB') {
        indicators.push('<span class="badge bg-warning me-2"><i data-feather="aperture"></i> Wide Color Gamut</span>');
    } else if (info.color_profile_type === 'Display P3') {
        indicators.push('<span class="badge bg-info me-2"><i data-feather="smartphone"></i> Modern Display Profile</span>');
    }
    
    qualityIndicators.innerHTML = indicators.join('');
    feather.replace();
}

function loadImagePreview() {
    imagePreview.src = `/preview/${currentPreviewFilename}`;
    imagePreview.onload = function() {
        cropPanel.classList.remove('d-none');
        updateCropOverlay();
    };
}

function updateCropOverlay() {
    const zoom = parseFloat(zoomSlider.value);
    const focusX = parseFloat(focusXSlider.value);
    const focusY = parseFloat(focusYSlider.value);
    
    zoomValue.textContent = zoom.toFixed(1);
    
    const imgRect = imagePreview.getBoundingClientRect();
    const targetRatio = cropOrientation === 'portrait' ? 2/3 : 3/2;
    
    // Calculate crop dimensions - must match Python logic exactly
    const zoomFactor = 1.0 / zoom;
    let cropWidth, cropHeight;
    
    // Get the actual image dimensions (not the displayed size)
    const displayRatio = imgRect.width / imgRect.height;
    const actualRatio = imagePreview.naturalWidth / imagePreview.naturalHeight;
    
    // Calculate based on actual image ratio
    if (actualRatio >= targetRatio) {
        // Image is wider than target ratio
        cropHeight = imgRect.height * zoomFactor;
        cropWidth = cropHeight * targetRatio;
    } else {
        // Image is taller than target ratio
        cropWidth = imgRect.width * zoomFactor;
        cropHeight = cropWidth / targetRatio;
    }
    
    // Ensure exact ratio
    if (cropOrientation === 'portrait') {
        // Force 2:3 ratio
        cropHeight = cropWidth * 3 / 2;
    } else {
        // Force 3:2 ratio
        cropWidth = cropHeight * 3 / 2;
    }
    
    // Calculate position
    const centerX = imgRect.width * focusX;
    const centerY = imgRect.height * focusY;
    
    let left = centerX - cropWidth / 2;
    let top = centerY - cropHeight / 2;
    
    // Constrain to image bounds
    left = Math.max(0, Math.min(left, imgRect.width - cropWidth));
    top = Math.max(0, Math.min(top, imgRect.height - cropHeight));
    
    // If crop exceeds bounds, adjust
    if (left + cropWidth > imgRect.width) {
        cropWidth = imgRect.width - left;
        if (cropOrientation === 'portrait') {
            cropHeight = cropWidth * 3 / 2;
        } else {
            cropHeight = cropWidth * 2 / 3;
        }
    }
    
    if (top + cropHeight > imgRect.height) {
        cropHeight = imgRect.height - top;
        if (cropOrientation === 'portrait') {
            cropWidth = cropHeight * 2 / 3;
        } else {
            cropWidth = cropHeight * 3 / 2;
        }
    }
    
    // Update overlay
    cropOverlay.style.width = `${cropWidth}px`;
    cropOverlay.style.height = `${cropHeight}px`;
    cropOverlay.style.left = `${left}px`;
    cropOverlay.style.top = `${top}px`;
    
    // Debug info
    console.log(`Crop: ${cropWidth.toFixed(0)}x${cropHeight.toFixed(0)} (ratio: ${(cropWidth/cropHeight).toFixed(3)}), Target: ${targetRatio.toFixed(3)}`);
}

function processImage() {
    hideError();
    processingPanel.classList.remove('d-none');
    cropPanel.classList.add('d-none');
    
    const data = {
        filename: currentFilename,
        focus_x: parseFloat(focusXSlider.value),
        focus_y: parseFloat(focusYSlider.value),
        zoom: parseFloat(zoomSlider.value),
        orientation: cropOrientation
    };
    
    fetch('/process', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        processingPanel.classList.add('d-none');
        
        if (data.error) {
            showError(data.error);
            cropPanel.classList.remove('d-none');
            return;
        }
        
        displayProcessedInfo(data);
    })
    .catch(error => {
        processingPanel.classList.add('d-none');
        cropPanel.classList.remove('d-none');
        showError('Processing failed: ' + error.message);
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
        </table>
    `;
    
    // Store the output filename for download
    saveToPhotosBtn.dataset.filename = data.output_filename;
    
    resultsPanel.classList.remove('d-none');
}

function downloadProcessedImage() {
    const filename = saveToPhotosBtn.dataset.filename;
    if (!filename) return;
    
    // Try native share for mobile
    if (navigator.share) {
        fetch(`/download/${filename}`)
            .then(response => response.blob())
            .then(blob => {
                const file = new File([blob], filename, { type: blob.type });
                return navigator.share({
                    title: 'Cropped Image',
                    files: [file]
                });
            })
            .catch(error => {
                // Fallback to download
                window.location.href = `/download/${filename}`;
            });
    } else {
        window.location.href = `/download/${filename}`;
    }
}

function resetControls() {
    zoomSlider.value = '1';
    focusXSlider.value = '0.5';
    focusYSlider.value = '0.5';
    document.getElementById('portrait').checked = true;
    cropOrientation = 'portrait';
    updateCropOverlay();
}

function resetApplication() {
    // Clean up files
    if (currentFilename) {
        fetch('/cleanup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filenames: [currentFilename]
            })
        });
    }
    
    // Reset UI
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

function showError(message) {
    errorMessage.textContent = message;
    errorAlert.classList.remove('d-none');
}

function hideError() {
    errorAlert.classList.add('d-none');
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (currentFilename) {
        // Use sendBeacon for cleanup on page unload
        const data = JSON.stringify({ filenames: [currentFilename] });
        navigator.sendBeacon('/cleanup', data);
    }
});