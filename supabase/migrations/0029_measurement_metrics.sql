-- Tony Next · 0029 the metrics the Tony workbooks carry: sprint 30 m, foot size (EU) and hand size.
alter table public.measurements drop constraint if exists measurements_metric_check;
alter table public.measurements add constraint measurements_metric_check
  check (metric in ('sprint_10m','sprint_20m','sprint_30m','weight_kg','height_cm','foot_cm','shoe_size','hand_size','cj_cm','yoyo_m','other'));
