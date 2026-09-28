UPDATE services SET duration_minutes = CASE name
  WHEN 'Barba' THEN 40
  WHEN 'Corte' THEN 60
  WHEN 'Corte + barba' THEN 90
  ELSE duration_minutes
END
WHERE name IN ('Barba', 'Corte', 'Corte + barba');
