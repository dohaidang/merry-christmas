// ==========================================
// HAND TRACKING
// ==========================================
async function startSystem() {
    if (hasError) return;
    if (isSystemStarted) return;
    
    isSystemStarted = true;
    document.getElementById('btnStart').style.display = 'none';
    document.getElementById('toggle-controls').style.display = 'flex';
    
    // Try to play music
    try {
        await bgMusic.play();
    } catch (e) {
        console.warn('Audio autoplay blocked:', e);
    }
    
    init3D();

    // Initialize touch gestures for mobile
    if (CONFIG.isMobile) {
        initTouchGestures();
    }

    const video = document.getElementsByClassName('input_video')[0];
    const canvas = document.getElementById('camera-preview');
    const ctx = canvas.getContext('2d');
    
    // On mobile, skip camera if not available (use touch instead)
    if (CONFIG.isMobile) {
        // Try to start camera, but don't show error if it fails
        startCameraHandTracking(video, canvas, ctx);
        return;
    }
    
    // Desktop: require camera
    startCameraHandTracking(video, canvas, ctx);
}

function startCameraHandTracking(video, canvas, ctx) {
    // Check if MediaPipe is available
    if (typeof Hands === 'undefined') {
        if (!CONFIG.isMobile) {
            showError('MediaPipe Not Loaded', 
                'MediaPipe Hands library failed to load. Please check your internet connection and refresh the page.');
        }
        return;
    }

    let hands;
    try {
        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        hands.setOptions({ 
            maxNumHands: 2, 
            modelComplexity: 1, 
            minDetectionConfidence: 0.5, 
            minTrackingConfidence: 0.5 
        });
    } catch (e) {
        showError('MediaPipe Initialization Failed', 
            'Failed to initialize hand tracking. Error: ' + e.message);
        return;
    }

    hands.onResults(results => {
        try {
            ctx.clearRect(0,0,100,75); 
            ctx.drawImage(results.image, 0, 0, 100, 75);

            if (results.multiHandLandmarks.length === 2) {
                const h1 = results.multiHandLandmarks[0]; 
                const h2 = results.multiHandLandmarks[1];
                const distIndex = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);
                const distThumb = Math.hypot(h1[4].x - h2[4].x, h1[4].y - h2[4].y);
                if (distIndex < 0.15 && distThumb < 0.15) {
                    state = 'HEART'; 
                    return;
                }
            }

            if(results.multiHandLandmarks.length > 0) {
                const lm = results.multiHandLandmarks[0];
                handX = lm[9].x; 
                const tips = [8,12,16,20]; 
                const wrist = lm[0];
                let openDist = 0; 
                tips.forEach(i => openDist += Math.hypot(lm[i].x-wrist.x, lm[i].y-wrist.y));
                const avgDist = openDist / 4;
                const pinchDist = Math.hypot(lm[4].x-lm[8].x, lm[4].y-lm[8].y);

                if (avgDist < 0.25) { 
                    state = 'TREE'; 
                } else if (pinchDist < 0.05) {
                    state = 'PHOTO'; 
                } else {
                    state = 'EXPLODE'; 
                }
            } else {
                state = 'TREE'; 
            }
        } catch (e) {
            console.error('Error processing hand results:', e);
        }
    });

    // Check if Camera is available
    if (typeof Camera === 'undefined') {
        if (!CONFIG.isMobile) {
            showError('Camera Utils Not Loaded', 
                'Camera utilities failed to load. Please check your internet connection and refresh the page.');
        }
        return;
    }

    let cameraUtils;
    try {
        cameraUtils = new Camera(video, {
            onFrame: async () => { 
                try {
                    await hands.send({image: video}); 
                } catch (e) {
                    console.error('Error sending frame to MediaPipe:', e);
                }
            }, 
            width: 320, 
            height: 240
        });
        
        cameraUtils.start().catch(error => {
            console.error('Camera error:', error);
            // On mobile, don't show error - use touch gestures instead
            if (CONFIG.isMobile) {
                console.log('Camera not available on mobile, using touch gestures');
                const cameraPreview = document.getElementById('camera-preview');
                if (cameraPreview) {
                    cameraPreview.classList.add('no-camera');
                }
                return;
            }
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                showError('Camera Permission Denied', 
                    'Please allow camera access to use hand tracking features. You can still view the 3D scene without camera.');
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                showError('No Camera Found', 
                    'No camera device found. You can still view the 3D scene, but hand tracking will not work.');
            } else {
                showError('Camera Error', 
                    'Failed to access camera: ' + error.message + '. You can still view the 3D scene.');
            }
        });
    } catch (e) {
        if (!CONFIG.isMobile) {
            showError('Camera Initialization Failed', 
                'Failed to initialize camera. Error: ' + e.message);
        }
    }
}

// ==========================================
// TOUCH GESTURES FOR MOBILE
// ==========================================
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let lastTapTime = 0;
let tapCount = 0;
let longPressTimer = null;
let initialDistance = 0;

function initTouchGestures() {
    const canvas = document.getElementById('canvas-container');
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
}

function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        
        // Double tap detection
        const currentTime = Date.now();
        const timeDiff = currentTime - lastTapTime;
        if (timeDiff < 300 && timeDiff > 0) {
            tapCount++;
        } else {
            tapCount = 1;
        }
        lastTapTime = currentTime;
        
        // Long press timer
        longPressTimer = setTimeout(() => {
            resetScene();
        }, 1000);
    } else if (e.touches.length === 2) {
        // Two finger - prepare for pinch
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    
    // Cancel long press if moved
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    // Two finger pinch
    if (e.touches.length === 2 && state === 'PHOTO') {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        
        if (initialDistance > 0) {
            const scale = distance / initialDistance;
            // You can implement zoom here if needed
        }
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    
    // Cancel long press
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    
    if (e.changedTouches.length === 0) return;
    
    const touch = e.changedTouches[0];
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;
    const touchDuration = Date.now() - touchStartTime;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Double tap
    if (tapCount === 2) {
        if (state === 'EXPLODE' || state === 'PHOTO') {
            state = 'PHOTO';
        }
        tapCount = 0;
        return;
    }
    
    // Single tap
    if (tapCount === 1 && touchDuration < 300 && distance < 50) {
        setTimeout(() => {
            if (tapCount === 1) {
                // Toggle between TREE and EXPLODE
                if (state === 'TREE') {
                    state = 'EXPLODE';
                } else if (state === 'EXPLODE') {
                    state = 'TREE';
                } else if (state === 'PHOTO') {
                    state = 'EXPLODE';
                }
            }
        }, 300);
    }
    
    // Swipe detection
    if (distance > 50 && touchDuration < 300) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            if (deltaX > 0) {
                changePhoto('next');
            } else {
                changePhoto('prev');
            }
        } else {
            // Vertical swipe
            if (deltaY < 0) {
                state = 'HEART';
            }
        }
    }
    
    tapCount = 0;
    initialDistance = 0;
}

