// ─── SERVER CONNECTION ────────────────────────────────────────────────────────
const GAME_SERVER_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://fun.qrshotgame.fr";

const socket = io(GAME_SERVER_URL);
console.log("%c QRSHOT v1.3.0 - AUTO-REGISTER + SESSION RESTORE ", "background: #7c3aed; color: white; font-size: 16px; font-weight: bold;");

// ─── SESSION RESTORE (F5 reconnect) ─────────────────────────────────────────
(function tryRestoreSession() {
    const saved = sessionStorage.getItem('qrshot_session');
    if (!saved) return;
    try {
        const s = JSON.parse(saved);
        if (s.gameCode && s.username) {
            console.log('[SESSION RESTORE] Reconnecting to', s.gameCode);
            // Wait for socket to connect before rejoining
            socket.once('connect', () => {
                navigator.geolocation.getCurrentPosition((pos) => {
                    enterGame(s.username, s.team || 'auto', s.gameCode, { lat: pos.coords.latitude, lon: pos.coords.longitude });
                }, () => {
                    enterGame(s.username, s.team || 'auto', s.gameCode, { lat: 0, lon: 0 });
                });
            });
        }
    } catch(e) { sessionStorage.removeItem('qrshot_session'); }
})();

socket.on("connect_error", (err) => {
    console.error("Server Connection Failed:", err);
    if (typeof showFeedback === "function") {
        showFeedback("⚠️ SERVEUR HORS LIGNE (Allumez le PC !)", "red");
    }
});

// ─── DOM ELEMENTS ─────────────────────────────────────────────────────────────
const video      = document.getElementById('camera-feed');
const canvas     = document.getElementById('camera-canvas');
const ctx        = canvas.getContext('2d');
const fireBtn    = document.getElementById('btn-fire');
const feedbackMsg = document.getElementById('feedback-msg');

// ─── GAME STATE ───────────────────────────────────────────────────────────────
let myTeam       = 'blue';
let myGameMode   = 'ctf';    // 'ctf' or 'paint'
let myAlive      = true;     // local alive flag
let isCameraReady = false;
let ammo         = 6;
const MAX_AMMO   = 6;
let activeGameCode = null;
let globalZones     = {};
let globalZoneCoords = {};
let globalPlayers   = [];

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
const screens = {
    home:   document.getElementById('page-home'),
    join:   document.getElementById('page-join'),
    create: document.getElementById('page-create'),
    game:   document.getElementById('page-game')
};

function showScreen(name) {
    Object.values(screens).forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    screens[name].classList.remove('hidden');
    screens[name].classList.add('active');
}

document.getElementById('btn-goto-join').addEventListener('click', () => showScreen('join'));
document.getElementById('btn-goto-create').addEventListener('click', () => showScreen('create'));
document.getElementById('btn-back-home-1').addEventListener('click', () => showScreen('home'));
document.getElementById('btn-back-home-2').addEventListener('click', () => showScreen('home'));

// ─── MODE SELECTOR ───────────────────────────────────────────────────────────
window.selectMode = (mode) => {
    document.getElementById('create-game-mode').value = mode;
    const ctfCard   = document.getElementById('mode-ctf-card');
    const paintCard = document.getElementById('mode-paint-card');

    ctfCard.classList.remove('selected-ctf', 'selected-paint', 'border-blue-500', 'bg-blue-900/30', 'border-slate-600', 'bg-slate-800/60');
    paintCard.classList.remove('selected-ctf', 'selected-paint', 'border-blue-500', 'bg-blue-900/30', 'border-slate-600', 'bg-slate-800/60');

    if (mode === 'ctf') {
        ctfCard.classList.add('selected-ctf', 'border-blue-500', 'bg-blue-900/30');
        paintCard.classList.add('border-slate-600', 'bg-slate-800/60');
    } else {
        paintCard.classList.add('selected-paint', 'border-purple-500', 'bg-purple-900/30');
        ctfCard.classList.add('border-slate-600', 'bg-slate-800/60');
    }
};
// Init: CTF selected by default
selectMode('ctf');

// ─── NEARBY GAMES ─────────────────────────────────────────────────────────────
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
    const btn  = document.getElementById('btn-scan-games');
    if (btn) btn.innerText = 'REFRESH';

    if (!games || games.length === 0) {
        list.innerHTML = '<small>Aucune partie trouvée à -20km.</small>';
        return;
    }

    list.innerHTML = '';
    games.forEach(g => {
        const modeIcon = g.gameMode === 'paint' ? '🎨' : '🚩';
        const div = document.createElement('div');
        div.style.cssText = 'margin-bottom:5px;padding:5px;background:rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;border-radius:6px';
        div.innerHTML = `
            <div>
                <strong style="color:#67e8f9">${modeIcon} ${g.name || 'Mission'}</strong><br>
                <small>${g.dist.toFixed(2)} km | ${g.count} Joueurs</small>
            </div>
            <button style="padding:4px 8px;font-size:0.8rem;background:#3b82f6;border:none;color:white;border-radius:6px;cursor:pointer;" onclick="joinFromLobby('${g.code}')">JOIN</button>
        `;
        list.appendChild(div);
    });
});

window.joinFromLobby = (code) => {
    showScreen('join');
    document.getElementById('join-code').value = code;
};

// ─── GPS ──────────────────────────────────────────────────────────────────────
let currentHeading = 0;
let myLat = 0;
let myLon = 0;

const getCurrentLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS incompatible ou refusé"));
    navigator.geolocation.getCurrentPosition(
        (pos) => { myLat = pos.coords.latitude; myLon = pos.coords.longitude; resolve({ lat: myLat, lon: myLon }); },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
});

function startLocationTracking() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((pos) => {
            myLat = pos.coords.latitude;
            myLon = pos.coords.longitude;
            if (globalPlayers && globalPlayers.length > 0) updateMiniMap(globalPlayers);
        }, (err) => console.warn("GPS Watch Error", err), { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 });
    }

    const handleOrientation = (event) => {
        let heading = 0;
        if (event.webkitCompassHeading) {
            heading = event.webkitCompassHeading;
        } else if (event.alpha) {
            heading = (event.absolute === true || event.absolute === undefined) ? 360 - event.alpha : 360 - event.alpha;
        }
        currentHeading = heading;
        if (globalPlayers && globalPlayers.length > 0) updateMiniMap(globalPlayers);
    };

    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

async function requestSensors() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response !== 'granted') alert("Permission boussole refusée");
        } catch (e) { console.error(e); }
    }
}

// ─── JOIN ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-confirm-join').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.innerText = "Chargement...";
    await requestSensors();
    startLocationTracking();
    const code   = document.getElementById('join-code').value.toUpperCase();
    const pseudo = document.getElementById('join-pseudo').value || 'Soldier';
    const team   = document.getElementById('join-team').value;
    if (code.length !== 4) { alert("Code invalide (4 caractères)"); btn.disabled = false; btn.innerText = "GO"; return; }
    try {
        const coords = await getCurrentLocation();
        enterGame(pseudo, team, code, coords);
    } catch (err) {
        console.error(err);
        alert("GPS REQUIS : Donnez l'accès à la localisation pour rejoindre.");
        btn.disabled = false; btn.innerText = "GO";
    }
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
window.checkLimits = () => { /* disabled */ };

document.getElementById('btn-confirm-create').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.innerText = "Création...";
    await requestSensors();

    const name       = document.getElementById('create-name').value;
    const teams      = parseInt(document.getElementById('create-teams').value);
    const maxPlayers = parseInt(document.getElementById('create-max-players').value);
    const duration   = parseInt(document.getElementById('create-duration').value);
    const resCode    = document.getElementById('create-res-code').value;
    const gameMode   = document.getElementById('create-game-mode').value || 'ctf';

    try {
        const coords   = await getCurrentLocation();
        const isPlayer = document.getElementById('create-is-player').checked;

        socket.emit('createGame', { name, teams, maxPlayers, duration, reservationCode: resCode, gameMode, lat: coords.lat, lon: coords.lon }, (response) => {
            if (response.success) {
                alert(`Partie créée ! Code: ${response.gameCode} | Mode: ${response.gameMode === 'paint' ? '🎨 PAINT' : '🚩 CAPTURE'}`);
                myGameMode = response.gameMode;
                if (isPlayer) {
                    enterGame('Commander', 'auto', response.gameCode, coords);
                } else {
                    enterGame('Admin', 'spectator', response.gameCode, coords);
                }
            } else {
                alert("ERREUR CRÉATION: " + (response.msg || response.error));
                btn.disabled = false; btn.innerText = "LANCER";
            }
        });
    } catch (err) {
        console.error(err);
        alert("ERREUR GPS : Impossible de créer la partie sans localisation.\nVérifiez vos permissions.");
        btn.disabled = false; btn.innerText = "LANCER";
    }
});

// ─── ENTER GAME ───────────────────────────────────────────────────────────────
function enterGame(username, team, gameCode, coords) {
    activeGameCode = gameCode;
    showScreen('game');

    // Save session for F5 restore
    sessionStorage.setItem('qrshot_session', JSON.stringify({ username, team, gameCode }));

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(s => {}).catch(console.error);
    }

    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(e => console.log("Fullscreen blocked", e));
    }

    history.pushState(null, document.title, location.href);
    window.addEventListener('popstate', () => history.pushState(null, document.title, location.href));

    // Lock button
    let lockBtn = document.getElementById('screen-lock-btn');
    if (!lockBtn) {
        lockBtn = document.createElement('div');
        lockBtn.id = 'screen-lock-btn';
        lockBtn.innerHTML = "🔒";
        document.body.appendChild(lockBtn);
        lockBtn.addEventListener('click', () => {
            if (confirm("QUITTER LA MISSION ET RETOURNER AU MENU ?")) {
                sessionStorage.removeItem('qrshot_session');
                location.reload();
            }
        });
    }
    Object.assign(lockBtn.style, {
        display:'flex', position:'fixed', top:'10px', left:'10px', right:'auto',
        fontSize:'12px', zIndex:'10001', background:'rgba(0,0,0,0.5)', borderRadius:'50%',
        width:'20px', height:'20px', justifyContent:'center', alignItems:'center',
        cursor:'pointer', userSelect:'none'
    });

    startCamera();
    updateAmmoDisplay();

    socket.emit('joinGame', { username, team, gameCode, lat: coords ? coords.lat : 0, lon: coords ? coords.lon : 0 });

    const codeDisplay = document.getElementById('game-code-display');
    if (codeDisplay) codeDisplay.innerText = `CODE: ${gameCode}`;
    startLocationTracking();

    // Show tutorial on first join
    const tutKey = 'qrshot_tutorial_seen_v1';
    if (!localStorage.getItem(tutKey)) {
        showTutorialOverlay(myGameMode);
        localStorage.setItem(tutKey, '1');
    }
}

// ─── SCOREBOARD ──────────────────────────────────────────────────────────────
let score1 = 0, score2 = 0;

// ─── TUTORIAL OVERLAY ──────────────────────────────────────────────────────────
function showTutorialOverlay(mode) {
    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '20000',
        background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontFamily: 'sans-serif', textAlign: 'center', padding: '20px',
        userSelect: 'none', touchAction: 'none'
    });

    const slides = mode === 'paint' ? [
        { title: "MODE PAINT", text: "Tout le monde commence en ROUGE.", icon: "🎨" },
        { title: "PREMIER COUP", text: "Le premier joueur qui vous touche définit votre équipe : VERT ou BLEU.", icon: "🎯" },
        { title: "ÉLIMINATION", text: "Si vous êtes touché par un ennemi, vous êtes éliminé (écran brisé).", icon: "💀" },
        { title: "SOIN", text: "Un coéquipier peut vous soigner en vous tirant dessus !", icon: "💖" }
    ] : [
        { title: "MODE CAPTURE", text: "Capturez des zones stratégiques pour gagner des points.", icon: "🚩" },
        { title: "ZONES", text: "Visez le QR code d'une zone (200-250) pour la capturer.", icon: "📡" },
        { title: "RESPAWN", text: "Si vous mourez, scannez une zone de VOTRE équipe pour revivre.", icon: "🔄" },
        { title: "POINTS", text: "Tenez les zones le plus longtemps possible !", icon: "📈" }
    ];

    let currentSlide = 0;
    const updateSlide = () => {
        const s = slides[currentSlide];
        overlay.innerHTML = `
            <div style="font-size: 5rem; margin-bottom: 20px; filter: drop-shadow(0 0 10px #67e8f9)">${s.icon}</div>
            <h2 style="font-size: 2.2rem; font-weight: 900; color: #67e8f9; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 2px;">${s.title}</h2>
            <p style="font-size: 1.3rem; line-height: 1.6; max-width: 300px; margin-bottom: 40px; color: #cbd5e1;">${s.text}</p>
            <div style="display: flex; gap: 12px; margin-bottom: 50px;">
                ${slides.map((_, i) => `<div style="width:12px; height:12px; border-radius:50%; background:${i===currentSlide?'#67e8f9':'#334155'}; transition: all 0.3s;"></div>`).join('')}
            </div>
            <div style="color: #64748b; font-size: 0.9rem; font-weight: bold; letter-spacing: 1px; animation: bounce 2s infinite;">TAP ou SWIPE POUR SUIVRE</div>
        `;
    };

    updateSlide();

    const next = () => {
        currentSlide++;
        if (currentSlide >= slides.length) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.5s ease-out';
            setTimeout(() => overlay.remove(), 500);
        } else {
            updateSlide();
        }
    };

    overlay.addEventListener('click', next);
    
    let touchstartX = 0;
    overlay.addEventListener('touchstart', e => touchstartX = e.changedTouches[0].screenX, {passive: true});
    overlay.addEventListener('touchend', e => {
        if (touchstartX - e.changedTouches[0].screenX > 50) next();
    }, {passive: true});

    document.body.appendChild(overlay);
}

function updateScoreBoard(data) {
    const row1  = document.getElementById('score-row-1');
    const row2  = document.getElementById('score-row-2');
    const lbl1  = document.getElementById('score-label-1');
    const lbl2  = document.getElementById('score-label-2');
    const val1  = document.getElementById('score-val-1');
    const val2  = document.getElementById('score-val-2');
    const alive  = document.getElementById('score-alive');
    const aliveV = document.getElementById('score-alive-val');

    if (myGameMode === 'paint') {
        // Row 1 = GREEN
        row1.className = 'bg-green-900/60 border-l-4 border-green-500 p-1 flex justify-between items-center px-2';
        lbl1.className = 'text-[10px] font-bold text-green-200';
        lbl1.innerText = 'VERT';
        val1.innerText = data.greenScore ?? 0;

        // Row 2 = BLUE
        row2.className = 'bg-blue-900/60 border-l-4 border-blue-500 p-1 flex justify-between items-center px-2';
        lbl2.className = 'text-[10px] font-bold text-blue-200';
        lbl2.innerText = 'BLEU';
        val2.innerText = data.blueScore ?? 0;

        // Alive counter
        if (alive) {
            alive.classList.remove('hidden');
            if (aliveV) aliveV.innerText = `🟢${data.greenAlive ?? '?'} 🔵${data.blueAlive ?? '?'}`;
        }
    } else {
        // CTF: Row1=RED, Row2=BLUE
        row1.className = 'bg-red-900/60 border-l-4 border-red-500 p-1 flex justify-between items-center px-2';
        lbl1.className = 'text-[10px] font-bold text-red-200';
        lbl1.innerText = 'RED';
        val1.innerText = (data.redScore !== undefined) ? data.redScore : (data.redZoneCount !== undefined ? `${data.redScore ?? 0}` : 0);

        row2.className = 'bg-blue-900/60 border-l-4 border-blue-500 p-1 flex justify-between items-center px-2';
        lbl2.className = 'text-[10px] font-bold text-blue-200';
        lbl2.innerText = 'BLUE';
        val2.innerText = data.blueScore ?? 0;

        if (alive) alive.classList.add('hidden');
    }
}

// ─── DEAD OVERLAY ─────────────────────────────────────────────────────────────
function showDeadOverlay(msg) {
    myAlive = false;
    const overlay = document.getElementById('dead-overlay');
    const msgEl   = document.getElementById('dead-msg');
    if (overlay) { overlay.classList.remove('hidden'); overlay.style.display = 'flex'; }
    if (msgEl)   msgEl.innerText = msg || "En attente de respawn…";
    // Disable fire button visually BUT keep it clickable for strategic-zone respawn
    if (fireBtn) { fireBtn.style.opacity = '0.3'; fireBtn.style.pointerEvents = 'auto'; }
}

function hideDeadOverlay() {
    myAlive = true;
    const overlay = document.getElementById('dead-overlay');
    if (overlay) { overlay.classList.add('hidden'); overlay.style.display = 'none'; }
    // Re-enable fire button
    if (fireBtn) { fireBtn.style.opacity = '1'; fireBtn.style.pointerEvents = 'auto'; }
    showFeedback("RESPAWN !\nBienvenue de retour !", "lime");
}

// ─── CAMERA & SCANNING ────────────────────────────────────────────────────────
let detector = null;
let processingCanvas = null;
let processingCtx    = null;

async function getBestRearCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        // Try to pick the highest resolution back camera
        let bestDevice = null;
        let bestScore = -1;
        for (const device of videoDevices) {
            const label = device.label.toLowerCase();
            // Skip front cameras
            if (label.includes('front') || label.includes('selfie') || label.includes('user') || label.includes('facetime')) continue;
            // Get a short stream to read capabilities
            try {
                const testStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } });
                const testTrack = testStream.getVideoTracks()[0];
                const caps = testTrack.getCapabilities ? testTrack.getCapabilities() : {};
                testStream.getTracks().forEach(t => t.stop());
                const maxW = caps.width ? caps.width.max : 0;
                const maxH = caps.height ? caps.height.max : 0;
                const score = maxW * maxH;
                if (score > bestScore) { bestScore = score; bestDevice = device; }
            } catch(e) { /* skip unavailable */ }
        }
        return bestDevice ? bestDevice.deviceId : null;
    } catch(e) {
        console.warn('Camera enumeration failed', e);
        return null;
    }
}

async function startCamera() {
    try {
        const bestDeviceId = await getBestRearCamera();
        const constraints = bestDeviceId
            ? { video: { deviceId: { exact: bestDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } }
            : { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.play();
        isCameraReady = true;

        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        const settings     = track.getSettings ? track.getSettings() : {};
        console.log('[CAMERA] Using:', track.label, settings);

        try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch(e) {}

        const zoomContainer = document.getElementById('zoom-container');
        const zoomSlider    = document.getElementById('zoom-slider');
        const zoomDisplay   = document.getElementById('zoom-level-display');

        zoomContainer.classList.remove('hidden');
        zoomContainer.classList.add('flex');

        let hasNativeZoom = false;
        if (capabilities.zoom) {
            hasNativeZoom = true;
            zoomSlider.min   = capabilities.zoom.min;
            zoomSlider.max   = capabilities.zoom.max;
            zoomSlider.step  = capabilities.zoom.step || 0.1;
            zoomSlider.value = settings.zoom || 1;
        } else {
            zoomSlider.min = 1; zoomSlider.max = 5; zoomSlider.step = 0.1; zoomSlider.value = 1;
        }

        window.currentZoom = 1.0;

        zoomSlider.addEventListener('input', async (e) => {
            const zoomVal = parseFloat(e.target.value);
            window.currentZoom = zoomVal;
            zoomDisplay.innerText = zoomVal.toFixed(1) + "x";
            if (hasNativeZoom) {
                try { await track.applyConstraints({ advanced: [{ zoom: zoomVal }] }); } catch(e) {}
            } else {
                video.style.transform = `scale(${zoomVal})`;
            }
        });

        if (typeof AR !== 'undefined') {
            detector = new AR.Detector();
            processingCanvas = document.createElement('canvas');
            processingCanvas.width = 400;
            processingCanvas.height = 400;
            processingCtx = processingCanvas.getContext('2d');
            requestAnimationFrame(aimLoop);
        } else {
            console.error("AR Lib not loaded");
        }
    } catch (err) {
        console.error("Camera error:", err);
        alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
    }
}

// ─── AIM LOOP ─────────────────────────────────────────────────────────────────
function aimLoop() {
    if (!isCameraReady || !detector || !processingCtx) { requestAnimationFrame(aimLoop); return; }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const sourceSize = 500;
        const sx = (video.videoWidth - sourceSize) / 2;
        const sy = (video.videoHeight - sourceSize) / 2;

        processingCtx.filter = "none";
        processingCtx.drawImage(video, sx, sy, sourceSize, sourceSize, 0, 0, processingCanvas.width, processingCanvas.height);

        let debugCanvas = document.getElementById('debug-canvas');
        if (!debugCanvas) {
            processingCanvas.id = 'debug-canvas';
            Object.assign(processingCanvas.style, {
                position:'absolute', bottom:'10px', left:'10px',
                width:'120px', height:'120px', border:'2px solid red',
                zIndex:'9999', backgroundColor:'black', display:'none'
            });
            document.body.appendChild(processingCanvas);
            debugCanvas = processingCanvas;
        }
        debugCanvas.style.display = (typeof currentZoom !== 'undefined' && currentZoom > 1.0) ? 'block' : 'none';

        const imageData = processingCtx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);
        try {
            const markers   = detector.detect(imageData);
            const reticle   = document.getElementById('reticle-ring');
            const scanLabel = document.getElementById('scan-label');

            processingCtx.lineWidth = 3;
            if (detector.contours) {
                processingCtx.strokeStyle = "rgba(0,50,255,0.5)";
                for (let c of detector.contours) { processingCtx.beginPath(); for (let p of c) processingCtx.lineTo(p.x,p.y); processingCtx.closePath(); processingCtx.stroke(); }
            }
            if (detector.candidates) {
                processingCtx.strokeStyle = "orange";
                for (let c of detector.candidates) { processingCtx.beginPath(); for (let p of c) processingCtx.lineTo(p.x,p.y); processingCtx.closePath(); processingCtx.stroke(); }
            }

            if (markers && markers.length > 0) {
                const id = markers[0].id;
                processingCtx.lineWidth = 4;
                for (let m of markers) {
                    const c = m.corners;
                    processingCtx.strokeStyle = "lime";
                    processingCtx.beginPath();
                    processingCtx.moveTo(c[0].x,c[0].y); processingCtx.lineTo(c[1].x,c[1].y);
                    processingCtx.lineTo(c[2].x,c[2].y); processingCtx.lineTo(c[3].x,c[3].y);
                    processingCtx.closePath(); processingCtx.stroke();
                    processingCtx.fillStyle="lime"; processingCtx.font="bold 80px Arial";
                    processingCtx.fillText("ID:"+m.id, c[0].x, c[0].y);
                }
                lockedTargetId = id;
                
                // --- AUTO-REGISTRATION ---
                // If we are waiting for registration and see a valid player marker (1-199)
                const idDisplay = document.getElementById('my-id-display');
                if (idDisplay && idDisplay.innerText === "ID: ???" && id >= 1 && id <= 199) {
                    console.log("AUTO-REGISTERING WITH ID:", id);
                    if (typeof handleHit === 'function') handleHit(id);
                }

                // --- AUTO-RESPAWN (MORT + ZONE STRATÉGIQUE) ---
                // If the player is dead and scans a strategic zone (ID >= 200), trigger respawn automatically
                if (!myAlive && id >= 200) {
                    console.log("AUTO-RESPAWN: dead player scanned strategic zone", id);
                    socket.emit('shoot', { id: id, lat: myLat, lon: myLon, placing: false });
                }

                if (reticle)   { reticle.style.borderColor="lime"; reticle.style.boxShadow="0 0 25px lime, inset 0 0 10px lime"; reticle.style.borderWidth="2px"; }
                if (scanLabel) { scanLabel.innerText="LOCKED [ID:"+id+"]"; scanLabel.style.color="lime"; scanLabel.style.textShadow="0 0 5px lime"; }
            } else {
                lockedTargetId = null;
                if (reticle)   { reticle.style.borderColor="rgba(239,68,68,0.5)"; reticle.style.boxShadow="none"; reticle.style.borderWidth="1px"; }
                if (scanLabel) { scanLabel.innerText="SYSTEM READY"; scanLabel.style.color="#f87171"; scanLabel.style.textShadow="none"; }
            }
        } catch(e) { console.error("Detection Error:", e); }
    }
    setTimeout(() => requestAnimationFrame(aimLoop), 200);
}

// ─── GLOBAL TARGET ────────────────────────────────────────────────────────────
let lockedTargetId = null;

// ─── SOUNDS ───────────────────────────────────────────────────────────────────
const shootSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2144/2144-preview.mp3');
const emptySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3');
const boomSound  = new Audio('https://assets.mixkit.co/active_storage/sfx/1698/1698-preview.mp3');
const hitSound   = new Audio('https://assets.mixkit.co/active_storage/sfx/2747/2747-preview.mp3');

// ─── HIT OVERLAY ─────────────────────────────────────────────────────────────
const hitOverlay = document.createElement('div');
hitOverlay.id = 'hit-overlay';
Object.assign(hitOverlay.style, {
    position:'absolute', top:'0', left:'0', width:'100vw', height:'100vh',
    zIndex:'1000', pointerEvents:'none',
    backgroundImage:"url('https://pngimg.com/uploads/broken_glass/broken_glass_PNG27.png')",
    backgroundSize:'cover', backgroundPosition:'center',
    opacity:'0', transition:'opacity 0.2s'
});
document.body.appendChild(hitOverlay);

// ─── FIRE ─────────────────────────────────────────────────────────────────────
fireBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fireBtn.style.transform = "translateX(-50%) scale(0.9)";
    setTimeout(() => fireBtn.style.transform = "translateX(-50%) scale(1)", 100);

    // RESPAWN: dead player fires on a strategic zone to revive
    if (!myAlive) {
        if (lockedTargetId !== null && lockedTargetId >= 200) {
            console.log("RESPAWN via fire button on strategic zone", lockedTargetId);
            socket.emit('shoot', { id: lockedTargetId, lat: myLat, lon: myLon, placing: false });
        } else {
            showFeedback("MORT - Scannez\nune zone stratégique !", "#ff6666");
        }
        return;
    }

    // Reload special
    if (lockedTargetId === 0) { handleHit(0); return; }

    if (ammo <= 0) {
        showFeedback("NO AMMO - SCAN RELOAD (ID 0)", "#ffaa00");
        emptySound.currentTime = 0; emptySound.play().catch(()=>{});
        setTimeout(() => { emptySound.currentTime = 0; emptySound.play().catch(()=>{}); }, 150);
        return;
    }

    shootSound.currentTime = 0;
    shootSound.play().catch(e => {});

    if (lockedTargetId !== null) {
        handleHit(lockedTargetId);
    } else {
        ammo--;
        updateAmmoDisplay();
        showFeedback("MISS", "#fff");
    }
});

// ─── HANDLE HIT ──────────────────────────────────────────────────────────────
let isAdminMode = false;

function handleHit(markerId) {
    console.log("Marker Found:", markerId);

    if (markerId === 256) {
        isAdminMode = true;
        showFeedback("MODE ADMIN ACTIVÉ\nTIREZ SUR UNE ZONE", "cyan");
        return;
    }

    if (markerId === 0) {
        ammo = MAX_AMMO;
        updateAmmoDisplay();
        showFeedback("RELOADED", "#00ff00");
        const reloadSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2579/2579-preview.mp3');
        reloadSound.play().catch(()=>{});
        return;
    }

    if (markerId > 0 && markerId < 256) {
        boomSound.currentTime = 0;
        boomSound.play().catch(()=>{});
    }

    // ALLOW REGISTRATION EVEN IF NO AMMO
    const isWaitingReg = (document.getElementById('my-id-display')?.innerText === "ID: ???");
    
    if (ammo > 0 || isAdminMode || isWaitingReg) {
        if (!isAdminMode && !isWaitingReg) { ammo--; updateAmmoDisplay(); }

        if (markerId >= 200) {
            socket.emit('shoot', { id: markerId, lat: myLat, lon: myLon, placing: isAdminMode });
            if (isAdminMode) { isAdminMode = false; showFeedback("PLACEMENT EN COURS...", "orange"); }
        } else {
            socket.emit('shoot', markerId);
        }
    } else {
        showFeedback("EMPTY!", "#ff0000");
    }
}

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────

socket.on('hit', (data) => {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    hitSound.currentTime = 0;
    hitSound.play().catch(()=>{});

    hitOverlay.style.transition = 'none';
    hitOverlay.style.opacity = '1';
    hitOverlay.style.backgroundColor = 'rgba(255,0,0,0.5)';
    hitOverlay.innerHTML = `<h1 style='color:red;font-size:5rem;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-shadow:0 0 20px black'>${data.lethal ? 'HIT FATAL!' : 'TOUCHÉ!'}</h1>`;
    document.body.style.animation = "shake 0.5s cubic-bezier(.36,.07,.19,.97) both";

    setTimeout(() => {
        hitOverlay.style.transition = 'opacity 1s';
        hitOverlay.style.opacity = '0';
        hitOverlay.style.backgroundColor = 'transparent';
        document.body.style.animation = "none";
        setTimeout(() => hitOverlay.innerHTML = "", 1000);
    }, 1000);
});

socket.on('playerDied', (data) => {
    showDeadOverlay(data.msg);
});

socket.on('playerRespawn', (data) => {
    hideDeadOverlay();
    if (data && data.healer) showFeedback(`SOIGNÉ PAR ${data.healer} !`, "lime");
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
});

socket.on('teamChanged', (data) => {
    // Paint mode: our color was assigned for the first time
    myTeam = data.newTeam;
    const myIdDisplay = document.getElementById('my-id-display');
    if (myIdDisplay) myIdDisplay.innerText = "ID: " + data.newMarkerId;
    updateTeamDisplay(data.newTeam);
    showFeedback(`COULEUR: ${data.newTeam.toUpperCase()}`, data.newTeam === 'green' ? '#00ff88' : '#4488ff');
});

socket.on('shotFeedback', (data) => {
    showFeedback(data.msg, data.color);
});

socket.on('assignedId', (data) => {
    const myIdDisplay = document.getElementById('my-id-display');
    const deadOverlay = document.getElementById('dead-overlay');
    if (data.gameMode) myGameMode = data.gameMode;

    if (data.needsRegistration) {
        // Player joined but hasn't scanned their QR yet
        myTeam = data.team;
        updateTeamDisplay(data.team);
        if (myIdDisplay) myIdDisplay.innerText = "ID: ???";
        
        // Show a non-blocking prompt at the top
        showDeadOverlay(
            myGameMode === 'paint'
                ? "Scannez votre QR code physique\npour vous enregistrer"
                : `Scannez votre QR code physique\n(${data.team.toUpperCase()} = ID 1-49, BLUE = 50-99)`
        );
        
        // Move overlay to top to avoid blocking crosshair
        if (deadOverlay) {
            deadOverlay.style.justifyContent = 'flex-start';
            deadOverlay.style.paddingTop = '10vh';
            deadOverlay.style.pointerEvents = 'none'; // Ensure clicks pass through
        }

        // Override the skull icon text for registration
        const deadTitleEl = document.querySelector('#dead-overlay .text-red-400');
        if (deadTitleEl) { deadTitleEl.innerText = 'EN ATTENTE'; deadTitleEl.style.color = '#00ffff'; }
        const deadIconEl = document.querySelector('#dead-overlay .text-5xl');
        if (deadIconEl) deadIconEl.innerText = '📡';
    } else {
        // Fully registered
        if (myIdDisplay) myIdDisplay.innerText = "ID: " + data.id;
        myTeam = data.team;
        updateTeamDisplay(data.team);
        
        // Reset overlay position and hide it
        if (deadOverlay) {
            deadOverlay.style.justifyContent = 'center';
            deadOverlay.style.paddingTop = '0';
        }
        hideDeadOverlay();
        showFeedback(`ID ASSIGNÉ: ${data.id} | ${data.team.toUpperCase()}`, "#00ffff");
    }
});

socket.on('gameState', (data) => {
    if (data.gameMode) myGameMode = data.gameMode;
    if (data.zones)      globalZones     = data.zones;
    if (data.zoneCoords) globalZoneCoords = data.zoneCoords;
    if (data.players)    globalPlayers    = Object.values(data.players);
    updateScoreBoard(data);
    if (data.players) updateMiniMap(Object.values(data.players));
});

socket.on('playerList', (players) => {
    updateMiniMap(players);
});

socket.on('gameOver', (data) => {
    sessionStorage.removeItem('qrshot_session'); // Prevent auto-rejoin on F5
    const me = data.players[socket.id];
    const overlay = document.createElement('div');
    overlay.className = 'game-over-screen';

    let winnerText = "ÉGALITÉ";
    let color = "#fff";
    const mode = data.gameMode || myGameMode;

    if (mode === 'paint') {
        if (data.winner === 'green') { winnerText = "🟢 VICTOIRE VERTE";  color = "#00ff88"; }
        else if (data.winner === 'blue')  { winnerText = "🔵 VICTOIRE BLEUE"; color = "#4488ff"; }
        else { winnerText = "🤝 ÉGALITÉ"; }
    } else {
        if (data.winner === 'red')   { winnerText = "🔴 VICTOIRE ROUGE"; color = "#ff4444"; }
        else if (data.winner === 'blue') { winnerText = "🔵 VICTOIRE BLEUE"; color = "#4488ff"; }
        else { winnerText = "🤝 ÉGALITÉ"; }
    }

    const fs = data.finalScores || {};
    const scoresHTML = (mode === 'paint')
        ? `VERT: ${fs.green ?? 0} pts &nbsp;|&nbsp; BLEU: ${fs.blue ?? 0} pts`
        : `ROUGE: ${fs.red ?? 0} pts &nbsp;|&nbsp; BLEU: ${fs.blue ?? 0} pts`;

    overlay.innerHTML = `
        <div class="winner-title" style="color:${color}">${winnerText}</div>
        <div class="stats-container">
            <h3 style="border-bottom:2px solid #67e8f9;padding-bottom:10px">RAPPORT DE MISSION</h3>
            <div class="stats-grid">
                <div class="stat-item">SCORE <span class="stat-value">${me ? me.score : 0}</span></div>
                <div class="stat-item">ÉLIMINATIONS <span class="stat-value">${me ? me.kills : 0}</span></div>
                <div class="stat-item">MORTS <span class="stat-value">${me ? me.deaths : 0}</span></div>
                <div class="stat-item">ZONES <span class="stat-value">${me ? me.captures : 0}</span></div>
            </div>
            <div style="margin-top:20px;font-size:1rem;color:#aaa">${scoresHTML}</div>
        </div>
        <button class="btn primary" style="margin-top:30px" onclick="sessionStorage.removeItem('qrshot_session'); location.reload()">RETOUR BASE</button>
    `;
    document.body.appendChild(overlay);
});

// ─── MINIMAP ──────────────────────────────────────────────────────────────────
function updateMiniMap(players) {
    const map = document.getElementById('mini-map');
    document.querySelectorAll('.player-marker, .zone-marker').forEach(m => m.remove());

    if (!map.querySelector('.radar-line')) {
        const radar = document.createElement('div');
        radar.className = 'radar-line';
        map.appendChild(radar);
        const center = document.createElement('div');
        Object.assign(center.style, { position:'absolute', top:'50%', left:'50%', width:'6px', height:'6px', background:'white', borderRadius:'50%', transform:'translate(-50%,-50%)', boxShadow:'0 0 4px black', zIndex:'5' });
        map.appendChild(center);
        [12.5, 25, 50].forEach(d => {
            const ring = document.createElement('div');
            ring.className = 'radar-ring';
            Object.assign(ring.style, { position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:d+'%', height:d+'%', borderRadius:'50%', border:'1px dashed rgba(255,255,255,0.3)', pointerEvents:'none', boxSizing:'border-box' });
            map.appendChild(ring);
        });
    }

    let north = map.querySelector('.north-marker');
    if (!north) {
        north = document.createElement('div');
        north.className = 'north-marker';
        north.innerText = 'N';
        Object.assign(north.style, { position:'absolute', color:'red', fontWeight:'bold', fontSize:'12px', transform:'translate(-50%,-50%)' });
        map.appendChild(north);
    }
    const theta_rad = (currentHeading || 0) * Math.PI / 180;
    const nav_angle = -Math.PI / 2 - theta_rad;
    north.style.left = (50 + 45 * Math.cos(nav_angle)) + '%';
    north.style.top  = (50 + 45 * Math.sin(nav_angle)) + '%';

    console.log("v1.2.1 - BUILD: 2026-03-24 | MODE: AUTO-REGISTER");
    const debugEl = document.getElementById('game-code-display');
    if (debugEl) debugEl.innerText = `CODE: ${activeGameCode || '?'} | v1.2.5 | H: ${Math.round(currentHeading)} | P: ${players.length}`;

    const R_h = 6371e3;
    const maxDist_h = 50;
    const scale_h = 50 / maxDist_h;
    const theta_h = (currentHeading || 0) * Math.PI / 180;

    const project = (lat, lon) => {
        const pLat = lat || 0, pLon = lon || 0, mLat = myLat || 0, mLon = myLon || 0;
        const dLat = (pLat - mLat) * Math.PI / 180;
        const dLon = (pLon - mLon) * Math.PI / 180;
        const dx = dLon * Math.cos((mLat + pLat) / 2 * Math.PI / 180) * R_h;
        const dy = dLat * R_h;
        const rx = dx * Math.cos(theta_h) - dy * Math.sin(theta_h);
        const ry = dx * Math.sin(theta_h) + dy * Math.cos(theta_h);
        let px = rx * scale_h, py = -ry * scale_h;
        const dist = Math.sqrt(px*px + py*py);
        if (dist > 40) { const a = Math.atan2(py,px); px=40*Math.cos(a); py=40*Math.sin(a); }
        return { px, py };
    };

    if (globalZoneCoords) {
        Object.entries(globalZoneCoords).forEach(([id, coords]) => {
            if (!coords || !coords.lat) return;
            const pos = project(coords.lat, coords.lon);
            const marker = document.createElement('div');
            marker.className = 'zone-marker';
            let color = 'orange';
            if (globalZones && globalZones[id] === 'red')   color = '#ff4444';
            if (globalZones && globalZones[id] === 'blue')  color = '#4488ff';
            if (globalZones && globalZones[id] === 'green') color = '#00ff88';
            Object.assign(marker.style, { position:'absolute', width:'12px', height:'12px', backgroundColor:color, border:'2px solid white', transform:'translate(-50%,-50%)', zIndex:'4', left:(50+pos.px)+'%', top:(50+pos.py)+'%', fontSize:'8px', color:'black', display:'flex', justifyContent:'center', alignItems:'center', fontWeight:'bold' });
            marker.innerText = id;
            map.appendChild(marker);
        });
    }

    const myIdDisplay = document.getElementById('my-id-display');
    players.forEach(p => {
        const isMe = (p.id === socket.id) || (myIdDisplay && parseInt(myIdDisplay.innerText.replace('ID: ','')) === p.markerId);
        if (isMe) return;
        const pos = project(p.lat, p.lon);
        const marker = document.createElement('div');
        marker.className = `player-marker ${p.team}`;
        marker.innerText = p.markerId;

        let dotColor = '#4488ff'; // default blue
        if (p.team === 'red')   dotColor = '#ff4444';
        if (p.team === 'green') dotColor = '#00cc66';
        if (!p.alive)           dotColor = '#555'; // dead players are gray

        Object.assign(marker.style, {
            position:'absolute', width:'14px', height:'14px', borderRadius:'50%',
            backgroundColor: dotColor, border:'2px solid white', zIndex:'6',
            fontSize:'9px', fontWeight:'bold', color:'#fff', display:'flex',
            justifyContent:'center', alignItems:'center',
            left:(50+pos.px)+'%', top:(50+pos.py)+'%',
            opacity: p.alive ? '1' : '0.4'
        });
        map.appendChild(marker);
    });
}

// ─── TEAM DISPLAY ────────────────────────────────────────────────────────────
function updateTeamDisplay(team) {
    const el = document.getElementById('my-team');
    if (!el) return;
    el.innerText = team.toUpperCase();
    const colors = { red:'#ff4444', blue:'#4488ff', green:'#00cc66', spectator:'#aaa' };
    el.style.color = colors[team] || '#fff';
}

// ─── AMMO ─────────────────────────────────────────────────────────────────────
function updateAmmoDisplay() {
    const el = document.getElementById('ammo-count');
    if (!el) return;
    el.innerText = ammo + "/" + MAX_AMMO;
    el.style.color = (ammo === 0) ? 'red' : '#60a5fa';
}

// ─── SHOW FEEDBACK ────────────────────────────────────────────────────────────
function showFeedback(text, color) {
    feedbackMsg.innerText = text;
    feedbackMsg.style.color = color;
    feedbackMsg.classList.remove('hidden');
    feedbackMsg.style.animation = 'none';
    feedbackMsg.offsetHeight; /* reflow */
    feedbackMsg.style.animation = 'popup 1.5s ease-out forwards';
    setTimeout(() => feedbackMsg.classList.add('hidden'), 1500);
}

// ─── UPGRADE MODAL ────────────────────────────────────────────────────────────
const upgradeModal   = document.getElementById('modal-upgrade');
const upgradeReasonEl = document.getElementById('upgrade-reason');
const upgradeInputEl  = document.getElementById('upgrade-code-input');
const btnSubmitUpgradeEl = document.getElementById('btn-submit-upgrade');
const btnCancelUpgradeEl = document.getElementById('btn-cancel-upgrade');

if (socket) {
    socket.on('askForCode', (data) => {
        if (upgradeModal) { upgradeModal.classList.remove('hidden'); if (upgradeReasonEl) upgradeReasonEl.innerText = data.msg || "Mise à niveau requise"; if (upgradeInputEl) upgradeInputEl.value = ""; }
    });
    socket.on('planUnlocked', (data) => {
        if (upgradeModal) upgradeModal.classList.add('hidden');
        if (typeof showFeedback === 'function') showFeedback(data.msg, "#4ade80");
    });
}

if (btnSubmitUpgradeEl) {
    btnSubmitUpgradeEl.addEventListener('click', () => {
        const code = upgradeInputEl ? upgradeInputEl.value : "";
        if (code && code.trim().length > 0) socket.emit('unlockPlan', { gameCode: activeGameCode, code });
    });
}
if (btnCancelUpgradeEl) {
    btnCancelUpgradeEl.addEventListener('click', () => { if (upgradeModal) upgradeModal.classList.add('hidden'); });
}
