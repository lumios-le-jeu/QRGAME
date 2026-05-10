const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'docs')));

// Game State
const games = {}; // { [gameCode]: { status, teams, players, zones, gameMode } }
const socketMap = {}; // socket.id -> gameCode

function generateCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function getDistanceInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ─── Helper: build the gameState payload ─────────────────────────────────────
function buildGameState(game) {
    const players = game.players;
    let payload = {
        players,
        zones: game.zones,
        zoneCoords: game.zoneCoords || {},
        gameMode: game.gameMode,
        startTime: game.startTime,
        endTime: game.endTime
    };

    if (game.gameMode === 'ctf') {
        payload.redZoneCount  = Object.values(game.zones).filter(t => t === 'red').length;
        payload.blueZoneCount = Object.values(game.zones).filter(t => t === 'blue').length;

        let rs = 0, bs = 0;
        Object.values(players).forEach(p => {
            if (p.team === 'red')  rs += p.score;
            if (p.team === 'blue') bs += p.score;
        });
        payload.redScore  = rs;
        payload.blueScore = bs;
    } else if (game.gameMode === 'paint') {
        let gs = 0, bs = 0;
        Object.values(players).forEach(p => {
            if (p.team === 'green') gs += p.score;
            if (p.team === 'blue')  bs += p.score;
        });
        payload.greenScore = gs;
        payload.blueScore  = bs;

        const greenAlive = Object.values(players).filter(p => p.team === 'green' && p.alive).length;
        const blueAlive  = Object.values(players).filter(p => p.team === 'blue'  && p.alive).length;
        payload.greenAlive = greenAlive;
        payload.blueAlive  = blueAlive;
    }

    return payload;
}

// ─── Helper: check Paint win condition ────────────────────────────────────────
function checkPaintWin(game) {
    const players = Object.values(game.players);
    const coloredPlayers = players.filter(p => p.team === 'green' || p.team === 'blue');
    if (coloredPlayers.length === 0) return null; // nobody colored yet

    const greenAlive = players.filter(p => p.team === 'green' && p.alive).length;
    const blueAlive  = players.filter(p => p.team === 'blue'  && p.alive).length;

    if (greenAlive === 0 && blueAlive > 0) return 'blue';
    if (blueAlive  === 0 && greenAlive > 0) return 'green';
    return null; // game continues
}

// ─── Helper: end game ────────────────────────────────────────────────────────
function endGame(game, winner, finalScores) {
    game.status = 'ended';
    console.log(`Game ${game.id} ENDED. Winner: ${winner}`);
    io.to(game.id).emit('gameOver', { winner, finalScores, players: game.players, gameMode: game.gameMode });
}

// ─────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // ── CREATE GAME ──────────────────────────────────────────────────────────
    socket.on('createGame', (data, callback) => {
        const code = generateCode();

        const durationMinutes = parseInt(data.duration) || 15;
        const teamsCount      = parseInt(data.teams)    || 2;
        const maxPlayers      = parseInt(data.maxPlayers) || 5;
        const gameMode        = (data.gameMode === 'paint') ? 'paint' : 'ctf';
        const resIcon         = data.reservationCode ? "🔒" : "🆓";
        const duration        = durationMinutes * 60 * 1000;

        games[code] = {
            id: code,
            name: data.name,
            gameMode,
            teamsCount,
            maxPlayers,
            duration,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            lat: data.lat,
            lon: data.lon,
            players: {},
            zones: {},
            zoneCoords: {},
            status: 'waiting'
        };

        console.log(`Game created: ${code} [${resIcon}] Mode:${gameMode} (T:${teamsCount}, P:${maxPlayers}, ${durationMinutes}m)`);
        callback({ success: true, gameCode: code, gameMode });
    });

    // ── JOIN GAME ────────────────────────────────────────────────────────────
    socket.on('joinGame', (data) => {
        const actualGameCode = Object.keys(games).find(code => code === data.gameCode);

        if (!actualGameCode) {
            socket.emit('error', 'Game not found');
            return;
        }

        const game = games[actualGameCode];

        // Distance check
        if (game.lat && game.lon) {
            const dist = getDistanceInKm(game.lat, game.lon, data.lat, data.lon);
            console.log(`Join attempt from distance: ${dist.toFixed(3)} km`);
            if (dist > 0.5) {
                socket.emit('error', `TROP LOIN DU QG ! (${(dist * 1000).toFixed(0)}m > 500m)`);
                return;
            }
        }

        socket.join(actualGameCode);
        socketMap[socket.id] = actualGameCode;

        // Check max players
        const limitPlayers = game.maxPlayers || 5;
        if (Object.keys(game.players).length >= limitPlayers && data.team !== 'spectator' && data.username !== 'Admin') {
            socket.emit('error', `SERVER FULL (${Object.keys(game.players).length}/${limitPlayers} Joueurs Max)`);
            return;
        }

        game.disconnectedPlayers = game.disconnectedPlayers || {};
        if (game.disconnectedPlayers[data.username]) {
            // Restore session
            const p = game.disconnectedPlayers[data.username];
            p.id = socket.id;
            game.players[socket.id] = p;
            delete game.disconnectedPlayers[data.username];
            
            socket.emit('assignedId', { id: p.markerId, team: p.team, gameMode: game.gameMode, needsRegistration: p.markerId === -1 });
            if (p.markerId !== -1) {
                socket.emit('teamChanged', { newTeam: p.team, newMarkerId: p.markerId });
            }
            console.log(`${data.username} reconnected to game ${actualGameCode} (Team ${p.team}, ID ${p.markerId})`);
        } else {
            // ── ASSIGN TEAM & MARKER ID ──────────────────────────────────────────
            let assignedTeam = data.team;
            let markerId = -1; // Will be assigned when player scans their own QR

            if (data.team === 'spectator' || data.username === 'Admin') {
                assignedTeam = 'spectator';
                markerId = 256;
            } else if (game.gameMode === 'paint') {
                assignedTeam = 'red'; // Everyone starts RED — ID assigned on self-scan
            } else {
                // CTF: auto-balance team, ID assigned on self-scan
                if (!assignedTeam || assignedTeam === 'auto' || assignedTeam === 'null') {
                    const players = Object.values(game.players);
                    const redCount  = players.filter(p => p.team === 'red').length;
                    const blueCount = players.filter(p => p.team === 'blue').length;
                    if (redCount < blueCount)       assignedTeam = 'red';
                    else if (blueCount < redCount)  assignedTeam = 'blue';
                    else                            assignedTeam = Math.random() < 0.5 ? 'red' : 'blue';
                    console.log(`[AUTO-BALANCE CTF] R(${redCount}) vs B(${blueCount}) -> ${assignedTeam}`);
                }
            }

            game.players[socket.id] = {
                id: socket.id,
                username: data.username,
                team: assignedTeam,
                markerId, // -1 until self-scan
                score: 0,
                ammo: 6,
                lives: 3,
                kills: 0,
                deaths: 0,
                captures: 0,
                lat: data.lat || 0,
                lon: data.lon || 0,
                lastHitTime: 0,
                // ── State flags ──
                alive: true,
                pendingRespawn: false,
                colorAssigned: (game.gameMode === 'paint') ? false : true
            };

            // Tell client to wait for self-scan
            socket.emit('assignedId', { id: -1, team: assignedTeam, gameMode: game.gameMode, needsRegistration: true });
            console.log(`${data.username} joined game ${actualGameCode} (Team ${assignedTeam}) - Waiting for self-scan`);
        }

        io.to(actualGameCode).emit('playerList', Object.values(game.players));
        io.to(actualGameCode).emit('gameState', buildGameState(game));
    });

    // ── NEARBY GAMES ────────────────────────────────────────────────────────
    socket.on('req_nearby_games', (coords) => {
        if (!coords || !coords.lat || !coords.lon) {
            socket.emit('res_nearby_games', []);
            return;
        }

        const nearby = [];
        Object.values(games).forEach(g => {
            if (g.status === 'ended') return;
            const dist = getDistanceInKm(g.lat, g.lon, coords.lat, coords.lon);
            if (dist < 20.0) {
                nearby.push({
                    name: g.name,
                    code: g.id,
                    dist,
                    count: Object.keys(g.players || {}).length,
                    status: g.status,
                    gameMode: g.gameMode
                });
            }
        });

        nearby.sort((a, b) => a.dist - b.dist);
        socket.emit('res_nearby_games', nearby.slice(0, 5));
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const gameCode = socketMap[socket.id];
        if (gameCode && games[gameCode]) {
            const player = games[gameCode].players[socket.id];
            if (player) {
                games[gameCode].disconnectedPlayers = games[gameCode].disconnectedPlayers || {};
                games[gameCode].disconnectedPlayers[player.username] = player;
                delete games[gameCode].players[socket.id];
                io.to(gameCode).emit('playerList', Object.values(games[gameCode].players));
            }
        }
        delete socketMap[socket.id];
        console.log('User disconnected:', socket.id);
    });

    // ── SHOOT ────────────────────────────────────────────────────────────────
    socket.on('shoot', (payload) => {
        const gameCode = socketMap[socket.id];
        if (!gameCode || !games[gameCode]) return;

        const game = games[gameCode];
        if (game.status === 'ended') return;

        // Parse payload
        let targetId = payload;
        let coords = null;
        if (typeof payload === 'object') {
            targetId = payload.id;
            coords = { lat: payload.lat, lon: payload.lon };
        }

        const shooter = game.players[socket.id];
        if (!shooter) return;

        // ════════════════════════════════════════════════
        //  SELF-REGISTRATION (first scan of own QR)
        //  Player scans a player marker (1-199) while unregistered
        // ════════════════════════════════════════════════
        if (shooter.markerId === -1 && targetId >= 1 && targetId <= 199) {
            const usedIds = Object.values(game.players).map(p => p.markerId);
            if (usedIds.includes(targetId)) {
                socket.emit('shotFeedback', { msg: `ID ${targetId} DÉJÀ PRIS\nChoisissez un autre QR`, color: 'orange' });
                return;
            }
            // Assign the ID
            shooter.markerId = targetId;
            // CTF: derive team from ID range
            if (game.gameMode === 'ctf') {
                if (targetId >= 1 && targetId <= 49)   shooter.team = 'red';
                else if (targetId >= 50 && targetId <= 99) shooter.team = 'blue';
            }
            // Paint: keep 'red', ID locked here
            socket.emit('assignedId', { id: targetId, team: shooter.team, gameMode: game.gameMode, needsRegistration: false });
            socket.emit('shotFeedback', { msg: `ENREGISTRÉ !\nID: ${targetId} | ${shooter.team.toUpperCase()}`, color: 'lime' });
            io.to(gameCode).emit('playerList', Object.values(game.players));
            io.to(gameCode).emit('gameState', buildGameState(game));
            console.log(`[REGISTER][${gameCode}] ${shooter.username} claimed ID ${targetId} (${shooter.team})`);
            return;
        }

        // Unregistered players can only self-scan
        if (shooter.markerId === -1) {
            socket.emit('shotFeedback', { msg: "SCANNEZ VOTRE QR\npour vous enregistrer", color: 'cyan' });
            return;
        }

        // ── Dead shooter can't shoot — EXCEPT for CTF respawn on own zone ────
        if (!shooter.alive && shooter.team !== 'spectator') {
            // Allow dead CTF players with pendingRespawn to reach zone handling below
            const isZoneScan = (typeof targetId === 'number' && targetId >= 200 && targetId <= 250);
            if (!(game.gameMode === 'ctf' && shooter.pendingRespawn && isZoneScan)) {
                if (game.gameMode === 'ctf') {
                    socket.emit('shotFeedback', { msg: "MORT\nScannez votre zone pour revivre", color: 'red' });
                } else {
                    socket.emit('shotFeedback', { msg: "MORT\nFaites-vous soigner par un équipier", color: 'red' });
                }
                return;
            }
        }

        // ════════════════════════════════
        //  ZONE HANDLING (IDs 200-250)
        // ════════════════════════════════
        if (targetId >= 200 && targetId <= 250) {

            // ADMIN PLACING ZONE
            if (payload.placing && shooter.markerId === 1 && coords) {
                game.zoneCoords = game.zoneCoords || {};
                game.zoneCoords[targetId] = coords;
                io.to(gameCode).emit('shotFeedback', { msg: `ZONE ${targetId} DÉPLOYÉE !`, color: 'cyan' });
                return;
            }

            // ── CTF: zone capture or respawn ──────────────────────────────
            if (game.gameMode === 'ctf') {
                if (!game.zoneCoords || !game.zoneCoords[targetId]) {
                    socket.emit('shotFeedback', { msg: "ZONE NON DÉPLOYÉE\n(ADMIN REQUIS)", color: 'gray' });
                    return;
                }

                // RESPAWN CHECK (dead player scanning own-color zone)
                const zoneOwner = game.zones[targetId]; // current holder team
                if (shooter.pendingRespawn) {
                    if (zoneOwner === shooter.team) {
                        shooter.alive = true;
                        shooter.pendingRespawn = false;
                        shooter.lastHitTime = 0; // clear immunity after respawn
                        socket.emit('shotFeedback', { msg: "RESPAWN !\nVous êtes de retour !", color: 'lime' });
                        socket.emit('playerRespawn', {});
                        io.to(gameCode).emit('gameState', buildGameState(game));
                        console.log(`[CTF][${gameCode}] ${shooter.username} RESPAWNED on zone ${targetId} (${zoneOwner})`);
                        return;
                    } else {
                        const ownerLabel = zoneOwner ? zoneOwner.toUpperCase() : 'NEUTRE';
                        socket.emit('shotFeedback', { msg: `ZONE ${ownerLabel}\nScannez une zone ${shooter.team.toUpperCase()}`, color: 'orange' });
                        return;
                    }
                }

                // NORMAL CAPTURE (alive player)
                if (game.zones[targetId] !== shooter.team) {
                    game.zones[targetId] = shooter.team;
                    shooter.score += 50;
                    shooter.captures += 1;
                    io.to(gameCode).emit('shotFeedback', {
                        msg: `ZONE ${targetId} CAPTURÉE PAR ${shooter.team.toUpperCase()} !`,
                        color: shooter.team === 'red' ? '#ff4444' : '#4488ff'
                    });
                    io.to(gameCode).emit('gameState', buildGameState(game));
                } else {
                    socket.emit('shotFeedback', { msg: "DÉJÀ LA VÔTRE", color: '#ffffff' });
                }
                return;
            }

            // ── Paint: zones not used ──────────────────────────────────────
            if (game.gameMode === 'paint') {
                socket.emit('shotFeedback', { msg: "ZONES INUTILISÉES\nen Mode Paint", color: 'gray' });
                return;
            }

            return;
        }

        // ════════════════════════════════
        //  PLAYER HIT
        // ════════════════════════════════
        const targetSocketId = Object.keys(game.players).find(key => game.players[key].markerId === targetId);

        if (!targetSocketId) {
            socket.emit('shotFeedback', { msg: `CIBLE INCONNUE (${targetId})`, color: 'gray' });
            return;
        }

        const target = game.players[targetSocketId];
        const now = Date.now();

        // ── Immunity cooldown (both modes) ───────────────────────────────────
        if (target.lastHitTime && (now - target.lastHitTime < 10000)) {
            socket.emit('shotFeedback', { msg: `CIBLE INVULNÉRABLE\n(COOLDOWN)`, color: 'orange' });
            return;
        }

        // ════════════════════════════════════════════════
        //  MODE CTF
        // ════════════════════════════════════════════════
        if (game.gameMode === 'ctf') {
            if (!target.alive) {
                socket.emit('shotFeedback', { msg: `${target.username} EST DÉJÀ MORT`, color: 'gray' });
                return;
            }

            if (target.team === shooter.team) {
                shooter.score -= 5;
                socket.emit('shotFeedback', { msg: `TIR AMI: ${target.username}`, color: 'orange' });
            } else {
                // Valid kill
                target.lastHitTime = now;
                target.alive = false;
                target.pendingRespawn = true;
                target.deaths += 1;

                const isCommander = (target.markerId === 1 || target.markerId === 50);
                const points = isCommander ? 20 : 10;
                shooter.score += points;
                shooter.kills += 1;

                const bonusText = isCommander ? " (COMMANDER!)" : "";
                socket.emit('shotFeedback', { msg: `TOUCHÉ: ${target.username}${bonusText}\n+${points} PTS`, color: 'lime' });
                io.to(targetSocketId).emit('hit', { shooter: shooter.username, lethal: true });
                io.to(targetSocketId).emit('playerDied', { msg: "MORT - Scannez votre zone pour revivre" });
            }

            io.to(gameCode).emit('gameState', buildGameState(game));
            console.log(`[CTF][${gameCode}] ${shooter.username} (${shooter.team}) -> ${target.username}`);
            return;
        }

        // ════════════════════════════════════════════════
        //  MODE PAINT
        // ════════════════════════════════════════════════
        if (game.gameMode === 'paint') {

            // ── Shooter shoots a DEAD teammate → HEAL ────────────────────────
            if (!target.alive && target.team === shooter.team && target.team !== 'red') {
                target.alive = true;
                target.lastHitTime = now; // give brief immunity after heal
                shooter.score += 5;
                socket.emit('shotFeedback', { msg: `SOIGNÉ: ${target.username}\n+5 PTS`, color: 'lime' });
                io.to(targetSocketId).emit('playerRespawn', { healer: shooter.username });
                io.to(gameCode).emit('gameState', buildGameState(game));
                return;
            }

            // ── Target is dead and NOT same team → nothing ───────────────────
            if (!target.alive) {
                socket.emit('shotFeedback', { msg: `${target.username} EST MORT`, color: 'gray' });
                return;
            }

            // ── Target is RED (uncolored) → first hit assigns color ──────────
            if (!target.colorAssigned) {
                // Assign opposite color to shooter if shooter is colored, else balance
                let newColor;
                if (shooter.team === 'green')       newColor = 'blue';
                else if (shooter.team === 'blue')   newColor = 'green';
                else {
                    const greenCount = Object.values(game.players).filter(p => p.team === 'green').length;
                    const blueCount  = Object.values(game.players).filter(p => p.team === 'blue').length;
                    if (greenCount < blueCount)      newColor = 'green';
                    else if (blueCount < greenCount) newColor = 'blue';
                    else                             newColor = Math.random() < 0.5 ? 'green' : 'blue';
                }

                // Keep the original markerId — QR code doesn't change!
                target.team = newColor;
                target.colorAssigned = true;
                target.lastHitTime = now;
                shooter.score += 10;
                shooter.kills += 1;

                socket.emit('shotFeedback', { msg: `${target.username} → ${newColor.toUpperCase()}\n+10 PTS`, color: newColor === 'green' ? '#00ff88' : '#4488ff' });
                // Send teamChanged with same markerId so client stays in sync
                io.to(targetSocketId).emit('teamChanged', { newTeam: newColor, newMarkerId: target.markerId });
                io.to(targetSocketId).emit('hit', { shooter: shooter.username, lethal: false });

                io.to(gameCode).emit('gameState', buildGameState(game));
                console.log(`[PAINT][${gameCode}] ${target.username} colored ${newColor} by ${shooter.username} (ID ${target.markerId} unchanged)`);
                return;
            }

            // ── Target colored: same team → heal attempt (target alive, no need to heal) ─
            if (target.team === shooter.team) {
                shooter.score -= 5;
                socket.emit('shotFeedback', { msg: `TIR AMI: ${target.username}`, color: 'orange' });
                return;
            }

            // ── Target colored, different team, alive → KILL ─────────────────
            target.lastHitTime = now;
            target.alive = false;
            target.deaths += 1;
            shooter.score += 10;
            shooter.kills += 1;

            socket.emit('shotFeedback', { msg: `ÉLIMINÉ: ${target.username}\n+10 PTS`, color: 'lime' });
            io.to(targetSocketId).emit('hit', { shooter: shooter.username, lethal: true });
            io.to(targetSocketId).emit('playerDied', { msg: "MORT - Un équipier doit scanner votre QR pour vous soigner" });

            // Check win condition immediately
            const paintWinner = checkPaintWin(game);
            if (paintWinner) {
                const gs = Object.values(game.players).filter(p => p.team === 'green').reduce((s, p) => s + p.score, 0);
                const bs = Object.values(game.players).filter(p => p.team === 'blue').reduce((s, p) => s + p.score, 0);
                endGame(game, paintWinner, { green: gs, blue: bs });
                return;
            }

            io.to(gameCode).emit('gameState', buildGameState(game));
            console.log(`[PAINT][${gameCode}] ${shooter.username} (${shooter.team}) killed ${target.username}`);
        }
    });

    // ── UPDATE POSITION ──────────────────────────────────────────────────────
    socket.on('updatePosition', (coords) => {
        const gameCode = socketMap[socket.id];
        if (gameCode && games[gameCode]) {
            const player = games[gameCode].players[socket.id];
            if (player) {
                player.lat = coords.lat;
                player.lon = coords.lon;
            }
        }
    });
});

// ─── GAME LOOP ───────────────────────────────────────────────────────────────
setInterval(() => {
    Object.values(games).forEach(game => {
        if (game.status === 'active') {
            const state = buildGameState(game);
            state.timeLeft = Math.max(0, game.endTime - Date.now());
            io.to(game.id).emit('gameState', state);
        }

        if ((game.status === 'waiting' || game.status === 'active') && Date.now() >= game.endTime) {
            const players = Object.values(game.players);

            if (game.gameMode === 'ctf') {
                let redScore = 0, blueScore = 0;
                players.forEach(p => {
                    if (p.team === 'red')  redScore  += p.score;
                    if (p.team === 'blue') blueScore += p.score;
                });
                const winner = redScore > blueScore ? 'red' : (blueScore > redScore ? 'blue' : 'draw');
                endGame(game, winner, { red: redScore, blue: blueScore });

            } else if (game.gameMode === 'paint') {
                const greenAlive = players.filter(p => p.team === 'green' && p.alive).length;
                const blueAlive  = players.filter(p => p.team === 'blue'  && p.alive).length;
                const greenDeaths = players.filter(p => p.team === 'green').reduce((s, p) => s + p.deaths, 0);
                const blueDeaths  = players.filter(p => p.team === 'blue').reduce((s, p) => s + p.deaths, 0);
                const gs = players.filter(p => p.team === 'green').reduce((s, p) => s + p.score, 0);
                const bs = players.filter(p => p.team === 'blue').reduce((s, p) => s + p.score, 0);

                let winner;
                if (greenAlive > blueAlive)       winner = 'green';
                else if (blueAlive > greenAlive)  winner = 'blue';
                else if (blueDeaths < greenDeaths) winner = 'blue';  // fewer deaths wins tie
                else if (greenDeaths < blueDeaths) winner = 'green';
                else                              winner = 'draw';

                endGame(game, winner, { green: gs, blue: bs });
            }
        }
    });
}, 1000);

// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
