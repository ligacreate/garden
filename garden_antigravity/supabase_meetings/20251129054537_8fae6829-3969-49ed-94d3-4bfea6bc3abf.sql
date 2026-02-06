-- Create storage bucket for event images
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true);

-- Create RLS policies for event images bucket
CREATE POLICY "Public read access to event images"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

CREATE POLICY "Admin upload event images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'event-images');

CREATE POLICY "Admin update event images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'event-images');

CREATE POLICY "Admin delete event images"
ON storage.objects FOR DELETE
USING (bucket_id = 'event-images');

-- Create storage bucket for notebook images
INSERT INTO storage.buckets (id, name, public)
VALUES ('notebook-images', 'notebook-images', true);

-- Create RLS policies for notebook images bucket
CREATE POLICY "Public read access to notebook images"
ON storage.objects FOR SELECT
USING (bucket_id = 'notebook-images');

CREATE POLICY "Admin upload notebook images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'notebook-images');

CREATE POLICY "Admin update notebook images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'notebook-images');

CREATE POLICY "Admin delete notebook images"
ON storage.objects FOR DELETE
USING (bucket_id = 'notebook-images');