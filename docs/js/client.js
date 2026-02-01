// Detect environment: Localhost vs Production (GitHub Pages)
const GAME_SERVER_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://fun.qrshotgame.fr";

const socket = io(GAME_SERVER_URL);
let globalZones = {};
let globalZoneCoords = {};
let globalPlayers = [];
let activeGameCode = null;

socket.on("connect_error", (err) => {
    console.error("Server Connection Failed:", err);
    if (typeof showFeedback === "function") {
        showFeedback("⚠️ SERVEUR HORS LIGNE (Allumez le PC !)", "red");
    }
});

// DOM Elements
const homeScreen = document.getElementById('page-home');
const gameScreen = document.getElementById('page-game');
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('camera-canvas');
const ctx = canvas.getContext('2d');
const fireBtn = document.getElementById('btn-fire');
const feedbackMsg = document.getElementById('feedback-msg');

// State
let myTeam = 'blue'; // Default for now
let isCameraReady = false;
let ammo = 6;
const MAX_AMMO = 6;

// --- NAVIGATION ---
const screens = {
    home: document.getElementById('page-home'),
    join: document.getElementById('page-join'),
    create: document.getElementById('page-create'),
    game: document.getElementById('page-game')
};

function showScreen(name) {
    Object.values(screens).forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    screens[name].classList.remove('hidden');
    screens[name].classList.add('active');
}

// HOME -> JOIN
document.getElementById('btn-goto-join').addEventListener('click', () => {
    showScreen('join');
});

// HOME -> CREATE
document.getElementById('btn-goto-create').addEventListener('click', () => {
    showScreen('create');
});

// BACK BUTTONS
document.getElementById('btn-back-home-1').addEventListener('click', () => showScreen('home'));
document.getElementById('btn-back-home-2').addEventListener('click', () => showScreen('home'));
// SCAN NEARBY (Home)
const scanBtn = document.getElementById('btn-scan-games');
if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
        scanBtn.innerText = 'Scanning...';
        try {
            const coords = await getCurrentLocation();
            socket.emit('req_nearby_games', coords);
        } catch (err) {
            console.error(err);
            alert("Impossible de scanner : GPS requis.");
            scanBtn.innerText = 'REFRESH';
            document.getElementById('nearby-results').innerHTML = '<small style="color:red">GPS Inaccessible</small>';
        }
    });
}

socket.on('res_nearby_games', (games) => {
    const list = document.getElementById('nearby-results');
    const scanBtn = document.getElementById('btn-scan-games');
    if (scanBtn) scanBtn.innerText = 'REFRESH';

    if (!games || games.length === 0) {
        list.innerHTML = '<small>Aucune partie trouvée à -20km.</small>';
        return;
    }

    list.innerHTML = '';
    games.forEach(g => {
        const div = document.createElement('div');
        div.className = 'lobby-item';
        div.style.marginBottom = '5px';
        div.style.padding = '5px';
        div.style.background = 'rgba(255,255,255,0.1)';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';

        div.innerHTML = `
            <div>
                <strong style="color:var(--neon-cyan)">${g.name || 'Mission'}</strong>
                <br>
                <small>${g.dist.toFixed(2)} km | ${g.count} Joueurs</small>
            </div>
            <button class="btn primary" style="padding:4px 8px; font-size:0.8rem;" onclick="joinFromLobby('${g.code}')">JOIN</button>
        `;
        list.appendChild(div);
    });
});

window.joinFromLobby = (code) => {
    showScreen('join');
    document.getElementById('join-code').value = code;
};

// GPS Helper
const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Combinaison GPS incompatible ou refusée"));
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    });
};

// iOS Compass Permission Helper
async function requestSensors() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
                console.log("Compass granted");
            } else {
                alert("Permission boussole refusée");
            }
        } catch (e) {
            console.error(e);
        }
    }
}

// CONFIRM JOIN
// CONFIRM JOIN
document.getElementById('btn-confirm-join').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.innerText = "Chargement...";

    // 1. Request Sensors (Must be first on click)
    await requestSensors();

    const code = document.getElementById('join-code').value.toUpperCase();
    const pseudo = document.getElementById('join-pseudo').value || 'Soldier';
    const team = document.getElementById('join-team').value;

    if (code.length !== 4) {
        alert("Code invalide (4 caractères)");
        btn.disabled = false;
        btn.innerText = "GO";
        return;
    }

    try {
        const coords = await getCurrentLocation();
        enterGame(pseudo, team, code, coords);
        // Do NOT re-enable, we change screen
    } catch (err) {
        console.error(err);
        alert("GPS REQUIS : Donnez l'accès à la localisation pour rejoindre.");
        btn.disabled = false;
        btn.innerText = "GO";
    }
});

// CONFIRM CREATE
// CONFIRM CREATE
// CHECK LIMITS FUNCTION (Global)
window.checkLimits = () => {
    const teams = parseInt(document.getElementById('create-teams').value) || 2;
    const maxP = parseInt(document.getElementById('create-max-players').value) || 2;
    const duration = parseInt(document.getElementById('create-duration').value) || 15;
    const resSection = document.getElementById('reservation-section');

    // Limits: Teams > 2 OR Players > 5 OR Duration > 30min
    if (teams > 2 || maxP > 5 || duration > 30) {
        resSection.classList.remove('hidden');
    } else {
        resSection.classList.add('hidden');
    }
};

// CONFIRM CREATE
document.getElementById('btn-confirm-create').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.innerText = "Création...";

    // 1. Request Sensors
    await requestSensors();

    const name = document.getElementById('create-name').value;
    const teams = parseInt(document.getElementById('create-teams').value);
    const maxPlayers = parseInt(document.getElementById('create-max-players').value);
    const duration = parseInt(document.getElementById('create-duration').value);
    const resCode = document.getElementById('create-res-code').value;

    // Client-side Validation of "Code Required" logic to warn user before server rejects
    if ((teams > 2 || maxPlayers > 5 || duration > 30) && (!resCode || resCode.trim() === "")) {
        alert("LIMITES DÉPASSÉES (Pack Gratuit)\n\nVous avez configuré:\n- " + teams + " Équipes (>2)\n- " + maxPlayers + " Joueurs (>5)\n- " + duration + " Min (>30)\n\nVeuillez entrer un CODE DE RÉSERVATION valide ou réduire les paramètres.");
        btn.disabled = false;
        btn.innerText = "Créer la Partie";
        return;
    }

    try {
        const coords = await getCurrentLocation();
        const isPlayer = document.getElementById('create-is-player').checked;

        // Admin creates game
        socket.emit('createGame', {
            name, teams, maxPlayers, duration, reservationCode: resCode,
            lat: coords.lat, lon: coords.lon
        }, (response) => {
            if (response.success) {
                alert("Partie créée ! Code: " + response.gameCode);

                if (isPlayer) {
                    // Creator joins as Player 1 (Red)
                    enterGame('Commander', 'red', response.gameCode, coords);
                } else {
                    // Creator joins as Spectator (Admin)
                    enterGame('Admin', 'spectator', response.gameCode, coords);
                }
            } else {
                alert("ERREUR CRÉATION: " + (response.msg || response.error));
                btn.disabled = false;
                btn.innerText = "Créer la Partie";
            }
        });
    } catch (err) {
        console.error(err);
        alert("ERREUR GPS : Impossible de créer la partie sans localisation.\nVérifiez vos permissions.");
        btn.disabled = false;
        btn.innerText = "Créer la Partie";
    }
});

let redScore = 0;
let blueScore = 0;
let redZones = 0;
let blueZones = 0;

function updateScoreBoard() {
    document.getElementById('score-red').innerHTML = `&nbsp;${redScore} <br> <small>🚩 ${redZones}</small>`;
    document.getElementById('score-blue').innerHTML = `&nbsp;${blueScore} <br> <small>🚩 ${blueZones}</small>`;
}

function enterGame(username, team, gameCode, coords) {
    activeGameCode = gameCode;
    showScreen('game');

    // iOS Compass Permission (User Interaction Required Here)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    // Logic is handled in startGpsTracking listener
                }
            })
            .catch(console.error);
    }

    startCamera();
    updateAmmoDisplay();

    // Join request
    socket.emit('joinGame', {
        username: username,
        team: team, // 'red', 'blue', or 'auto'
        gameCode: gameCode,
        lat: coords ? coords.lat : 0,
        lon: coords ? coords.lon : 0
    });

    // Set Game Code on HUD
    const codeDisplay = document.getElementById('game-code-display');
    if (codeDisplay) codeDisplay.innerText = `CODE: ${gameCode}`;

    // We wait for server to confirm team via 'assignedId' or 'playerList' before updateTeamDisplay
    // But we can set a temporary "Waiting..." state
    // Start REAL GPS Tracking
    startGpsTracking();
}

let myLat = 0;
let myLon = 0;
let currentHeading = 0;

function startGpsTracking() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((pos) => {
            myLat = pos.coords.latitude;
            myLon = pos.coords.longitude;
            socket.emit('updatePosition', { lat: myLat, lon: myLon });
        }, (err) => console.error(err), {
            enableHighAccuracy: true,
            maximumAge: 1000
        });
    }

    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (event) => {
            if (event.webkitCompassHeading) {
                currentHeading = event.webkitCompassHeading;
            } else if (event.alpha) {
                currentHeading = 360 - event.alpha;
            }
            // Update Map Rotation in real-time
            if (globalPlayers && globalPlayers.length > 0) updateMiniMap(globalPlayers);
        });
    }
}

// --- CAMERA & SCANNING ---
let detector = null;
let processingCanvas = null;
let processingCtx = null;

async function startCamera() {
    try {
        console.log("Requesting 720p Resolution for Output Speed...");
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 1280 }, // 720p is the sweet spot for web vision
                height: { ideal: 720 }
            }
        });
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.play();
        isCameraReady = true;

        // --- ZOOM LOGIC ---
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const settings = track.getSettings ? track.getSettings() : {};

        // Focus Logic (Try to force continuous focus)
        try {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            console.log("Focus mode enabled");
        } catch (err) {
            console.warn("Focus mode not supported");
        }

        const zoomContainer = document.getElementById('zoom-container');
        const zoomSlider = document.getElementById('zoom-slider');
        const zoomDisplay = document.getElementById('zoom-level-display');

        // Always show Zoom Slider (Native or Digital Fallback)
        zoomContainer.classList.remove('hidden');
        zoomContainer.classList.add('flex');

        let hasNativeZoom = false;

        if (capabilities.zoom) {
            // Native Zoom Supported
            hasNativeZoom = true;
            console.log("Native zoom supported");
            zoomSlider.min = capabilities.zoom.min;
            zoomSlider.max = capabilities.zoom.max;
            zoomSlider.step = capabilities.zoom.step || 0.1;
            zoomSlider.value = settings.zoom || 1;
        } else {
            // Digital Zoom Fallback (CSS)
            console.log("Native zoom missing, using Digital Zoom");
            zoomSlider.min = 1;
            zoomSlider.max = 5; // Limit digital zoom to 5x to avoid pixels
            zoomSlider.step = 0.1;
            zoomSlider.value = 1;
        }

        // Global variable for Debug Logic
        window.currentZoom = 1.0;

        zoomSlider.addEventListener('input', async (e) => {
            const zoomVal = parseFloat(e.target.value);
            window.currentZoom = zoomVal; // Update global state
            zoomDisplay.innerText = zoomVal.toFixed(1) + "x";

            if (hasNativeZoom) {
                try {
                    await track.applyConstraints({ advanced: [{ zoom: zoomVal }] });
                } catch (err) {
                    console.error("Zoom failed:", err);
                }
            } else {
                // Apply Digital Zoom via CSS
                video.style.transform = `scale(${zoomVal})`;
            }
        });

        // Init Aruco Detector
        if (typeof AR !== 'undefined') {
            detector = new AR.Detector();
            console.log("Aruco Detector Ready");

            // Setup Processing Canvas (Optimized for performance/quality balance)
            processingCanvas = document.createElement('canvas');
            processingCanvas.width = 400; // Super Fast
            processingCanvas.height = 400;
            // processingCtx = processingCanvas.getContext('2d', { willReadFrequently: true }); // Removed to test speed
            processingCtx = processingCanvas.getContext('2d');

            requestAnimationFrame(aimLoop); // Start aiming loop
        } else {
            console.error("AR Lib not loaded");
        }
    } catch (err) {
        console.error("Camera error:", err);
        alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
}

// SHARPEN FILTER KERNEL
function applySharpen(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const buff = new Uint8ClampedArray(data); // Copy for reading reference

    // Simple 3x3 Sharpen Kernel
    //  0 -1  0
    // -1  5 -1
    //  0 -1  0

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;

            // RGB only
            for (let c = 0; c < 3; c++) {
                const val = 5 * buff[i + c]
                    - buff[i + c - 4] // Left
                    - buff[i + c + 4] // Right
                    - buff[i + c - w * 4] // Top
                    - buff[i + c + w * 4]; // Bottom

                data[i + c] = val; // Clamp handled by Uint8ClampedArray view of data
            }
            // Alpha remains unchanged
        }
    }
}

// CONTINUOUS AIMING (For feedback & lock)
function aimLoop() {
    if (!isCameraReady || !detector || !processingCtx) {
        requestAnimationFrame(aimLoop);
        return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {

        // 1. CROP CENTER (Sniper Logic)
        // We only look at the center of the video frame, leveraging full resolution pixels.
        // Don't downscale the whole 4K image!

        const cropSize = Math.min(video.videoWidth, video.videoHeight) / 2; // Grab a generous center chunk (or tune to matches reticle)
        // Actually, creating a fixed window matches the visual reticle better.
        // Reticle is approx 256px wide physically on screen.
        // If 4K video, 256px screen might map to 500-1000px video pixels depending on zoom.
        // Let's grab a 400x400 region from the CENTER of the source video.

        // Reticle is huge. We grab a small chunk for speed.
        const sourceSize = 500; // Pixels from source to grab (Reduced for speed)
        const sx = (video.videoWidth - sourceSize) / 2;
        const sy = (video.videoHeight - sourceSize) / 2;

        // 2. PRE-PROCESSING (Raw Speed)
        // Filters removed to prevent Android GPU Freeze.
        // Aruco's internal Adaptive Threshold handles contrast well enough.
        processingCtx.filter = "none";

        // Draw centered crop into smaller processing canvas
        processingCtx.drawImage(video, sx, sy, sourceSize, sourceSize, 0, 0, processingCanvas.width, processingCanvas.height);

        // DEBUG: Show what the robot sees (Only when Zoomed)
        let debugCanvas = document.getElementById('debug-canvas');
        if (!debugCanvas) {
            processingCanvas.id = 'debug-canvas';
            processingCanvas.style.position = 'absolute';
            processingCanvas.style.bottom = '10px';
            processingCanvas.style.left = '10px';
            processingCanvas.style.width = '120px';
            processingCanvas.style.height = '120px';
            processingCanvas.style.border = '2px solid red';
            processingCanvas.style.zIndex = '9999';
            processingCanvas.style.backgroundColor = 'black';
            processingCanvas.style.display = 'none'; // Hidden by default
            document.body.appendChild(processingCanvas);
            debugCanvas = processingCanvas;
        }

        // Toggle Visibility based on Zoom
        // Only visible when zoomed in (Sniper Mode)
        if (typeof currentZoom !== 'undefined' && currentZoom > 1.0) {
            debugCanvas.style.display = 'block';
        } else {
            debugCanvas.style.display = 'none';
        }

        // 3. READ PIXELS
        const imageData = processingCtx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);

        try {
            const markers = detector.detect(imageData);

            // --- FULL DEBUG VISUALIZATION ---
            processingCtx.lineWidth = 3;

            // 1. Draw ALL Contours (Blue) - Raw shapes
            if (detector.contours) {
                processingCtx.strokeStyle = "rgba(0, 50, 255, 0.5)"; // Blue
                for (let contour of detector.contours) {
                    processingCtx.beginPath();
                    for (let i = 0; i < contour.length; i++) {
                        processingCtx.lineTo(contour[i].x, contour[i].y);
                    }
                    processingCtx.closePath();
                    processingCtx.stroke();
                }
            }

            // 2. Draw Candidates (Orange) - Quadrilaterals rejected later
            if (detector.candidates) {
                processingCtx.strokeStyle = "orange";
                for (let cand of detector.candidates) {
                    processingCtx.beginPath();
                    for (let i = 0; i < cand.length; i++) {
                        processingCtx.lineTo(cand[i].x, cand[i].y);
                    }
                    processingCtx.closePath();
                    processingCtx.stroke();
                }
            }

            // 3. Draw Valid Markers (Lime Green) - ID Decoded
            // Visual feedback UI Elements (Must be selected inside loop or defined globally)
            const reticle = document.getElementById('reticle-ring');
            const scanLabel = document.getElementById('scan-label');

            if (markers && markers.length > 0) {
                // LOCK ON
                const id = markers[0].id;

                // --- VISUALIZATION ON DEBUG CANVAS ---
                processingCtx.lineWidth = 4;
                for (let m of markers) {
                    const c = m.corners;
                    processingCtx.strokeStyle = "lime"; // VALID
                    processingCtx.beginPath();
                    processingCtx.moveTo(c[0].x, c[0].y);
                    processingCtx.lineTo(c[1].x, c[1].y);
                    processingCtx.lineTo(c[2].x, c[2].y);
                    processingCtx.lineTo(c[3].x, c[3].y);
                    processingCtx.closePath();
                    processingCtx.stroke();

                    // Draw ID
                    processingCtx.fillStyle = "lime";
                    processingCtx.font = "bold 80px Arial";
                    processingCtx.fillText("ID:" + m.id, c[0].x, c[0].y);
                }

                lockedTargetId = id;

                // Force Green Style
                if (reticle) {
                    reticle.style.borderColor = "#00ff00";
                    reticle.style.boxShadow = "0 0 25px #00ff00, inset 0 0 10px #00ff00"; // Outer + Inner glow
                    reticle.style.borderWidth = "2px"; // Thicker
                }
                if (scanLabel) {
                    scanLabel.innerText = "LOCKED [ID:" + id + "]";
                    scanLabel.style.color = "#00ff00";
                    scanLabel.style.textShadow = "0 0 5px #00ff00";
                }
            } else {
                // NO TARGET
                lockedTargetId = null;

                if (reticle) {
                    // Restore Red style (matching app.html default)
                    reticle.style.borderColor = "rgba(239, 68, 68, 0.5)";
                    reticle.style.boxShadow = "none";
                    reticle.style.borderWidth = "1px";
                }
                if (scanLabel) {
                    scanLabel.innerText = "SYSTEM READY";
                    scanLabel.style.color = "#f87171"; // Red-400
                    scanLabel.style.textShadow = "none";
                }
            }
        } catch (e) {
            console.error("Detection Error:", e);
        }
    }
    // Throttle loop to ~5 FPS (every 200ms) to unfreeze UI on weak CPU
    setTimeout(() => {
        requestAnimationFrame(aimLoop);
    }, 200);
}

// Global target lock
let lockedTargetId = null;

// FIRE ACTION (Triggered by Button)
/* scanFrame deleted, functionality moved to aimLoop + fire handler */

// --- GAMEPLAY ---
const shootSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2144/2144-preview.mp3'); // Loud Gunshot
const emptySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3');

// HIT OVERLAY
const hitOverlay = document.createElement('div');
hitOverlay.id = 'hit-overlay';
hitOverlay.style.position = 'absolute';
hitOverlay.style.top = '0';
hitOverlay.style.left = '0';
hitOverlay.style.width = '100vw';
hitOverlay.style.height = '100vh';
hitOverlay.style.zIndex = '1000';
hitOverlay.style.pointerEvents = 'none';
// Broken glass or bullet hole
hitOverlay.style.backgroundImage = "url('https://pngimg.com/uploads/broken_glass/broken_glass_PNG27.png')";
hitOverlay.style.backgroundSize = 'cover';
hitOverlay.style.backgroundPosition = 'center';
hitOverlay.style.opacity = '0';
hitOverlay.style.transition = 'opacity 0.2s';
document.body.appendChild(hitOverlay);

const hitSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2747/2747-preview.mp3'); // Glass break or impact

fireBtn.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent accidental scrolling/focus
    fireBtn.style.transform = "translateX(-50%) scale(0.9)";
    setTimeout(() => fireBtn.style.transform = "translateX(-50%) scale(1)", 100);

    // RELOAD CHECK FIRST (Can reload even if empty)
    if (lockedTargetId === 0) {
        handleHit(0);
        return;
    }

    if (ammo <= 0) {
        showFeedback("NO AMMO - SCAN RELOAD (ID 0)", "#ffaa00");
        emptySound.currentTime = 0;
        emptySound.play().catch(() => { });
        return;
    }

    // FIRE
    shootSound.currentTime = 0;
    shootSound.play().catch(e => console.log('Audio play failed', e));

    if (lockedTargetId !== null) {
        handleHit(lockedTargetId);
    } else {
        // MISS
        ammo--;
        updateAmmoDisplay();
        showFeedback("MISS", "#fff");
    }
});

// Globals
let isAdminMode = false;

const boomSound = new Audio('https://assets.mixkit.co/active_storage/sfx/1698/1698-preview.mp3'); // Explosion

function handleHit(markerId) {
    console.log("Marker Found:", markerId);

    // ADMIN MODE ACTIVATION (Marker 256)
    if (markerId === 256) {
        isAdminMode = true;
        showFeedback("MODE ADMIN ACTIVÉ\nTIREZ SUR UNE ZONE", "cyan");
        return;
    }

    // RELOAD LOGIC (Marker 0)
    if (markerId === 0) {
        ammo = MAX_AMMO;
        updateAmmoDisplay();
        showFeedback("RELOADED", "#00ff00");
        const reloadSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2579/2579-preview.mp3');
        reloadSound.play().catch(e => { });
        return;
    }

    // HIT SOUND (For valid targets)
    if (markerId > 0 && markerId < 256) {
        boomSound.currentTime = 0;
        boomSound.play().catch(e => { });
    }

    if (ammo > 0 || isAdminMode) { // Admin can shoot even without ammo to place zone? "meme sans balle de dispo" -> Yes.
        if (!isAdminMode) {
            ammo--;
            updateAmmoDisplay();
        }

        if (markerId >= 200) {
            // Send Coords for Zone (and Admin Flag)
            socket.emit('shoot', { id: markerId, lat: myLat, lon: myLon, placing: isAdminMode });
            if (isAdminMode) {
                isAdminMode = false; // Consume flag
                showFeedback("PLACEMENT EN COURS...", "orange");
            }
        } else {
            socket.emit('shoot', markerId);
        }
    } else {
        showFeedback("EMPTY!", "#ff0000");
    }
}

socket.on('hit', (data) => {
    console.log("I WAS HIT!");
    // Vibrate
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    // Play Sound
    hitSound.currentTime = 0;
    hitSound.play().catch(() => { });

    // Show Effect (Blood/Damage)
    hitOverlay.style.transition = 'none';
    hitOverlay.style.opacity = '1';
    hitOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
    hitOverlay.innerHTML = "<h1 style='color:red; font-size:5rem; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-shadow:0 0 20px black;'>HIT!</h1>";

    // Shake screen
    document.body.style.animation = "shake 0.5s cubic-bezier(.36,.07,.19,.97) both";

    setTimeout(() => {
        hitOverlay.style.transition = 'opacity 1s';
        hitOverlay.style.opacity = '0';
        hitOverlay.style.backgroundColor = 'transparent';
        document.body.style.animation = "none";
        setTimeout(() => hitOverlay.innerHTML = "", 1000); // Clear text after fade
    }, 1000);
});

socket.on('shotFeedback', (data) => {
    showFeedback(data.msg, data.color);
});

function showFeedback(text, color) {
    // Handling newlines in text by converting to HTML break tags if needed, 
    // but innerText handles \n as lines mostly. 
    // Let's ensure formatting.
    feedbackMsg.innerText = text;
    feedbackMsg.style.color = color;
    feedbackMsg.classList.remove('hidden');

    // Reset animation
    feedbackMsg.style.animation = 'none';
    feedbackMsg.offsetHeight; /* trigger reflow */
    feedbackMsg.style.animation = 'popup 1.5s ease-out forwards'; // Message lasts a bit longer

    setTimeout(() => {
        feedbackMsg.classList.add('hidden');
    }, 1500);
}

// --- SOCKET EVENTS ---
// --- SOCKET EVENTS ---

socket.on('gameOver', (data) => {
    const me = data.players[socket.id];

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'game-over-screen';

    // Determine winner text
    let winnerText = "";
    let color = "#fff";

    if (data.winner === 'draw') {
        winnerText = "ÉGALITÉ";
    } else if (data.winner === 'red') {
        winnerText = "VICTOIRE ROUGE";
        color = "var(--primary-red)";
    } else {
        winnerText = "VICTOIRE BLEUE";
        color = "var(--primary-blue)";
    }

    overlay.innerHTML = `
        <div class="winner-title" style="color: ${color}">${winnerText}</div>
        
        <div class="stats-container">
            <h3 style="border-bottom: 2px solid var(--neon-cyan); padding-bottom: 10px;">RAPPORT DE MISSION</h3>
            <div class="stats-grid">
                <div class="stat-item">SCORE <span class="stat-value">${me ? me.score : 0}</span></div>
                <div class="stat-item">ÉLIMINATIONS <span class="stat-value">${me ? me.kills : 0}</span></div>
                <div class="stat-item">MORTS <span class="stat-value">${me ? me.deaths : 0}</span></div>
                <div class="stat-item">ZONES <span class="stat-value">${me ? me.captures : 0}</span></div>
            </div>
            
            <div style="margin-top: 20px; font-size: 1rem; color: #aaa;">
                ROUGE: ${data.finalScores.red} pts <br>
                BLEU: ${data.finalScores.blue} pts
            </div>
        </div>

        <button class="btn primary" style="margin-top: 30px" onclick="location.reload()">RETOUR BASE</button>
    `;

    document.body.appendChild(overlay);
});

socket.on('assignedId', (data) => {
    // data: { id: 256, team: 'red' }
    const myIdDisplay = document.getElementById('my-id-display');
    if (myIdDisplay) myIdDisplay.innerText = "ID: " + data.id;

    // Update Client State
    myTeam = data.team;
    updateTeamDisplay(data.team);

    let teamLabel = document.getElementById('my-team');
    if (teamLabel) teamLabel.innerText = data.team.toUpperCase();

    showFeedback(`ID ASSIGNÉ: ${data.id}`, "#00ffff");
});

socket.on('gameState', (data) => {
    // data: { players, zones, zoneCoords, redZoneCount, blueZoneCount }
    if (data.points) { /* legacy check? */ }
    // Update Globals
    if (data.zones) globalZones = data.zones;
    if (data.zoneCoords) globalZoneCoords = data.zoneCoords;
    if (data.players) globalPlayers = Object.values(data.players);

    if (data.redZoneCount !== undefined) redZones = data.redZoneCount;
    if (data.blueZoneCount !== undefined) blueZones = data.blueZoneCount;

    // Also update scores from players list if provided in gameState to be safe
    // But usually players list is separate or included.
    // My server gameState format includes 'players' object

    // Update Scores from gameState.players
    if (data.players) {
        let rs = 0;
        let bs = 0;
        Object.values(data.players).forEach(p => {
            if (p.team === 'red') rs += p.score;
            if (p.team === 'blue') bs += p.score;
        });
        redScore = rs;
        blueScore = bs;
    }

    updateScoreBoard();
    if (data.players) updateMiniMap(Object.values(data.players));
});

socket.on('playerList', (players) => {
    updateMiniMap(players);
});

function updateMiniMap(players) {
    const map = document.getElementById('mini-map');

    // Clear old markers
    const oldMarkers = document.querySelectorAll('.player-marker, .zone-marker');
    oldMarkers.forEach(m => m.remove());

    // Ensure radar line and center cross
    if (!map.querySelector('.radar-line')) {
        const radar = document.createElement('div');
        radar.className = 'radar-line';
        map.appendChild(radar);

        const center = document.createElement('div');
        center.style.position = 'absolute';
        center.style.top = '50%';
        center.style.left = '50%';
        center.style.width = '6px';
        center.style.height = '6px';
        center.style.background = 'white';
        center.style.borderRadius = '50%';
        center.style.transform = 'translate(-50%, -50%)';
        center.style.boxShadow = '0 0 4px black';
        center.style.zIndex = '5';
        map.appendChild(center);
    }

    // Dynamic North Marker (Update every frame)
    let north = map.querySelector('.north-marker');
    if (!north) {
        north = document.createElement('div');
        north.className = 'north-marker';
        north.innerText = 'N';
        north.style.position = 'absolute';
        north.style.color = 'red';
        north.style.fontWeight = 'bold';
        north.style.fontSize = '12px';
        north.style.transform = 'translate(-50%, -50%)';
        map.appendChild(north);
    }

    // Calculate North Position
    const theta_rad = (currentHeading || 0) * Math.PI / 180;
    const nav_angle = -Math.PI / 2 - theta_rad;
    const n_px = 45 * Math.cos(nav_angle);
    const n_py = 45 * Math.sin(nav_angle);
    north.style.left = (50 + n_px) + '%';
    north.style.top = (50 + n_py) + '%';

    // DEBUG: Stats & SHOW PLAYER COUNT
    const debugEl = document.getElementById('game-code-display');
    if (debugEl) {
        const zCount = globalZoneCoords ? Object.keys(globalZoneCoords).length : 0;
        debugEl.innerText = `CODE: ${activeGameCode || '?'} | H: ${Math.round(currentHeading)} | P: ${players.length}`;
    }

    // GPS Check
    if (!myLat || !myLon) {
        // Continue even if no GPS to show others at fallback pos
    }

    // ZONE LOGIC (Prep)
    const R_h = 6371e3;
    const maxDist_h = 50;
    const scale_h = 50 / maxDist_h;
    const theta_h = (currentHeading || 0) * Math.PI / 180;

    const project = (lat, lon) => {
        // Fallback to 0 if missing (prevents NaN)
        const pLat = lat || 0;
        const pLon = lon || 0;
        const mLat = myLat || 0;
        const mLon = myLon || 0;

        const dLat = (pLat - mLat) * Math.PI / 180;
        const dLon = (pLon - mLon) * Math.PI / 180;
        const dx = dLon * Math.cos((mLat + pLat) / 2 * Math.PI / 180) * R_h;
        const dy = dLat * R_h;

        const rx = dx * Math.cos(theta_h) - dy * Math.sin(theta_h);
        const ry = dx * Math.sin(theta_h) + dy * Math.cos(theta_h);

        let px = rx * scale_h;
        let py = -ry * scale_h;

        const dist = Math.sqrt(px * px + py * py);
        if (dist > 40) { // SAFE MARGIN Clamping
            const angle = Math.atan2(py, px);
            px = 40 * Math.cos(angle);
            py = 40 * Math.sin(angle);
        }
        return { px, py };
    };

    // 1. DRAW ZONES
    if (globalZoneCoords) {
        Object.entries(globalZoneCoords).forEach(([id, coords]) => {
            if (coords && coords.lat) {
                const pos = project(coords.lat, coords.lon);

                const marker = document.createElement('div');
                marker.className = 'zone-marker';
                marker.style.position = 'absolute';
                marker.style.width = '12px';
                marker.style.height = '12px';

                let color = 'orange';
                if (globalZones && globalZones[id] === 'red') color = 'var(--primary-red)';
                if (globalZones && globalZones[id] === 'blue') color = 'var(--primary-blue)';
                marker.style.backgroundColor = color;
                marker.style.border = '2px solid white';
                marker.style.transform = 'translate(-50%, -50%)';
                marker.style.zIndex = '4';
                marker.style.left = (50 + pos.px) + '%';
                marker.style.top = (50 + pos.py) + '%';

                marker.innerText = id;
                marker.style.fontSize = '8px';
                marker.style.color = 'black';
                marker.style.display = 'flex';
                marker.style.justifyContent = 'center';
                marker.style.alignItems = 'center';
                marker.style.fontWeight = 'bold';

                const mapRef = document.getElementById('mini-map');
                if (mapRef) mapRef.appendChild(marker);
            }
        });
    }

    // 2. DRAW PLAYERS
    players.forEach(p => {
        const myIdDisplay = document.getElementById('my-id-display');
        const isMe = (p.id === socket.id) || (myIdDisplay && parseInt(myIdDisplay.innerText) === p.markerId);

        if (isMe) return;

        const pos = project(p.lat, p.lon);

        const marker = document.createElement('div');
        marker.className = `player-marker ${p.team}`;
        marker.innerText = p.markerId;

        // Ensure Visibility (Explicit Styles)
        marker.style.position = 'absolute';
        marker.style.width = '14px';
        marker.style.height = '14px';
        marker.style.borderRadius = '50%';
        marker.style.backgroundColor = (p.team === 'red') ? 'var(--primary-red)' : 'var(--primary-blue)';
        marker.style.border = '2px solid white';
        marker.style.zIndex = '6';

        marker.style.fontSize = '9px';
        marker.style.fontWeight = 'bold';
        marker.style.color = '#fff';
        marker.style.display = 'flex';
        marker.style.justifyContent = 'center';
        marker.style.alignItems = 'center';

        marker.style.left = (50 + pos.px) + '%';
        marker.style.top = (50 + pos.py) + '%';

        const mapRef = document.getElementById('mini-map');
        if (mapRef) mapRef.appendChild(marker);
    });
}

// Remove random logic, rely on server assignment

function updateTeamDisplay(team) {
    const el = document.getElementById('my-team');
    if (el) {
        el.innerText = team.toUpperCase();
        el.style.color = team === 'red' ? 'var(--primary-red)' : 'var(--primary-blue)';
    }
}

function updateAmmoDisplay() {
    const el = document.getElementById('ammo-count');
    if (el) {
        el.innerText = ammo + "/" + MAX_AMMO;
        if (ammo === 0) el.style.color = 'red';
        else el.style.color = '#60a5fa'; // Blue-400 equivalent for "normal" state
    }
}

// --- UPGRADE MODAL LOGIC ---
const upgradeModal = document.getElementById('modal-upgrade');
const upgradeReasonEl = document.getElementById('upgrade-reason');
const upgradeInputEl = document.getElementById('upgrade-code-input');
const btnSubmitUpgradeEl = document.getElementById('btn-submit-upgrade');
const btnCancelUpgradeEl = document.getElementById('btn-cancel-upgrade');

if (socket) {
    socket.on('askForCode', (data) => {
        if (upgradeModal) {
            upgradeModal.classList.remove('hidden');
            if (upgradeReasonEl) upgradeReasonEl.innerText = data.msg || "Mise à niveau requise";
            if (upgradeInputEl) upgradeInputEl.value = "";
        }
    });

    socket.on('planUnlocked', (data) => {
        if (upgradeModal) upgradeModal.classList.add('hidden');
        if (typeof showFeedback === 'function') showFeedback(data.msg, "#4ade80");
    });
}

if (btnSubmitUpgradeEl) {
    btnSubmitUpgradeEl.addEventListener('click', () => {
        const code = upgradeInputEl ? upgradeInputEl.value : "";
        if (code && code.trim().length > 0) {
            socket.emit('unlockPlan', { gameCode: activeGameCode, code: code });
        }
    });
}

if (btnCancelUpgradeEl) {
    btnCancelUpgradeEl.addEventListener('click', () => {
        if (upgradeModal) upgradeModal.classList.add('hidden');
    });
}
