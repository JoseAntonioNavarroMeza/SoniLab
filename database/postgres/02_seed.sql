-- Usuarios de prueba iniciales (ADMIN: admin1234 | STUDENT: alumno123)
INSERT INTO users (name, email, password_hash, role, active) VALUES
('Profesor Administrador', 'admin@sonilab.edu', '$2b$10$Ff8bevaYwvWlWYXJke3J.ef6npWCM5o6E03NUPpLlgXl0wb1oTcda', 'ADMIN', true),
('Alumno Juan Perez', 'juan.perez@sonilab.edu', '$2b$10$28psgKn6JtChPoPmArTH7u.YR4FOQgcux52ZCV707i1lB6OJH6uiK', 'STUDENT', true),
('Alumna Maria Lopez', 'maria.lopez@sonilab.edu', '$2b$10$28psgKn6JtChPoPmArTH7u.YR4FOQgcux52ZCV707i1lB6OJH6uiK', 'STUDENT', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = true;

-- Generación controlada de 120 instrumentos sintéticos (30 por categoría)
INSERT INTO instruments (serial_number, name, category, status, active)
SELECT 
    'STR-' || LPAD(i::text, 4, '0'),
    CASE (i % 3)
        WHEN 0 THEN 'Guitarra Acústica Clásica ' || i
        WHEN 1 THEN 'Violín 4/4 Estudio ' || i
        ELSE 'Bajo Eléctrico Pasivo ' || i
    END,
    'cuerda',
    'AVAILABLE',
    true
FROM generate_series(1, 30) AS i
ON CONFLICT (serial_number) DO NOTHING;

INSERT INTO instruments (serial_number, name, category, status, active)
SELECT 
    'WND-' || LPAD(i::text, 4, '0'),
    CASE (i % 3)
        WHEN 0 THEN 'Flauta Traversa ' || i
        WHEN 1 THEN 'Saxofón Alto ' || i
        ELSE 'Clarinete Bb ' || i
    END,
    'viento',
    'AVAILABLE',
    true
FROM generate_series(31, 60) AS i
ON CONFLICT (serial_number) DO NOTHING;

INSERT INTO instruments (serial_number, name, category, status, active)
SELECT 
    'PRC-' || LPAD(i::text, 4, '0'),
    CASE (i % 2)
        WHEN 0 THEN 'Tarola de Concierto ' || i
        ELSE 'Xilófono Orquestal ' || i
    END,
    'percusion',
    'AVAILABLE',
    true
FROM generate_series(61, 90) AS i
ON CONFLICT (serial_number) DO NOTHING;

INSERT INTO instruments (serial_number, name, category, status, active)
SELECT 
    'KEY-' || LPAD(i::text, 4, '0'),
    CASE (i % 2)
        WHEN 0 THEN 'Teclado MIDI 61 Teclas ' || i
        ELSE 'Sintetizador Analógico ' || i
    END,
    'teclado',
    'AVAILABLE',
    true
FROM generate_series(91, 120) AS i
ON CONFLICT (serial_number) DO NOTHING;
