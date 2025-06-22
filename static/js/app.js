// Professional Image Cropper - Client-side JavaScript

class ImageCropper {
    constructor() {
        this.currentFile = null;
        this.currentFilename = null;
        this.focusX = 0.5;
        this.focusY = 0.5;
        this.zoom = 1.0;
        this.orientation = 'portrait';
        
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
        
        // New controls
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
        // File upload events - direct input handling
        this.fileInput.addEventListener('change', (e) => {
            console.log('File input changed (browse)');
            this.handleFileSelect(e);
        });
        this.cameraInput.addEventListener('change', (e) => {
            console.log('Camera input changed');
            this.handleFileSelect(e);
        });
        
        // Crop controls
        this.orientationInputs.forEach(input => {
            input.addEventListener('change', (e) => this.updateOrientation(e));
        });
        this.zoomSlider.addEventListener('input', (e) => this.updateZoom(e));
        this.focusXSlider.addEventListener('input', (e) => this.updateFocusX(e));
        this.focusYSlider.addEventListener('input', (e) => this.updateFocusY(e));
        this.processBtn.addEventListener('click', () => this.processImage());
        this.resetBtn.addEventListener('click', () => this.resetInterface());
        this.reloadBtn.addEventListener('click', () => window.location.reload());
        
        // Action buttons
        this.saveToPhotosBtn.addEventListener('click', () => this.saveToPhotos());
        this.newImageBtn.addEventListener('click', () => this.resetInterface());
    }
    
    handleFileSelect(e) {
        console.log('File select event triggered');
        const files = e.target.files;
        console.log('Files selected:', files.length);
        
        if (files && files.length > 0) {
            const file = files[0];
            console.log('Selected file:', file.name, file.size, file.type);
            this.uploadFile(file);
        } else {
            console.log('No files selected');
        }
    }
    
    async uploadFile(file) {
        try {
            console.log('Starting upload for file:', file.name, 'Size:', file.size, 'Type:', file.type);
            
            // Validate file type - be more permissive with MIME types as browsers/devices vary
            const validTypes = [
                'image/tiff', 'image/tif', 'image/png', 'image/jpeg', 'image/jpg', 
                'image/pjpeg', 'image/x-png', 'image/x-tiff', ''  // Include empty type for some devices
            ];
            const validExtensions = /\.(tiff?|png|jpe?g)$/i;
            
            const hasValidType = validTypes.includes(file.type) || file.type.startsWith('image/');
            const hasValidExtension = file.name.toLowerCase().match(validExtensions);
            
            if (!hasValidType && !hasValidExtension) {
                this.showError('Please select a TIFF, PNG, or JPEG image file.');
                return;
            }
            
            // Validate file size (500MB limit)
            if (file.size > 500 * 1024 * 1024) {
                this.showError('File size must be less than 500MB.');
                return;
            }
            
            this.currentFile = file;
            this.hideError();
            this.showUploadProgress();
            
            // Prepare form data
            const formData = new FormData();
            formData.append('file', file);
            
            console.log('Sending upload request...');
            
            // Upload file
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            console.log('Upload response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Upload result:', result);
            
            if (result.success) {
                this.currentFilename = result.filename;
                this.hideUploadProgress();
                this.displayImageInfo(result.image_info);
                await this.loadImagePreview();
            } else {
                throw new Error(result.error || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            this.hideUploadProgress();
            this.showError(`Upload failed: ${error.message}`);
        }
    }
    
    showUploadProgress() {
        this.uploadProgress.classList.remove('d-none');
        this.progressBar.style.width = '100%';
    }
    
    hideUploadProgress() {
        this.uploadProgress.classList.add('d-none');
        this.progressBar.style.width = '0%';
    }
    
    displayImageInfo(info) {
        // Build image info display
        const infoItems = [
            { label: 'Format', value: info.format },
            { label: 'Dimensions', value: `${info.width} × ${info.height}` },
            { label: 'Aspect Ratio', value: info.aspect_ratio },
            { label: 'Color Type', value: info.color_type },
            { label: 'Bit Depth', value: `${info.bit_depth}-bit` },
            { label: 'File Size', value: info.file_size_human },
            { label: 'Color Profile', value: info.color_profile }
        ];
        
        let infoHtml = '';
        infoItems.forEach(item => {
            infoHtml += `
                <div class="info-item">
                    <span class="info-label">${item.label}:</span>
                    <span class="info-value">${item.value}</span>
                </div>
            `;
        });
        
        this.imageInfo.innerHTML = infoHtml;
        
        // Generate quality indicators
        this.generateQualityIndicators(info);
        
        // Show info panel
        this.imageInfoPanel.classList.remove('d-none');
        this.imageInfoPanel.classList.add('fade-in');
    }
    
    generateQualityIndicators(info) {
        let indicators = [];
        
        // Bit depth indicator
        if (info.bit_depth === 16) {
            indicators.push({ text: '16-bit High Quality', class: 'quality-high' });
        } else if (info.bit_depth === 8) {
            indicators.push({ text: '8-bit Standard', class: 'quality-medium' });
        }
        
        // Format indicator
        if (info.format === 'TIFF') {
            indicators.push({ text: 'Professional TIFF', class: 'quality-high' });
        } else if (info.format === 'PNG') {
            indicators.push({ text: 'Lossless PNG', class: 'quality-high' });
        } else if (info.format === 'JPEG') {
            indicators.push({ text: 'JPEG Compressed', class: 'quality-medium' });
        }
        
        // Color profile indicator
        if (info.color_profile && info.color_profile !== 'None') {
            indicators.push({ text: 'Color Managed', class: 'quality-high' });
        }
        
        // File size indicator
        if (info.file_size > 50 * 1024 * 1024) { // > 50MB
            indicators.push({ text: 'Large File', class: 'quality-high' });
        }
        
        let indicatorsHtml = '<h6 class="mb-2">Quality Indicators</h6>';
        indicators.forEach(indicator => {
            indicatorsHtml += `
                <span class="quality-indicator ${indicator.class}">
                    ${indicator.text}
                </span>
            `;
        });
        
        this.qualityIndicators.innerHTML = indicatorsHtml;
    }
    
    async loadImagePreview() {
        try {
            console.log('Loading preview for:', this.currentFilename);
            this.imagePreview.src = `/preview/${this.currentFilename}`;
            
            return new Promise((resolve, reject) => {
                this.imagePreview.onload = () => {
                    console.log('Preview loaded successfully');
                    this.cropPanel.classList.remove('d-none');
                    this.cropPanel.classList.add('fade-in');
                    setTimeout(() => this.updateCropOverlay(), 100);
                    resolve();
                };
                
                this.imagePreview.onerror = (error) => {
                    console.error('Preview load error:', error);
                    reject(new Error('Failed to load image preview'));
                };
            });
        } catch (error) {
            console.error('Preview error:', error);
            this.showError('Failed to load image preview');
        }
    }
    
    updateOrientation(e) {
        this.orientation = e.target.value;
        this.updateCropOverlay();
    }
    
    updateZoom(e) {
        // Invert zoom for proper cropping inside the image
        // When slider is at 1.0, we want zoom=1.0 (fit image)
        // When slider is at 5.0, we want zoom=0.2 (very zoomed in)
        const sliderValue = parseFloat(e.target.value);
        this.zoom = 1.0 / sliderValue;
        this.zoomValue.textContent = sliderValue.toFixed(1);
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
        // This is a visual representation - actual cropping happens on server
        const img = this.imagePreview;
        if (!img.complete) return;
        
        const containerRect = img.getBoundingClientRect();
        const imgAspectRatio = img.naturalWidth / img.naturalHeight;
        
        // Get target ratio based on orientation
        const targetRatio = this.orientation === 'portrait' ? 2/3 : 3/2;
        
        let cropWidth, cropHeight, cropLeft, cropTop;
        
        // Apply zoom factor
        const zoomedWidth = containerRect.width * this.zoom;
        const zoomedHeight = containerRect.height * this.zoom;
        
        if (imgAspectRatio > targetRatio) {
            // Image is wider than target ratio, crop horizontally
            cropHeight = zoomedHeight;
            cropWidth = cropHeight * targetRatio;
            cropLeft = (containerRect.width - cropWidth) * this.focusX;
            cropTop = (containerRect.height - cropHeight) * this.focusY;
        } else {
            // Image is taller than target ratio, crop vertically
            cropWidth = zoomedWidth;
            cropHeight = cropWidth / targetRatio;
            cropLeft = (containerRect.width - cropWidth) * this.focusX;
            cropTop = (containerRect.height - cropHeight) * this.focusY;
        }
        
        // Ensure crop area stays within image bounds
        cropLeft = Math.max(0, Math.min(cropLeft, containerRect.width - cropWidth));
        cropTop = Math.max(0, Math.min(cropTop, containerRect.height - cropHeight));
        
        // Update overlay position (relative to container)
        this.cropOverlay.style.width = `${Math.min(cropWidth, containerRect.width)}px`;
        this.cropOverlay.style.height = `${Math.min(cropHeight, containerRect.height)}px`;
        this.cropOverlay.style.left = `${cropLeft}px`;
        this.cropOverlay.style.top = `${cropTop}px`;
    }
    
    async processImage() {
        try {
            this.hideError();
            this.processingPanel.classList.remove('d-none');
            this.processBtn.disabled = true;
            
            console.log('Starting image processing...');
            
            // Add timeout to prevent freezing
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch('/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: this.currentFilename,
                    focus_x: this.focusX,
                    focus_y: this.focusY,
                    zoom: this.zoom,
                    orientation: this.orientation
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Processing failed with status ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Processing result:', result);
            
            if (result.success) {
                this.processingPanel.classList.add('d-none');
                this.displayResults(result);
            } else {
                throw new Error(result.error || 'Processing failed');
            }
            
        } catch (error) {
            console.error('Processing error:', error);
            this.processingPanel.classList.add('d-none');
            this.processBtn.disabled = false;
            
            if (error.name === 'AbortError') {
                this.showError('Processing timed out. Please try again with a smaller image or lower zoom level.');
            } else {
                this.showError(`Processing failed: ${error.message}`);
            }
        }
    }
    
    displayResults(result) {
        this.outputFilename = result.output_filename;
        
        // Display processed image info
        const info = result.processed_info;
        const infoItems = [
            { label: 'New Dimensions', value: `${info.width} × ${info.height}` },
            { label: 'Aspect Ratio', value: info.aspect_ratio },
            { label: 'File Size', value: info.file_size_human },
            { label: 'Quality Preserved', value: info.bit_depth === 16 ? 'Yes (16-bit)' : 'Standard (8-bit)' }
        ];
        
        let infoHtml = '';
        infoItems.forEach(item => {
            infoHtml += `
                <div class="info-item">
                    <span class="info-label">${item.label}:</span>
                    <span class="info-value">${item.value}</span>
                </div>
            `;
        });
        
        this.processedInfo.innerHTML = infoHtml;
        
        // Show results panel
        this.resultsPanel.classList.remove('d-none');
        this.resultsPanel.classList.add('fade-in');
        
        // Hide crop panel
        this.cropPanel.classList.add('d-none');
    }
    
    async saveToPhotos() {
        if (!this.outputFilename) {
            this.showError('No processed image available');
            return;
        }

        try {
            // Get the image as a blob
            const response = await fetch(`/download/${this.outputFilename}`);
            const blob = await response.blob();
            
            // Try native iOS sharing first
            if (navigator.share) {
                const file = new File([blob], this.outputFilename, { type: blob.type });
                
                try {
                    await navigator.share({
                        title: 'Cropped Image',
                        text: 'Save cropped image',
                        files: [file]
                    });
                    return;
                } catch (shareError) {
                    console.log('Native share failed, trying fallback:', shareError);
                }
            }
            
            // Fallback: Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = this.outputFilename;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
        } catch (error) {
            this.showError('Failed to save image: ' + error.message);
        }
    }


    
    async resetInterface() {
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
        this.outputFilename = null;
        this.focusX = 0.5;
        this.focusY = 0.5;
        this.zoom = 1.0;
        this.orientation = 'portrait';
        
        // Reset UI
        this.fileInput.value = '';
        this.cameraInput.value = '';
        this.zoomSlider.value = '1';
        this.focusXSlider.value = '0.5';
        this.focusYSlider.value = '0.5';
        this.orientationInputs[0].checked = true; // Reset to portrait
        this.processBtn.disabled = false;
        
        // Hide panels
        this.imageInfoPanel.classList.add('d-none');
        this.cropPanel.classList.add('d-none');
        this.processingPanel.classList.add('d-none');
        this.resultsPanel.classList.add('d-none');
        this.hideError();
        
        // Reinitialize feather icons
        feather.replace();
    }
    
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorAlert.classList.remove('d-none');
        this.errorAlert.scrollIntoView({ behavior: 'smooth' });
        
        // Reset processing state in case of error
        this.processingPanel.classList.add('d-none');
        this.processBtn.disabled = false;
        
        feather.replace();
    }
    
    hideError() {
        this.errorAlert.classList.add('d-none');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.imageCropper = new ImageCropper();
});

// Handle window resize to update crop overlay
window.addEventListener('resize', () => {
    const cropper = window.imageCropper;
    if (cropper && cropper.imagePreview.complete) {
        cropper.updateCropOverlay();
    }
});
