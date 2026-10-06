# Match reports ↔ matches (one-off, 2026-10-06)

Run in the Supabase dashboard tab (helpers `__q`, `__parse`, `__norm`), not stored as SQL.

- 2025-26: matches without a date in the statistics sheets were paired with the unused PDF match reports
  of the same team: same friendly/competitive folder, same match number, at least one opponent word in common.
  The PDF gives the date. 28 linked (168 of 201 now linked).
- Opponent names cleaned: everything up to "VS" removed ("th -  VS Gorilla FC" → "Gorilla FC"), 44 rows.
- 2026-27: no statistics sheet yet; one match created per PDF report (number, date, opponent, home/away
  from the file name). 23 matches. Scores and line-ups are not in the file names.
- 2024-25: the sheets have no dates and the folder has no match reports, so nothing can be linked.
