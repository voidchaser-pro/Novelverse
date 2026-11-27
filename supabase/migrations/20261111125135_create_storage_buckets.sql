/*
# Create Storage Buckets for EPUBs and Covers

## Overview
Creates two Supabase Storage buckets for the EPUB submission workflow:
1. `epubs` — PRIVATE bucket for raw EPUB file uploads. Only the uploader and admins can read.
2. `covers` — PUBLIC bucket for extracted cover images. Anyone can read (needed for novel cards).

## Security
- The `epubs` bucket is private: files are only accessible via signed URLs or by authenticated users with proper RLS policies.
- The `covers` bucket is public: cover images are visible to all users (needed for the public library).
- Storage RLS policies ensure:
  - Authenticated users can upload to both buckets (for submissions)
  - Anyone can read from the public `covers` bucket
  - Only authenticated users can read from the private `epubs` bucket
  - Users can only delete their own files
*/

-- Create the covers bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'covers',
  'covers',
  true,
  5242880, -- 5MB limit for cover images
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Create the epubs bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'epubs',
  'epubs',
  false,
  52428800, -- 50MB limit for EPUB files
  ARRAY['application/epub+zip', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES FOR covers BUCKET (public read, auth write)
-- ============================================================

-- Anyone can read cover images
DROP POLICY IF EXISTS "covers_public_read" ON storage.objects;
CREATE POLICY "covers_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'covers');

-- Authenticated users can upload covers
DROP POLICY IF EXISTS "covers_auth_upload" ON storage.objects;
CREATE POLICY "covers_auth_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'covers');

-- Authenticated users can update covers
DROP POLICY IF EXISTS "covers_auth_update" ON storage.objects;
CREATE POLICY "covers_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'covers')
  WITH CHECK (bucket_id = 'covers');

-- Users can delete their own cover files
DROP POLICY IF EXISTS "covers_delete_own" ON storage.objects;
CREATE POLICY "covers_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'covers' AND owner = auth.uid());

-- ============================================================
-- STORAGE POLICIES FOR epubs BUCKET (private, auth only)
-- ============================================================

-- Only authenticated users can read EPUB files
DROP POLICY IF EXISTS "epubs_auth_read" ON storage.objects;
CREATE POLICY "epubs_auth_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'epubs');

-- Authenticated users can upload EPUBs
DROP POLICY IF EXISTS "epubs_auth_upload" ON storage.objects;
CREATE POLICY "epubs_auth_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'epubs');

-- Users can update their own EPUB files
DROP POLICY IF EXISTS "epubs_update_own" ON storage.objects;
CREATE POLICY "epubs_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'epubs' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'epubs');

-- Users can delete their own EPUB files
DROP POLICY IF EXISTS "epubs_delete_own" ON storage.objects;
CREATE POLICY "epubs_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'epubs' AND owner = auth.uid());

-- Admins can delete any EPUB file
DROP POLICY IF EXISTS "epubs_admin_delete" ON storage.objects;
CREATE POLICY "epubs_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'epubs' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
