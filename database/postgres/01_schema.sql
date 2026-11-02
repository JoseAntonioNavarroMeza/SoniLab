-- Habilitar extensión UUID si se requiere
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Usuarios
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'STUDENT')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Instrumentos
CREATE TABLE instruments (
    id SERIAL PRIMARY KEY,
    serial_number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('cuerda', 'viento', 'percusion', 'teclado')),
    status VARCHAR(20) DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'BORROWED', 'MAINTENANCE')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Préstamos
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    instrument_id INT NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 
        'APPROVED', 
        'REJECTED', 
        'IN_INSPECTION', 
        'RETURNED', 
        'RETURNED_WITH_DAMAGE'
    )),
    start_date DATE NOT NULL,
    due_date DATE NOT NULL,
    return_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Eventos Outbox (Garantía de consistencia y desacoplamiento con MongoDB)
CREATE TABLE outbox_events (
    id SERIAL PRIMARY KEY,
    aggregate_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Índices de consulta frecuente
CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_instruments_category_status ON instruments(category, status);
CREATE INDEX idx_outbox_pending ON outbox_events(status) WHERE status = 'PENDING';