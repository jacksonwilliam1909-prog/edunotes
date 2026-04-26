-- ============================================================
-- EduNotes — Schema SQL completo e revisado para Supabase
-- Seguro para rodar em banco NOVO ou EXISTENTE (idempotente)
-- Execute integralmente no SQL Editor do painel Supabase
-- ============================================================

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELAS
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── notebooks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notebooks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#4F46E5',
  icon       TEXT NOT NULL DEFAULT '📓',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── notes (inclui colunas PDF desde o início) ───────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notebook_id     UUID REFERENCES public.notebooks(id) ON DELETE SET NULL,
  title           TEXT NOT NULL DEFAULT '',
  content         JSONB NOT NULL DEFAULT '{}',
  is_favorite     BOOLEAN NOT NULL DEFAULT false,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  pdf_url         TEXT,
  pdf_annotations JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Migração: garante colunas PDF para bancos que já existem sem elas
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS pdf_url         TEXT,
  ADD COLUMN IF NOT EXISTS pdf_annotations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── tags ────────────────────────────────────────────────────
-- UNIQUE(user_id, name) impede tags duplicadas por usuário
CREATE TABLE IF NOT EXISTS public.tags (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#4F46E5',
  UNIQUE  (user_id, name)
);

-- Adiciona a constraint de unicidade se a tabela já existia sem ela
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tags_user_id_name_key'
      AND conrelid = 'public.tags'::regclass
  ) THEN
    ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);
  END IF;
END $$;

-- ── note_tags ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.note_tags (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================

-- notes — lookups principais
CREATE INDEX IF NOT EXISTS idx_notes_user_id     ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_notebook_id ON public.notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at  ON public.notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_created_at  ON public.notes(created_at DESC);

-- notes — índices parciais para filtros comuns (Favorites / pinned)
CREATE INDEX IF NOT EXISTS idx_notes_favorite
  ON public.notes(user_id, updated_at DESC)
  WHERE is_favorite = true;

CREATE INDEX IF NOT EXISTS idx_notes_pinned
  ON public.notes(user_id, updated_at DESC)
  WHERE is_pinned = true;

-- notes — busca por título (ilike com pg_trgm seria ideal, mas gin simples funciona)
CREATE INDEX IF NOT EXISTS idx_notes_content ON public.notes USING gin(content);

-- notebooks
CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON public.notebooks(user_id);

-- tags
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);

-- note_tags — lookup inverso (quais notas têm uma tag)
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON public.note_tags(tag_id);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- ── updated_at automático ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_updated_at ON public.notes;
CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS notebooks_updated_at ON public.notebooks;
CREATE TRIGGER notebooks_updated_at
  BEFORE UPDATE ON public.notebooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── criar profile ao registrar usuário ─────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;

-- ── profiles ────────────────────────────────────────────────
-- Remove política legada genérica se existir
DROP POLICY IF EXISTS "profiles: own data"    ON public.profiles;
DROP POLICY IF EXISTS "profiles: select own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles: insert own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles: update own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles: delete own"  ON public.profiles;

CREATE POLICY "profiles: select own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: insert own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: update own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: delete own" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- ── notebooks ───────────────────────────────────────────────
DROP POLICY IF EXISTS "notebooks: own data"   ON public.notebooks;
DROP POLICY IF EXISTS "notebooks: select own" ON public.notebooks;
DROP POLICY IF EXISTS "notebooks: insert own" ON public.notebooks;
DROP POLICY IF EXISTS "notebooks: update own" ON public.notebooks;
DROP POLICY IF EXISTS "notebooks: delete own" ON public.notebooks;

CREATE POLICY "notebooks: select own" ON public.notebooks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notebooks: insert own" ON public.notebooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notebooks: update own" ON public.notebooks
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notebooks: delete own" ON public.notebooks
  FOR DELETE USING (auth.uid() = user_id);

-- ── notes ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "notes: own data"   ON public.notes;
DROP POLICY IF EXISTS "notes: select own" ON public.notes;
DROP POLICY IF EXISTS "notes: insert own" ON public.notes;
DROP POLICY IF EXISTS "notes: update own" ON public.notes;
DROP POLICY IF EXISTS "notes: delete own" ON public.notes;

CREATE POLICY "notes: select own" ON public.notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notes: insert own" ON public.notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notes: update own" ON public.notes
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notes: delete own" ON public.notes
  FOR DELETE USING (auth.uid() = user_id);

-- ── tags ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tags: own data"   ON public.tags;
DROP POLICY IF EXISTS "tags: select own" ON public.tags;
DROP POLICY IF EXISTS "tags: insert own" ON public.tags;
DROP POLICY IF EXISTS "tags: update own" ON public.tags;
DROP POLICY IF EXISTS "tags: delete own" ON public.tags;

CREATE POLICY "tags: select own" ON public.tags
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tags: insert own" ON public.tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tags: update own" ON public.tags
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tags: delete own" ON public.tags
  FOR DELETE USING (auth.uid() = user_id);

-- ── note_tags ───────────────────────────────────────────────
-- Acesso autorizado via nota do próprio usuário
DROP POLICY IF EXISTS "note_tags: own data"   ON public.note_tags;
DROP POLICY IF EXISTS "note_tags: select own" ON public.note_tags;
DROP POLICY IF EXISTS "note_tags: insert own" ON public.note_tags;
DROP POLICY IF EXISTS "note_tags: delete own" ON public.note_tags;

CREATE POLICY "note_tags: select own" ON public.note_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.notes
      WHERE notes.id = note_tags.note_id
        AND notes.user_id = auth.uid()
    )
  );

CREATE POLICY "note_tags: insert own" ON public.note_tags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes
      WHERE notes.id = note_tags.note_id
        AND notes.user_id = auth.uid()
    )
  );

CREATE POLICY "note_tags: delete own" ON public.note_tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.notes
      WHERE notes.id = note_tags.note_id
        AND notes.user_id = auth.uid()
    )
  );

-- ============================================================
-- STORAGE: bucket de PDFs
-- ============================================================

-- Criar bucket público (upsert seguro)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Remove políticas antigas para recriar de forma idempotente
DROP POLICY IF EXISTS "pdfs: upload own"  ON storage.objects;
DROP POLICY IF EXISTS "pdfs: read own"    ON storage.objects;
DROP POLICY IF EXISTS "pdfs: update own"  ON storage.objects;
DROP POLICY IF EXISTS "pdfs: delete own"  ON storage.objects;

-- Cada usuário só opera na pasta {user_id}/
CREATE POLICY "pdfs: upload own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "pdfs: read own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "pdfs: update own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "pdfs: delete own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
