-- Supabase PostgreSQL schema (migration-ready)

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  project_name text not null,
  location text not null,
  built_up_area numeric not null,
  floors integer not null,
  construction_type text,
  rate_profile text,
  created_at timestamptz default now()
);

create table if not exists project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  version_name text not null,
  revision_notes text,
  drawing_files jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists measurement_items (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid references project_versions(id) on delete cascade,
  category text not null,
  description text not null,
  length numeric default 0,
  width numeric default 0,
  height numeric default 0,
  depth numeric default 0,
  diameter numeric default 0,
  quantity numeric default 0,
  quantity_override boolean default false,
  unit text default 'm3',
  formula text default 'length*width*height',
  additions numeric default 0,
  deductions numeric default 0,
  wastage_percent numeric default 0,
  rate numeric default 0,
  amount numeric default 0,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists boq_items (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid references project_versions(id) on delete cascade,
  section text,
  description text not null,
  qty numeric default 0,
  unit text,
  rate numeric default 0,
  total numeric default 0,
  sr_no integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists material_rates (
  id uuid primary key default gen_random_uuid(),
  material_name text not null,
  city text not null,
  unit text not null,
  rate numeric not null,
  updated_at timestamptz default now()
);

create table if not exists labour_rates (
  id uuid primary key default gen_random_uuid(),
  labour_type text not null,
  city text not null,
  unit text not null,
  rate numeric not null,
  updated_at timestamptz default now()
);

create table if not exists export_logs (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid references project_versions(id) on delete cascade,
  export_type text not null,
  created_at timestamptz default now()
);

create index if not exists idx_project_versions_project_id on project_versions(project_id);
create index if not exists idx_measurement_items_version_id on measurement_items(project_version_id);
create index if not exists idx_boq_items_version_id on boq_items(project_version_id);
create index if not exists idx_material_rates_city on material_rates(city);
create index if not exists idx_labour_rates_city on labour_rates(city);