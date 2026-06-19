-- Semantic search for Nexxi: pgvector embeddings over published pages.
-- The app keeps a lexical fallback, so search works with or without embeddings populated.
create extension if not exists vector with schema extensions;

alter table public.pages add column if not exists embedding extensions.vector(1536);

-- HNSW cosine index (skips null embeddings); fine for current + future scale.
create index if not exists pages_embedding_hnsw_idx
  on public.pages using hnsw (embedding extensions.vector_cosine_ops);

-- Vector-ranked candidate slugs for PUBLISHED pages that carry an embedding. Returns only
-- slug + similarity; the app fetches the public projection from pages_public and applies
-- launch-visibility, so this never widens the public data surface.
create or replace function public.match_nexie_pages(query_embedding extensions.vector(1536), match_count int default 40)
returns table(slug text, similarity real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.slug, (1 - (p.embedding <=> query_embedding))::real as similarity
  from public.pages p
  where p.is_published = true and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit greatest(1, least(match_count, 100));
$$;

revoke all on function public.match_nexie_pages(extensions.vector, int) from public;
grant execute on function public.match_nexie_pages(extensions.vector, int) to authenticated, service_role;
