-- ============================================================
-- EduNotes — Schema SQL para Supabase
-- Execute no SQL Editor do painel Supabase
-- ============================================================

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notebooks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#4F46E5',
  icon       TEXT NOT NULL DEFAULT '📓',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notebook_id UUID REFERENCES public.notebooks(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     JSONB NOT NULL DEFAULT '{}',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tags (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#4F46E5'
);

CREATE TABLE IF NOT EXISTS public.note_tags (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_notebook_id ON public.notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON public.notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON public.notebooks(user_id);

-- Índice GIN para busca full-text no conteúdo JSON
CREATE INDEX IF NOT EXISTS idx_notes_content ON public.notes USING gin(content);

-- ============================================================
-- MIGRAÇÃO: colunas PDF na tabela notes
-- Execute após o schema inicial se a tabela já existir
-- ============================================================

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS pdf_url         TEXT,
  ADD COLUMN IF NOT EXISTS pdf_annotations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- STORAGE: bucket para PDFs anotados
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Política: cada usuário sobe/lê apenas seus próprios PDFs
CREATE POLICY IF NOT EXISTS "pdfs: upload own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "pdfs: read own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "pdfs: update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY IF NOT EXISTS "pdfs: delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- TRIGGER: atualizar updated_at automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER notebooks_updated_at
  BEFORE UPDATE ON public.notebooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- TRIGGER: criar profile ao registrar usuário
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
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

-- Profiles
CREATE POLICY "profiles: own data" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Notebooks
CREATE POLICY "notebooks: own data" ON public.notebooks
  FOR ALL USING (auth.uid() = user_id);

-- Notes
CREATE POLICY "notes: own data" ON public.notes
  FOR ALL USING (auth.uid() = user_id);

-- Tags
CREATE POLICY "tags: own data" ON public.tags
  FOR ALL USING (auth.uid() = user_id);

-- Note Tags (acesso via nota do usuário)
CREATE POLICY "note_tags: own data" ON public.note_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.notes
      WHERE notes.id = note_tags.note_id
        AND notes.user_id = auth.uid()
    )
  );
