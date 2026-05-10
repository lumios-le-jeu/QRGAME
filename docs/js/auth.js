// ─── SUPABASE AUTH CLIENT ────────────────────────────────────────────────────
// Uses the Supabase UMD bundle loaded in HTML
// NOTE: client named 'db' to avoid conflict with global 'supabase' object from CDN

const SUPABASE_URL = 'https://aidrgxuuysvyaxxsixws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5ijfCot1AUgPJxhAwOOatA_boLPcYmo';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser    = null;
let currentProfile = null;

// ─── INIT: Check existing session on load ────────────────────────────────────
async function initAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadProfile(currentUser.id);
        showAuthenticatedUI();
    } else {
        showUnauthenticatedUI();
    }

    // Listen for auth state changes (login/logout)
    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            await loadProfile(currentUser.id);
            showAuthenticatedUI();
        } else if (event === 'SIGNED_OUT') {
            currentUser    = null;
            currentProfile = null;
            showUnauthenticatedUI();
        }
    });
}

// ─── LOAD PROFILE ────────────────────────────────────────────────────────────
async function loadProfile(userId) {
    const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (!error && data) {
        currentProfile = data;
        const pseudoInput = document.getElementById('join-pseudo');
        if (pseudoInput && data.pseudo) pseudoInput.value = data.pseudo;
        updateUserBadge(data);
    }
    return data;
}

// ─── SIGN UP ─────────────────────────────────────────────────────────────────
async function signUp(email, password, nom, prenom, pseudo) {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;

    // Create profile row
    const { error: profileError } = await db.from('profiles').insert({
        id:     data.user.id,
        email:  email,
        nom:    nom,
        prenom: prenom,
        pseudo: pseudo
    });
    if (profileError) throw profileError;

    return data;
}

// ─── SIGN IN ─────────────────────────────────────────────────────────────────
async function signIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

// ─── SIGN OUT ────────────────────────────────────────────────────────────────
async function signOut() {
    await db.auth.signOut();
}

// ─── SAVE GAME SESSION ───────────────────────────────────────────────────────
async function saveGameSession(gameData) {
    if (!currentUser || !currentProfile) return;
    const { gameCode, gameName, gameMode, team, score, kills, deaths, captures, rank, winner } = gameData;

    const { error } = await db.from('game_sessions').insert({
        player_id: currentUser.id,
        pseudo:    currentProfile.pseudo,
        game_code: gameCode,
        game_name: gameName || 'Mission',
        game_mode: gameMode,
        team,
        score,
        kills,
        deaths,
        captures,
        rank,
        winner
    });
    if (error) console.error('[SUPABASE] Failed to save game session:', error);
    else console.log('[SUPABASE] Game session saved!');
}

// ─── LOAD HISTORY ────────────────────────────────────────────────────────────
async function loadHistory() {
    if (!currentUser) return [];
    const { data, error } = await db
        .from('game_sessions')
        .select('*')
        .eq('player_id', currentUser.id)
        .order('played_at', { ascending: false })
        .limit(50);

    if (error) { console.error('[SUPABASE] History error:', error); return []; }
    return data || [];
}

// ─── UI: Show / Hide auth screens ────────────────────────────────────────────
function showAuthenticatedUI() {
    const authScreen = document.getElementById('page-auth');
    const homeScreen = document.getElementById('page-home');
    if (authScreen) { authScreen.classList.add('hidden'); authScreen.classList.remove('active'); }
    if (homeScreen) { homeScreen.classList.remove('hidden'); homeScreen.classList.add('active'); }

    const pseudoInput = document.getElementById('join-pseudo');
    if (pseudoInput && currentProfile) pseudoInput.value = currentProfile.pseudo;

    updateUserBadge(currentProfile);
}

function showUnauthenticatedUI() {
    const authScreen = document.getElementById('page-auth');
    const homeScreen = document.getElementById('page-home');
    if (homeScreen)  { homeScreen.classList.remove('active'); homeScreen.classList.add('hidden'); }
    if (authScreen)  { authScreen.classList.remove('hidden'); authScreen.classList.add('active'); }
}

function updateUserBadge(profile) {
    const badge = document.getElementById('user-badge');
    if (badge && profile) {
        badge.innerHTML = `<span class="text-cyan-400 font-bold">👤 ${profile.pseudo}</span>`;
    }
}

// ─── HISTORY MODAL ────────────────────────────────────────────────────────────
async function showHistoryModal() {
    const modal = document.getElementById('modal-history');
    if (!modal) return;
    modal.classList.remove('hidden');

    const container = document.getElementById('history-list');
    container.innerHTML = `<div class="text-slate-400 text-sm text-center py-6">Chargement...</div>`;

    const sessions = await loadHistory();
    if (sessions.length === 0) {
        container.innerHTML = `<div class="text-slate-500 text-sm text-center py-8">Aucune partie jouée pour l'instant.<br>Lance-toi !</div>`;
        return;
    }

    const totalGames = sessions.length;
    const totalScore = sessions.reduce((s, g) => s + (g.score || 0), 0);
    const totalKills = sessions.reduce((s, g) => s + (g.kills || 0), 0);
    const wins       = sessions.filter(g => g.winner).length;

    container.innerHTML = `
        <div class="grid grid-cols-4 gap-2 mb-5 text-center">
            <div class="bg-slate-800/60 rounded-lg p-2">
                <div class="text-lg font-black text-cyan-400">${totalGames}</div>
                <div class="text-[10px] text-slate-500 uppercase">Parties</div>
            </div>
            <div class="bg-slate-800/60 rounded-lg p-2">
                <div class="text-lg font-black text-green-400">${wins}</div>
                <div class="text-[10px] text-slate-500 uppercase">Victoires</div>
            </div>
            <div class="bg-slate-800/60 rounded-lg p-2">
                <div class="text-lg font-black text-yellow-400">${totalScore}</div>
                <div class="text-[10px] text-slate-500 uppercase">Score</div>
            </div>
            <div class="bg-slate-800/60 rounded-lg p-2">
                <div class="text-lg font-black text-red-400">${totalKills}</div>
                <div class="text-[10px] text-slate-500 uppercase">Kills</div>
            </div>
        </div>
        <div class="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            ${sessions.map(g => {
                const date      = new Date(g.played_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
                const modeIcon  = g.game_mode === 'paint' ? '🎨' : '🚩';
                const teamColor = g.team === 'red' ? 'text-red-400' : g.team === 'blue' ? 'text-blue-400' : g.team === 'green' ? 'text-green-400' : 'text-slate-400';
                const winBadge  = g.winner ? '<span class="text-xs bg-green-500/20 text-green-400 border border-green-500/40 px-2 py-0.5 rounded-full font-bold">WIN</span>' : '';
                const rankBadge = g.rank ? `<span class="text-xs text-slate-400">#${g.rank}</span>` : '';
                return `
                <div class="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex justify-between items-center gap-2">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span>${modeIcon}</span>
                            <span class="font-bold text-sm text-white truncate">${g.game_name || 'Mission'}</span>
                            ${winBadge}
                        </div>
                        <div class="text-[11px] text-slate-500">${date} · <span class="${teamColor} font-bold uppercase">${g.team || '?'}</span></div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-lg font-black text-cyan-400">${g.score || 0} pts</div>
                        <div class="text-[10px] text-slate-500">${g.kills || 0}K · ${g.deaths || 0}D ${rankBadge}</div>
                    </div>
                </div>`;
            }).join('')}
        </div>
    `;
}

function hideHistoryModal() {
    const modal = document.getElementById('modal-history');
    if (modal) modal.classList.add('hidden');
}

// ─── FORM LOGIC ───────────────────────────────────────────────────────────────
function setupAuthForms() {
    const showSignup = document.getElementById('btn-show-signup');
    const showLogin  = document.getElementById('btn-show-login');
    const formLogin  = document.getElementById('auth-form-login');
    const formSignup = document.getElementById('auth-form-signup');

    showSignup?.addEventListener('click', () => {
        formLogin.classList.add('hidden');
        formSignup.classList.remove('hidden');
    });
    showLogin?.addEventListener('click', () => {
        formSignup.classList.add('hidden');
        formLogin.classList.remove('hidden');
    });

    // ── LOGIN ───────────────────────────────────────────────────────────────
    document.getElementById('btn-auth-login')?.addEventListener('click', async () => {
        const btn      = document.getElementById('btn-auth-login');
        const email    = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errEl    = document.getElementById('auth-error');

        if (!email || !password) { errEl.textContent = 'Remplissez email et mot de passe.'; return; }

        errEl.textContent = '';
        btn.disabled = true; btn.textContent = 'Connexion...';
        try {
            await signIn(email, password);
            // showAuthenticatedUI() is triggered via onAuthStateChange
        } catch (e) {
            console.error('[AUTH] Login error:', e);
            errEl.textContent = e.message || 'Email ou mot de passe incorrect.';
        }
        btn.disabled = false; btn.textContent = 'CONNEXION';
    });

    // ── SIGNUP ──────────────────────────────────────────────────────────────
    document.getElementById('btn-auth-signup')?.addEventListener('click', async () => {
        const btn    = document.getElementById('btn-auth-signup');
        const email  = document.getElementById('signup-email').value.trim();
        const pass   = document.getElementById('signup-password').value;
        const nom    = document.getElementById('signup-nom').value.trim();
        const prenom = document.getElementById('signup-prenom').value.trim();
        const pseudo = document.getElementById('signup-pseudo').value.trim();
        const errEl  = document.getElementById('signup-error');

        errEl.style.color = '#f87171';
        errEl.textContent = '';

        if (!email || !pass || !nom || !prenom || !pseudo) {
            errEl.textContent = 'Tous les champs sont obligatoires.'; return;
        }
        if (pass.length < 6) {
            errEl.textContent = 'Le mot de passe doit faire au moins 6 caractères.'; return;
        }

        btn.disabled = true; btn.textContent = 'Création...';
        try {
            await signUp(email, pass, nom, prenom, pseudo);
            errEl.style.color = '#4ade80';
            errEl.textContent = '✅ Compte créé ! Connectez-vous maintenant.';
            // Switch to login form
            setTimeout(() => {
                formSignup.classList.add('hidden');
                formLogin.classList.remove('hidden');
                document.getElementById('auth-email').value = email;
                document.getElementById('signup-error').textContent = '';
            }, 1500);
        } catch (e) {
            console.error('[AUTH] Signup error:', e);
            errEl.style.color = '#f87171';
            errEl.textContent = e.message || 'Erreur lors de la création du compte.';
        }
        btn.disabled = false; btn.textContent = 'CRÉER MON COMPTE';
    });

    // ── LOGOUT ──────────────────────────────────────────────────────────────
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await signOut();
    });
}

function setupHistoryBtn() {
    document.getElementById('btn-history')?.addEventListener('click', showHistoryModal);
    document.getElementById('btn-close-history')?.addEventListener('click', hideHistoryModal);
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
// Guard against DOMContentLoaded already having fired (script loaded at end of body)
function onDOMReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}

onDOMReady(() => {
    initAuth();
    setupAuthForms();
    setupHistoryBtn();
});
