alter table public.profiles
add column if not exists country_code text
check (country_code is null or country_code ~ '^[A-Za-z]{2}$');
