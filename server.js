const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Game State
const games = {}; // { [gameCode]: { status, teams, players, zones } }
const socketMap = {}; // socket.id -> gameCode

function generateCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function getDistanceInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0; // Bypass if invalid
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // --- CREATE GAME ---
    socket.on('createGame', (data, callback) => {
        const code = generateCode();

        let durationMinutes = parseInt(data.duration) || 15;
        let teamsCount = parseInt(data.teams) || 2;
        let maxPlayers = parseInt(data.maxPlayers) || 5;
        const resIcon = data.reservationCode ? "🔒" : "🆓";

        // LIMITS ENFORCEMENT
        // Free Default: 2 Teams, 5 Players, 30 Minutes
        const isStandardLimits = (teamsCount <= 2 && maxPlayers <= 5 && durationMinutes <= 30);

        if (!isStandardLimits) {
            const validCodes = ['COMMANDO_QR', 'GENERAL_QR'];
            if (!data.reservationCode || !validCodes.includes(data.reservationCode.toUpperCase())) {
                // Reject creation if limits exceeded without valid code
                callback({
                    success: false,
                    error: "LIMITES DÉPASSÉES",
                    msg: "Pour dépasser 2 Équipes, 5 Joueurs ou 30 Minutes, un CODE DE RÉSERVATION est requis (Pack Commando/Général)."
                });
                return;
            }
        }

        const duration = durationMinutes * 60 * 1000; // Minutes to ms

        games[code] = {
            id: code,
            name: data.name,
            teamsCount: teamsCount,
            maxPlayers: maxPlayers,
            duration: duration,
            startTime: Date.now(),
            endTime: Date.now() + duration,
            lat: data.lat,
            lon: data.lon,
            players: {},
            zones: {},
            status: 'waiting'
        };

        console.log(`Game created: ${code} [${resIcon}] (T:${teamsCount}, P:${maxPlayers}, ${durationMinutes}m)`);
        callback({ success: true, gameCode: code });
    });

    // --- JOIN GAME ---
    socket.on('joinGame', (data) => {
        const actualGameCode = Object.keys(games).find(code => code === data.gameCode);

        if (!actualGameCode) {
            socket.emit('error', 'Game not found');
            return;
        }

        const game = games[actualGameCode];

        // CHECK DISTANCE (500m limit)
        if (game.lat && game.lon) {
            const dist = getDistanceInKm(game.lat, game.lon, data.lat, data.lon);
            console.log(`Join attempt from distance: ${dist.toFixed(3)} km`);
            if (dist > 0.5) { // 500m
                socket.emit('error', `TROP LOIN DU QG ! (${(dist * 1000).toFixed(0)}m > 500m)`);
                return;
            }
        }

        socket.join(actualGameCode);
        socketMap[socket.id] = actualGameCode;

        // AUTO-BALANCE (Skip if spectator)
        if (data.team !== 'spectator' && (!data.team || data.team === 'auto' || data.team === 'null')) {
            const players = Object.values(game.players);
            const redCount = players.filter(p => p.team === 'red').length;
            const blueCount = players.filter(p => p.team === 'blue').length;

            if (redCount < blueCount) data.team = 'red';
            else if (blueCount < redCount) data.team = 'blue';
            else data.team = Math.random() < 0.5 ? 'red' : 'blue';

            console.log(`[AUTO-BALANCE] P(${redCount}) vs B(${blueCount}) -> Assigned ${data.team}`);
        }

        // ASSIGN MARKER ID
        let markerId = -1;
        const usedIds = Object.values(game.players).map(p => p.markerId);

        if (data.team === 'spectator') {
            markerId = 256; // Admin Spectator
        } else if (data.username === 'Admin') {
            markerId = 256;
        } else {
            if (data.team === 'red') {
                for (let i = 1; i <= 49; i++) {
                    if (!usedIds.includes(i)) { markerId = i; break; }
                }
            } else if (data.team === 'blue') {
                for (let i = 50; i <= 99; i++) {
                    if (!usedIds.includes(i)) { markerId = i; break; }
                }
            }
        }

        if (markerId === -1) {
            socket.emit('error', `Team ${data.team} is full or no ID available`);
            return;
        }

        // CHECK MAX PLAYERS
        const currentPlayers = Object.keys(game.players).length;
        const limitPlayers = game.maxPlayers || 5;
        if (currentPlayers >= limitPlayers) {
            socket.emit('error', `SERVER FULL (${currentPlayers}/${limitPlayers} Joueurs Max)`);
            return;
        }

        game.players[socket.id] = {
            id: socket.id,
            username: data.username,
            team: data.team,
            markerId: markerId,
            score: 0,
            ammo: 6,
            lives: 3,
            kills: 0,
            deaths: 0,
            captures: 0,
            lat: data.lat || 0,
            lon: data.lon || 0,
            lastHitTime: 0
        };

        socket.emit('assignedId', { id: markerId, team: data.team });
        console.log(`${data.username} joined game ${actualGameCode} (Team ${data.team}) - ID: ${markerId}`);

        io.to(actualGameCode).emit('playerList', Object.values(game.players));
        io.to(actualGameCode).emit('gameState', {
            players: game.players,
            zones: game.zones,
            redZoneCount: Object.values(game.zones).filter(t => t === 'red').length,
            blueZoneCount: Object.values(game.zones).filter(t => t === 'blue').length,
            startTime: game.startTime,
            endTime: game.endTime
        });
    });

    // --- DISCOVER NEARBY GAMES ---
    socket.on('req_nearby_games', (coords) => {
        if (!coords || !coords.lat || !coords.lon) {
            socket.emit('res_nearby_games', []);
            return;
        }

        const nearby = [];
        Object.values(games).forEach(g => {
            if (g.status === 'ended') return;
            const dist = getDistanceInKm(g.lat, g.lon, coords.lat, coords.lon);
            if (dist < 20.0) { // 20km Radius
                nearby.push({
                    name: g.name,
                    code: g.id,
                    dist: dist,
                    count: Object.keys(g.players || {}).length,
                    status: g.status
                });
            }
        });

        nearby.sort((a, b) => a.dist - b.dist);
        socket.emit('res_nearby_games', nearby.slice(0, 5));
    });

    socket.on('disconnect', () => {
        const gameCode = socketMap[socket.id];
        if (gameCode && games[gameCode]) {
            delete games[gameCode].players[socket.id];
            io.to(gameCode).emit('playerList', Object.values(games[gameCode].players));
        }
        delete socketMap[socket.id];
        console.log('User disconnected:', socket.id);
    });

    // --- SHOOTING & ZONES ---
    socket.on('shoot', (payload) => {
        const gameCode = socketMap[socket.id];
        if (!gameCode || !games[gameCode]) return;

        const game = games[gameCode];
        if (game.status === 'ended') return; // No shooting if ended

        // Parse Payload (ID or Object)
        let targetId = payload;
        let coords = null;
        if (typeof payload === 'object') {
            targetId = payload.id;
            coords = { lat: payload.lat, lon: payload.lon };
        }

        const shooter = game.players[socket.id];
        if (!shooter) return;

        // 1. ZONE CAPTURE (IDs 200-250)
        if (targetId >= 200 && targetId <= 250) {
            // ADMIN PLACING ZONE
            if (payload.placing && shooter.markerId === 1 && coords) {
                if (!game.zoneCoords) game.zoneCoords = {};
                game.zoneCoords[targetId] = coords;

                io.to(gameCode).emit('shotFeedback', {
                    msg: `ZONE ${targetId} DÉPLOYÉE !`,
                    color: 'cyan'
                });
                return;
            }

            // NORMAL CAPTURE CHECK
            if (!game.zoneCoords || !game.zoneCoords[targetId]) {
                socket.emit('shotFeedback', { msg: "ZONE NON DÉPLOYÉE\n(ADMIN REQUIS)", color: 'gray' });
                return;
            }

            // Process Capture
            if (game.zones[targetId] !== shooter.team) {
                game.zones[targetId] = shooter.team;
                shooter.score += 50;
                shooter.captures += 1;

                io.to(gameCode).emit('shotFeedback', {
                    msg: `ZONE ${targetId} CAPTURED BY ${shooter.team.toUpperCase()}!`,
                    color: shooter.team === 'red' ? '#ff0000' : '#0000ff'
                });

                io.to(gameCode).emit('gameState', {
                    players: game.players,
                    zones: game.zones,
                    zoneCoords: game.zoneCoords || {},
                    redZoneCount: Object.values(game.zones).filter(t => t === 'red').length,
                    blueZoneCount: Object.values(game.zones).filter(t => t === 'blue').length
                });
            } else {
                socket.emit('shotFeedback', { msg: "ALREADY YOURS", color: '#ffffff' });
            }
            return;
        }

        // 2. PLAYER HIT
        const targetSocketId = Object.keys(game.players).find(key => game.players[key].markerId === targetId);

        if (targetSocketId) {
            const target = game.players[targetSocketId];

            // IMMUNITY CHECK (10s Delta Kill)
            const now = Date.now();
            if (target.lastHitTime && (now - target.lastHitTime < 10000)) {
                socket.emit('shotFeedback', { msg: `CIBLE INVULNÉRABLE\n(RESPAWN)`, color: 'orange' });
                return;
            }

            if (target.team === shooter.team) {
                shooter.score -= 5;
                socket.emit('shotFeedback', { msg: `TIR AMI: ${target.username}`, color: 'orange' });
            } else {
                // VALID HIT
                target.lastHitTime = now; // Set immunity start

                const isCommander = (target.markerId === 1 || target.markerId === 50);
                const points = isCommander ? 20 : 10;

                shooter.score += points;
                shooter.kills += 1;
                target.lives -= 1;
                target.deaths += 1; // Actually 'deaths' increments, logic could check lives <= 0 to officially die/respawn, but we stick to score for now

                const bonusText = isCommander ? " (COMMANDER!)" : "";
                socket.emit('shotFeedback', { msg: `TOUCHÉ: ${target.username}${bonusText}\n+${points} PTS`, color: 'lime' });

                io.to(targetSocketId).emit('hit', { shooter: shooter.username });
            }

            io.to(gameCode).emit('gameState', {
                players: game.players,
                zones: game.zones,
                redZoneCount: Object.values(game.zones).filter(t => t === 'red').length,
                blueZoneCount: Object.values(game.zones).filter(t => t === 'blue').length
            });

            console.log(`[SHOOT] [Game ${gameCode}] ${shooter.username} (${shooter.team}) fired at Marker ${targetId}`);
        } else {
            // MISS (Target ID not found in game)
            socket.emit('shotFeedback', { msg: `CIBLE INCONNUE (${targetId})`, color: 'gray' });
        }
    });
    socket.on('updatePosition', (coords) => {
        // coords: { lat, lon }
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

// --- GAME LOOP CHECK (State & Time) ---
setInterval(() => {
    Object.values(games).forEach(game => {
        if (game.status === 'active') {
            // Broadcast Game State (Positions, Scores, Immunity)
            io.to(game.id).emit('gameState', {
                players: game.players,
                zones: game.zones,
                zoneCoords: game.zoneCoords || {},
                redZoneCount: Object.values(game.zones).filter(t => t === 'red').length,
                blueZoneCount: Object.values(game.zones).filter(t => t === 'blue').length,
                timeLeft: Math.max(0, game.endTime - Date.now())
            });
        }

        if (game.status === 'waiting' || game.status === 'active') {
            if (Date.now() >= game.endTime) {
                game.status = 'ended';

                // Calculate Winner
                let redScore = 0;
                let blueScore = 0;
                Object.values(game.players).forEach(p => {
                    if (p.team === 'red') redScore += p.score;
                    if (p.team === 'blue') blueScore += p.score;
                });

                const winner = redScore > blueScore ? 'red' : (blueScore > redScore ? 'blue' : 'draw');

                console.log(`Game ${game.id} ENDED. Winner: ${winner}`);

                io.to(game.id).emit('gameOver', {
                    winner: winner,
                    finalScores: { red: redScore, blue: blueScore },
                    players: game.players
                });
            }
        }
    });
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
