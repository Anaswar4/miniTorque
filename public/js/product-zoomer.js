// Enhanced Product Image Zoom Functionality for miniTorque
document.addEventListener('DOMContentLoaded', function() {
    // Initialize image magnifier functionality
    initImageMagnifier();
    
    // Handle thumbnail clicks
    initThumbnailGallery();
    
    // Initialize Bootstrap tabs
    initProductTabs();
});

/**
 * Professional Image Magnifier with lens effect
 */
function initImageMagnifier() {
    const mainImage = document.getElementById('mainImage');
    const zoomContainer = document.getElementById('zoomContainer');
    
    if (!mainImage || !zoomContainer) return;
    
    // Create magnifier glass element
    const magnifierGlass = document.createElement('div');
    magnifierGlass.classList.add('img-magnifier-glass');
    zoomContainer.appendChild(magnifierGlass);
    
    // Create zoomed result container
    const zoomResult = document.createElement('div');
    zoomResult.classList.add('img-zoom-result');
    zoomContainer.appendChild(zoomResult);
    
    let isActive = false;
    const magnificationLevel = 2.5;
    
    // Show magnifier glass and zoom result on mouseenter
    zoomContainer.addEventListener('mouseenter', function() {
        if (window.innerWidth > 768) { // Only on desktop
            magnifierGlass.style.display = 'block';
            zoomResult.style.display = 'block';
            isActive = true;
        }
    });
    
    // Hide magnifier glass and zoom result on mouseleave
    zoomContainer.addEventListener('mouseleave', function() {
        magnifierGlass.style.display = 'none';
        zoomResult.style.display = 'none';
        isActive = false;
    });
    
    // Update magnifier position on mousemove
    zoomContainer.addEventListener('mousemove', function(e) {
        if (!isActive || window.innerWidth <= 768) return;
        
        // Get cursor position
        const rect = zoomContainer.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        
        // Calculate magnifier glass position
        const glassWidth = magnifierGlass.offsetWidth / 2;
        const glassHeight = magnifierGlass.offsetHeight / 2;
        
        let glassX = cursorX - glassWidth;
        let glassY = cursorY - glassHeight;
        
        // Constrain magnifier glass to image boundaries
        if (glassX < 0) glassX = 0;
        if (glassY < 0) glassY = 0;
        if (glassX > rect.width - magnifierGlass.offsetWidth) {
            glassX = rect.width - magnifierGlass.offsetWidth;
        }
        if (glassY > rect.height - magnifierGlass.offsetHeight) {
            glassY = rect.height - magnifierGlass.offsetHeight;
        }
        
        // Position magnifier glass
        magnifierGlass.style.left = glassX + 'px';
        magnifierGlass.style.top = glassY + 'px';
        
        // Calculate relative position for background image
        const percentX = (cursorX / rect.width) * 100;
        const percentY = (cursorY / rect.height) * 100;
        
        // Update magnifier glass background
        magnifierGlass.style.backgroundImage = `url('${mainImage.src}')`;
        magnifierGlass.style.backgroundSize = `${rect.width * magnificationLevel}px ${rect.height * magnificationLevel}px`;
        magnifierGlass.style.backgroundPosition = `${percentX}% ${percentY}%`;
        
        // Update zoom result display
        zoomResult.style.backgroundImage = `url('${mainImage.src}')`;
        zoomResult.style.backgroundSize = `${rect.width * magnificationLevel}px ${rect.height * magnificationLevel}px`;
        zoomResult.style.backgroundPosition = `${percentX}% ${percentY}%`;
    });
    
    // Mobile touch handling
    let touchActive = false;
    
    zoomContainer.addEventListener('touchstart', function(e) {
        if (window.innerWidth <= 768) {
            e.preventDefault();
            touchActive = !touchActive;
            
            if (touchActive) {
                magnifierGlass.style.display = 'block';
                zoomResult.style.display = 'block';
                updateTouchZoom(e.touches[0]);
            } else {
                magnifierGlass.style.display = 'none';
                zoomResult.style.display = 'none';
            }
        }
    });
    
    zoomContainer.addEventListener('touchmove', function(e) {
        if (touchActive && window.innerWidth <= 768) {
            e.preventDefault();
            updateTouchZoom(e.touches[0]);
        }
    });
    
    zoomContainer.addEventListener('touchend', function(e) {
        if (window.innerWidth <= 768 && !touchActive) {
            magnifierGlass.style.display = 'none';
            zoomResult.style.display = 'none';
        }
    });
    
    function updateTouchZoom(touch) {
        const rect = zoomContainer.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        
        // Simulate a mousemove event
        const simulatedMouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        
        zoomContainer.dispatchEvent(simulatedMouseEvent);
    }
}

/**
 * Thumbnail Gallery Functionality
 */
function initThumbnailGallery() {
    const thumbnails = document.querySelectorAll('.thumbnail');
    
    thumbnails.forEach(thumbnail => {
        thumbnail.addEventListener('click', function() {
            // Extract image URL from onclick attribute
            const onclickAttr = this.getAttribute('onclick');
            const imageSrc = onclickAttr.match(/'([^']+)'/)[1];
            changeImage(this, imageSrc);
            
            // Reset zoom elements when changing image
            resetZoomElements();
        });
        
        // Add keyboard support
        thumbnail.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
    });
}

/**
 * Reset zoom elements when changing images
 */
function resetZoomElements() {
    const zoomContainer = document.getElementById('zoomContainer');
    if (zoomContainer) {
        const magnifierGlass = zoomContainer.querySelector('.img-magnifier-glass');
        const zoomResult = zoomContainer.querySelector('.img-zoom-result');
        
        if (magnifierGlass) magnifierGlass.style.display = 'none';
        if (zoomResult) zoomResult.style.display = 'none';
    }
}

/**
 * Product Tabs Initialization
 */
function initProductTabs() {
    const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]');
    
    if (tabEls.length > 0) {
        // Check if Bootstrap 5 is loaded
        if (typeof bootstrap !== 'undefined' && bootstrap.Tab) {
            tabEls.forEach(tabEl => {
                new bootstrap.Tab(tabEl);
            });
        } else {
            // Fallback - manual tab handling
            tabEls.forEach(tabEl => {
                tabEl.addEventListener('click', function(event) {
                    event.preventDefault();
                    
                    // Remove active class from all tabs and tab panes
                    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(el => {
                        el.classList.remove('show', 'active');
                    });
                    
                    // Add active class to clicked tab
                    this.classList.add('active');
                    
                    // Get the target tab pane and make it active
                    const target = document.querySelector(this.getAttribute('data-bs-target'));
                    if (target) {
                        target.classList.add('show', 'active');
                    }
                });
            });
        }
    }
}

/**
 * Image Change Function
 */
function changeImage(thumbnail, imageSrc) {
    const mainImage = document.getElementById('mainImage');
    if (mainImage) {
        mainImage.src = imageSrc;
    }
    
    // Update thumbnail active state
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach(thumb => thumb.classList.remove('active'));
    thumbnail.classList.add('active');
}

/**
 * Quantity Selector Functions 
 */
function incrementQuantity() {
    const quantityInput = document.getElementById('quantity');
    if (quantityInput) {
        const currentValue = parseInt(quantityInput.value);
        const maxValue = parseInt(quantityInput.getAttribute('max'));
        if (currentValue < maxValue) {
            quantityInput.value = currentValue + 1;
        }
    }
}

function decrementQuantity() {
    const quantityInput = document.getElementById('quantity');
    if (quantityInput) {
        const currentValue = parseInt(quantityInput.value);
        if (currentValue > 1) {
            quantityInput.value = currentValue - 1;
        }
    }
}

/**
 * Utility Functions
 */

// Handle window resize to adjust zoom behavior
window.addEventListener('resize', function() {
    resetZoomElements();
});

// Preload images for better performance
function preloadImages() {
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach(thumbnail => {
        const img = new Image();
        const onclickAttr = thumbnail.getAttribute('onclick');
        if (onclickAttr) {
            const imageSrc = onclickAttr.match(/'([^']+)'/);
            if (imageSrc && imageSrc[1]) {
                img.src = imageSrc[1];
            }
        }
    });
}

// Initialize preloading after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(preloadImages, 1000); // Delay to not interfere with main loading
});

