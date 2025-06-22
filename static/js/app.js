// Professional Image Cropper - Client-side JavaScript

class ImageCropper {
    constructor() {
        this.currentFile = null;
        this.currentFilename = null;
        this.currentPreviewFilename = null;
        this.outputFilename = null;
        this.focusX = 0.5;
        this.focusY = 0.5;
        this.zoom = 1.0;
        this.orientation = 'portrait';
        this.imageAspectRatio = 1;
        
        this.initializeElements();
        this.setupEventListeners();
    }
    
    initializeElements() {
        // Get DOM elements
        this.fileInput = document.getElementById('file-input');
        this.cameraInput = document.getElementById('camera-input');
        this.uploadProgress = document.getElementById('upload-progress');
        this.progressBar = document.getElementById('progress-bar');
        
        this.imageInfoPanel = document.getElementById('image-info-panel');
        this.imageInfo = document.getElementById('image-info');
        this.qualityIndicators = document.getElementById('quality-indicators');
        
        this.cropPanel = document.getElementById('crop-panel');
        this.imagePreview = document.getElementById('image-preview');
        this.cropOverlay = document.getElementById('crop-overlay');
        
        // Controls
        this.orientationInputs = document.querySelectorAll('input[name="orientation"]');
        this.zoomSlider = document.getElementById('zoom-slider');
        this.zoomValue = document.getElementById('zoom-value');
        this.focusXSlider = document.getElementById('focus-x-slider');
        this.focusYSlider = document.getElementById('focus-y-slider');
        this.processBtn = document.getElementById('process-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.reloadBtn = document.getElementById('reload-btn');
        
        this.processingPanel = document.getElementById('processing-panel');
        this.resultsPanel = document.getElementById('results-panel');
        this.processedInfo = document.getElementById('processed-info');
        this.saveToPhotosBtn = document.getElementById('save-to-photos-btn');
        this.newImageBtn = document.getElementById('new-image-btn');
        
        this.errorAlert = document.getElementById('error-alert');
        this.errorMessage = document.getElementById('error-message');
    }
    
    setupEventListeners() {
        // File upload events
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.cameraInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Crop controls
        this.orientationInputs.forEach(input => {
            input.addEventListener('change', (e) => this.updateOrientation(e));
        });
        this.zoomSlider.addEventListener('input', (e) => this.updateZoom(e));
        this.focusXSlider.addEventListener('input', (e) => this.updateFocusX(e));
        this.focusYSlider.addEventListener('input', (e) => this.updateFocusY(e));
        this.processBtn.addEventListener('click', () => this.processImage());
        this.resetBtn.addEventListener('click', () => this.resetControls());
        this.reloadBtn.addEventListener('click', () => window.location.reload());
        
        // Action buttons
        this.saveToPhotosBtn.addEventListener('click', () => this.downloadProcessedImage());
        this.newImageBtn.addEventListener('click', () => this.resetApplication());
        
        // Window resize
        window.addEventListener('resize', () => {
            if (this.imagePreview.complete) {
                this.updateCropOverlay();
            }
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (this.currentFilename) {
                const data = JSON.stringify({ filenames: [this.currentFilename] });
                navigator.sendBeacon('/cleanup', data);
            }
        });
    }

    
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        const validTypes = ['image/tiff', 'image/tif', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        const validExtensions = /\.(tiff?|png|jpe?g|webp)$/i;
        
        const hasValidType = validTypes.includes(file.type) || file.type.startsWith('image/');
        const hasValidExtension = file.name.toLowerCase().match(validExtensions);
        
        if (!hasValidType && !hasValidExtension) {
            this.showError('Please select a TIFF, PNG, JPEG, or WebP image file.');
            return;
        }

        // Validate file size (500MB limit)
        const maxSize = 500 * 1024 * 1024;
        if (file.size > maxSize) {
            this.showError('File size exceeds 500MB limit');
            return;
        }

        this.hideError();
        this.uploadFile(file);
    }

    async uploadFile(file) {
        try {
            // Show upload progress
            this.uploadProgress.classList.remove('d-none');
            this.progressBar.style.width = '0%';

            const formData = new FormData();
            formData.append('file', file);

            // Simulate progress
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += 10;
                this.progressBar.style.width = `${Math.min(progress, 90)}%`;
            }, 100);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            clearInterval(progressInterval);
            this.progressBar.style.width = '100%';
            
            const data = await response.json();
            
            setTimeout(() => {
                this.uploadProgress.classList.add('d-none');
                
                if (data.error) {
                    this.showError(data.error);
                    return;
                }

                this.currentFilename = data.filename;
                this.currentPreviewFilename = data.preview_filename || data.filename;
                this.displayImageInfo(data.image_info);
                this.displayQualityIndicators(data.image_info);
                this.loadImagePreview();
            }, 500);

        } catch (error) {
            this.uploadProgress.classList.add('d-none');
            this.showError('Upload failed: ' + error.message);
        }
    }

    displayImageInfo(info) {
        const colorProfileBadge = this.getColorProfileBadge(info.color_profile_type);
        
        const infoHtml = `
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
        
        this.imageInfo.innerHTML = infoHtml;
        this.imageInfoPanel.classList.remove('d-none');
        this.imageAspectRatio = info.aspect_ratio;
    }

    getColorProfileBadge(profileType) {
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

    displayQualityIndicators(info) {
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
        
        this.qualityIndicators.innerHTML = indicators.join('');
        feather.replace();
    }

    loadImagePreview() {
        this.imagePreview.src = `/preview/${this.currentPreviewFilename}`;
        this.imagePreview.onload = () => {
            this.cropPanel.classList.remove('d-none');
            this.updateCropOverlay();
        };
    }

    updateOrientation(e) {
        this.orientation = e.target.value;
        this.updateCropOverlay();
    }

    updateZoom(e) {
        this.zoom = parseFloat(e.target.value);
        this.zoomValue.textContent = this.zoom.toFixed(1);
        this.updateCropOverlay();
    }

    updateFocusX(e) {
        this.focusX = parseFloat(e.target.value);
        this.updateCropOverlay();
    }

    updateFocusY(e) {
        this.focusY = parseFloat(e.target.value);
        this.updateCropOverlay();
    }

    updateCropOverlay() {
        const imgRect = this.imagePreview.getBoundingClientRect();
        const targetRatio = this.orientation === 'portrait' ? 2/3 : 3/2;
        
        // Calculate crop dimensions with proper zoom handling
        const zoomFactor = 1.0 / this.zoom;
        let cropWidth, cropHeight;
        
        if (this.imageAspectRatio >= targetRatio) {
            cropHeight = imgRect.height * zoomFactor;
            cropWidth = cropHeight * targetRatio;
        } else {
            cropWidth = imgRect.width * zoomFactor;
            cropHeight = cropWidth / targetRatio;
        }
        
        // Calculate position
        const centerX = imgRect.width * this.focusX;
        const centerY = imgRect.height * this.focusY;
        
        let left = centerX - cropWidth / 2;
        let top = centerY - cropHeight / 2;
        
        // Constrain to image bounds
        left = Math.max(0, Math.min(left, imgRect.width - cropWidth));
        top = Math.max(0, Math.min(top, imgRect.height - cropHeight));
        
        // Update overlay
        this.cropOverlay.style.width = `${cropWidth}px`;
        this.cropOverlay.style.height = `${cropHeight}px`;
        this.cropOverlay.style.left = `${left}px`;
        this.cropOverlay.style.top = `${top}px`;
    }

    async processImage() {
        try {
            this.hideError();
            this.processingPanel.classList.remove('d-none');
            this.cropPanel.classList.add('d-none');
            
            const data = {
                filename: this.currentFilename,
                focus_x: this.focusX,
                focus_y: this.focusY,
                zoom: this.zoom,
                orientation: this.orientation
            };
            
            const response = await fetch('/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            this.processingPanel.classList.add('d-none');
            
            if (result.error) {
                this.showError(result.error);
                this.cropPanel.classList.remove('d-none');
                return;
            }
            
            this.displayProcessedInfo(result);
            
        } catch (error) {
            this.processingPanel.classList.add('d-none');
            this.cropPanel.classList.remove('d-none');
            this.showError('Processing failed: ' + error.message);
        }
    }

    displayProcessedInfo(data) {
        const info = data.processed_info;
        const colorProfileBadge = this.getColorProfileBadge(info.color_profile_type);
        
        const processedHtml = `
            <table class="table table-sm">
                <tr><td><strong>Format:</strong></td><td>${info.format}</td></tr>
                <tr><td><strong>Dimensions:</strong></td><td>${info.width} × ${info.height}px</td></tr>
                <tr><td><strong>Aspect Ratio:</strong></td><td>${info.aspect_ratio} (${this.orientation})</td></tr>
                <tr><td><strong>Color Profile:</strong></td><td>${colorProfileBadge}</td></tr>
                <tr><td><strong>File Size:</strong></td><td>${info.file_size_human}</td></tr>
            </table>
        `;
        
        this.processedInfo.innerHTML = processedHtml;
        
        // Store the output filename
        this.outputFilename = data.output_filename;
        this.saveToPhotosBtn.dataset.filename = data.output_filename;
        
        this.resultsPanel.classList.remove('d-none');
    }

    async downloadProcessedImage() {
        const filename = this.outputFilename || this.saveToPhotosBtn.dataset.filename;
        if (!filename) return;
        
        // Try native share first for mobile devices
        if (navigator.share) {
            try {
                const response = await fetch(`/download/${filename}`);
                const blob = await response.blob();
                const file = new File([blob], filename, { type: blob.type });
                
                await navigator.share({
                    title: 'Cropped Image',
                    files: [file]
                });
                return;
            } catch (error) {
                console.log('Native share failed, falling back to download:', error);
            }
        }
        
        // Fallback to direct download
        window.location.href = `/download/${filename}`;
    }

    resetControls() {
        this.zoom = 1.0;
        this.focusX = 0.5;
        this.focusY = 0.5;
        this.orientation = 'portrait';
        
        this.zoomSlider.value = '1';
        this.focusXSlider.value = '0.5';
        this.focusYSlider.value = '0.5';
        document.getElementById('portrait').checked = true;
        
        this.updateCropOverlay();
    }

    async resetApplication() {
        // Clean up files
        if (this.currentFilename) {
            try {
                await fetch('/cleanup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filenames: [this.currentFilename]
                    })
                });
            } catch (error) {
                console.warn('Cleanup failed:', error);
            }
        }
        
        // Reset state
        this.currentFile = null;
        this.currentFilename = null;
        this.currentPreviewFilename = null;
        this.outputFilename = null;
        this.fileInput.value = '';
        this.cameraInput.value = '';
        this.imageInfoPanel.classList.add('d-none');
        this.cropPanel.classList.add('d-none');
        this.resultsPanel.classList.add('d-none');
        this.resetControls();
        this.hideError();
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorAlert.classList.remove('d-none');
    }

    hideError() {
        this.errorAlert.classList.add('d-none');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.imageCropper = new ImageCropper();
});<tr><td><strong>Format:</strong></td><td>${info.format}</td></tr>
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
    
    window.location.href = `/download/${filename}`;
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