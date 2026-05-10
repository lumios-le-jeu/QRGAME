-- ─── QRGAME Supabase Schema ───────────────────────────────────────────────────
-- Run this in Supabase SQL Editor

-- 1. Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pseudo TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Game sessions (one row per player per game)
CREATE TABLE IF NOT EXISTS public.game_sessions (
    id BIGSERIAL PRIMARY KEY,
    player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    pseudo TEXT NOT NULL,
    game_code TEXT NOT NULL,
    game_name TEXT,
    game_mode TEXT NOT NULL DEFAULT 'ctf',
    team TEXT,
    score INTEGER DEFAULT 0,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    captures INTEGER DEFAULT 0,
    rank INTEGER,          -- rank within the game (1st, 2nd...)
    winner BOOLEAN DEFAULT FALSE,
    played_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, only write their own
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Game sessions: anyone can read, server (service role) can write
CREATE POLICY "Game sessions are viewable by everyone" ON public.game_sessions
    FOR SELECT USING (true);

CREATE POLICY "Service role can insert game sessions" ON public.game_sessions
    FOR INSERT WITH CHECK (true);

-- 4. Index for fast player history lookup
CREATE INDEX IF NOT EXISTS idx_game_sessions_player_id ON public.game_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_code ON public.game_sessions(game_code);
