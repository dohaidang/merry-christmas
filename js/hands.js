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

    const video = document.getElementsByClassName('input_video')[0];
    const canvas = document.getElementById('camera-preview');
    const ctx = canvas.getContext('2d');
    
    // Check if MediaPipe is available
    if (typeof Hands === 'undefined') {
        showError('MediaPipe Not Loaded', 
            'MediaPipe Hands library failed to load. Please check your internet connection and refresh the page.');
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
        showError('Camera Utils Not Loaded', 
            'Camera utilities failed to load. Please check your internet connection and refresh the page.');
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
        showError('Camera Initialization Failed', 
            'Failed to initialize camera. Error: ' + e.message);
    }
}

