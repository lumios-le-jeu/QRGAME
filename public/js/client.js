const socket = io();

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

// CONFIRM JOIN
document.getElementById('btn-confirm-join').addEventListener('click', async () => {
    const code = document.getElementById('join-code').value.toUpperCase();
    const pseudo = document.getElementById('join-pseudo').value || 'Soldier';
    const team = document.getElementById('join-team').value;

    if (code.length !== 4) {
        alert("Code invalide (4 caractères)");
        return;
    }

    try {
        const coords = await getCurrentLocation();
        enterGame(pseudo, team, code, coords);
    } catch (err) {
        console.error(err);
        alert("GPS REQUIS : Donnez l'accès à la localisation pour rejoindre.");
        // Dev fallback for testing if GPS fails on non-https
        // enterGame(pseudo, team, code, {lat: 0, lon: 0}); 
    }
});

// CONFIRM CREATE
document.getElementById('btn-confirm-create').addEventListener('click', async () => {
    const name = document.getElementById('create-name').value;
    const teams = document.getElementById('create-teams').value;
    const duration = document.getElementById('create-duration').value;

    try {
        alert("Acquisition position GPS...");
        const coords = await getCurrentLocation();
        const isPlayer = document.getElementById('create-is-player').checked;

        // Admin creates game
        socket.emit('createGame', { name, teams, duration, lat: coords.lat, lon: coords.lon }, (response) => {
            if (response.success) {
                alert("Partie créée ! Code: " + response.gameCode);

                if (isPlayer) {
                    // Creator joins as Player 1 (Red)
                    enterGame('Commander', 'red', response.gameCode, coords);
                } else {
                    // Creator joins as Spectator (Admin)
                    enterGame('Admin', 'spectator', response.gameCode, coords);
                }
            }
        });
    } catch (err) {
        console.error(err);
        alert("ERREUR GPS : Impossible de créer la partie sans localisation.\nVérifiez vos permissions.");
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
    showScreen('game');

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

    // We wait for server to confirm team via 'assignedId' or 'playerList' before updateTeamDisplay
    // But we can set a temporary "Waiting..." state
    document.getElementById('my-team').innerText = "?";
}

// --- CAMERA & SCANNING ---
let detector = null;

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.play();
        isCameraReady = true;

        // Init Aruco Detector
        if (typeof AR !== 'undefined') {
            detector = new AR.Detector();
            console.log("Aruco Detector Ready");
            requestAnimationFrame(aimLoop); // Start aiming loop
        } else {
            console.error("AR Lib not loaded");
        }
    } catch (err) {
        console.error("Camera error:", err);
        alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
}

// CONTINUOUS AIMING (For feedback & lock)
function aimLoop() {
    if (!isCameraReady || !detector) {
        requestAnimationFrame(aimLoop);
        return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Sync canvas to video prop
        if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        try {
            const markers = detector.detect(imageData);

            // Visual feedback
            const reticle = document.querySelector('.reticle-circle');
            const scanLabel = document.querySelector('.scan-label');

            if (markers && markers.length > 0) {
                // LOCK ON
                lockedTargetId = markers[0].id;

                if (reticle) {
                    reticle.style.borderColor = "#00ff00"; // Green
                    reticle.style.boxShadow = "0 0 15px #00ff00";
                }
                if (scanLabel) {
                    scanLabel.innerText = "TARGET LOCKED: " + lockedTargetId;
                    scanLabel.style.color = "#00ff00";
                }
            } else {
                // NO TARGET
                lockedTargetId = null;

                if (reticle) {
                    reticle.style.borderColor = "var(--primary-red)";
                    reticle.style.boxShadow = "0 0 10px var(--primary-red)";
                }
                if (scanLabel) {
                    scanLabel.innerText = "SCANNING...";
                    scanLabel.style.color = "var(--primary-red)";
                }
            }
        } catch (e) { }
    }
    requestAnimationFrame(aimLoop);
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

function handleHit(markerId) {
    console.log("Marker Found:", markerId);

    // RELOAD LOGIC (Marker 0)
    if (markerId === 0) {
        ammo = MAX_AMMO;
        updateAmmoDisplay();
        showFeedback("RELOADED", "#00ff00");
        const reloadSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2579/2579-preview.mp3');
        reloadSound.play().catch(e => { });
        return;
    }

    if (ammo > 0) {
        ammo--;
        updateAmmoDisplay();
        socket.emit('shoot', markerId); // Send integer
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
    // data: { players, zones, redZoneCount, blueZoneCount }
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
});

socket.on('playerList', (players) => {
    // Update MiniMap
    const map = document.getElementById('mini-map');

    // Clear old markers (only remove .player-marker)
    const oldMarkers = document.querySelectorAll('.player-marker');
    oldMarkers.forEach(m => m.remove());

    // Ensure radar line exists
    if (!map.querySelector('.radar-line')) {
        const radar = document.createElement('div');
        radar.className = 'radar-line';
        map.appendChild(radar);
    }

    // Calculate scores again just in case (redundancy is fine here)
    let rs = 0;
    let bs = 0;

    players.forEach(p => {
        if (p.team === 'red') rs += p.score;
        if (p.team === 'blue') bs += p.score;

        // Minimap Marker
        const marker = document.createElement('div');
        marker.className = `player-marker ${p.team}`;

        // Cluster positions
        let top, left;
        if (p.team === 'red') {
            top = 10 + (p.markerId * 2) % 30;
            left = 10 + (p.markerId * 3) % 30;
        } else {
            top = 60 + (p.markerId * 2) % 30;
            left = 60 + (p.markerId * 3) % 30;
        }

        // Highlight ME
        const myIdDisplay = document.getElementById('my-id-display');
        if (myIdDisplay && (parseInt(myIdDisplay.innerText) === p.markerId || p.id === socket.id)) {
            marker.classList.add('me');
        }

        marker.style.top = top + '%';
        marker.style.left = left + '%';
        map.appendChild(marker);
    });

    redScore = rs;
    blueScore = bs;
    updateScoreBoard();
});

// Remove random logic, rely on server assignment

function updateTeamDisplay(team) {
    const el = document.getElementById('my-team');
    if (el) {
        el.innerText = team.toUpperCase();
        el.style.color = team === 'red' ? 'var(--primary-red)' : 'var(--primary-blue)';
    }
}

function updateAmmoDisplay() {
    const el = document.querySelector('.ammo-display .value');
    if (el) {
        el.innerText = ammo + "/" + MAX_AMMO;
        if (ammo === 0) el.style.color = 'red';
        else el.style.color = 'white';
    }
}
