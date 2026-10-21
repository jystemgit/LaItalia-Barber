UPDATE business_hours
SET start_times = array_remove(start_times, '17:30'::time)
WHERE weekday = 3;
