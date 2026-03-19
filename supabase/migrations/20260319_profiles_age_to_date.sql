alter table public.profiles
alter column age type date
using (
  case
    when age is null then null
    else make_date(extract(year from current_date)::int - age::int, 1, 1)
  end
);
