--
-- PostgreSQL database dump
--

\restrict aN4XkxCe8gZUWn97vyijKX5kUXPE6fBVaLA2eafJsTi9y5FRXfUvpFbEv0iU55J

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.loans DROP CONSTRAINT IF EXISTS loans_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.loans DROP CONSTRAINT IF EXISTS loans_instrument_id_fkey;
DROP INDEX IF EXISTS public.idx_outbox_pending;
DROP INDEX IF EXISTS public.idx_loans_user_id;
DROP INDEX IF EXISTS public.idx_loans_status;
DROP INDEX IF EXISTS public.idx_instruments_category_status;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE IF EXISTS ONLY public.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_pkey;
ALTER TABLE IF EXISTS ONLY public.loans DROP CONSTRAINT IF EXISTS loans_pkey;
ALTER TABLE IF EXISTS ONLY public.instruments DROP CONSTRAINT IF EXISTS instruments_serial_number_key;
ALTER TABLE IF EXISTS ONLY public.instruments DROP CONSTRAINT IF EXISTS instruments_pkey;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.outbox_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.loans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.instruments ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.outbox_events_id_seq;
DROP TABLE IF EXISTS public.outbox_events;
DROP SEQUENCE IF EXISTS public.loans_id_seq;
DROP TABLE IF EXISTS public.loans;
DROP SEQUENCE IF EXISTS public.instruments_id_seq;
DROP TABLE IF EXISTS public.instruments;
DROP EXTENSION IF EXISTS "uuid-ossp";
--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: instruments; Type: TABLE; Schema: public; Owner: sonilab_user
--

CREATE TABLE public.instruments (
    id integer NOT NULL,
    serial_number character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    category character varying(30) NOT NULL,
    status character varying(20) DEFAULT 'AVAILABLE'::character varying,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT instruments_category_check CHECK (((category)::text = ANY ((ARRAY['cuerda'::character varying, 'viento'::character varying, 'percusion'::character varying, 'teclado'::character varying])::text[]))),
    CONSTRAINT instruments_status_check CHECK (((status)::text = ANY ((ARRAY['AVAILABLE'::character varying, 'BORROWED'::character varying, 'MAINTENANCE'::character varying])::text[])))
);


ALTER TABLE public.instruments OWNER TO sonilab_user;

--
-- Name: instruments_id_seq; Type: SEQUENCE; Schema: public; Owner: sonilab_user
--

CREATE SEQUENCE public.instruments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.instruments_id_seq OWNER TO sonilab_user;

--
-- Name: instruments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sonilab_user
--

ALTER SEQUENCE public.instruments_id_seq OWNED BY public.instruments.id;


--
-- Name: loans; Type: TABLE; Schema: public; Owner: sonilab_user
--

CREATE TABLE public.loans (
    id integer NOT NULL,
    user_id integer NOT NULL,
    instrument_id integer NOT NULL,
    status character varying(30) DEFAULT 'PENDING'::character varying,
    start_date date NOT NULL,
    due_date date NOT NULL,
    return_date date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT loans_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'IN_INSPECTION'::character varying, 'RETURNED'::character varying, 'RETURNED_WITH_DAMAGE'::character varying])::text[])))
);


ALTER TABLE public.loans OWNER TO sonilab_user;

--
-- Name: loans_id_seq; Type: SEQUENCE; Schema: public; Owner: sonilab_user
--

CREATE SEQUENCE public.loans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.loans_id_seq OWNER TO sonilab_user;

--
-- Name: loans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sonilab_user
--

ALTER SEQUENCE public.loans_id_seq OWNED BY public.loans.id;


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: sonilab_user
--

CREATE TABLE public.outbox_events (
    id integer NOT NULL,
    aggregate_id character varying(50) NOT NULL,
    event_type character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    retry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp with time zone,
    CONSTRAINT outbox_events_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSED'::character varying, 'FAILED'::character varying])::text[])))
);


ALTER TABLE public.outbox_events OWNER TO sonilab_user;

--
-- Name: outbox_events_id_seq; Type: SEQUENCE; Schema: public; Owner: sonilab_user
--

CREATE SEQUENCE public.outbox_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.outbox_events_id_seq OWNER TO sonilab_user;

--
-- Name: outbox_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sonilab_user
--

ALTER SEQUENCE public.outbox_events_id_seq OWNED BY public.outbox_events.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: sonilab_user
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'STUDENT'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO sonilab_user;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: sonilab_user
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO sonilab_user;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sonilab_user
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: instruments id; Type: DEFAULT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.instruments ALTER COLUMN id SET DEFAULT nextval('public.instruments_id_seq'::regclass);


--
-- Name: loans id; Type: DEFAULT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.loans ALTER COLUMN id SET DEFAULT nextval('public.loans_id_seq'::regclass);


--
-- Name: outbox_events id; Type: DEFAULT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.outbox_events ALTER COLUMN id SET DEFAULT nextval('public.outbox_events_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: instruments; Type: TABLE DATA; Schema: public; Owner: sonilab_user
--

COPY public.instruments (id, serial_number, name, category, status, active, created_at) FROM stdin;
4	STR-0004	Viol├¡n 4/4 Estudio 4	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
5	STR-0005	Bajo El├®ctrico Pasivo 5	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
6	STR-0006	Guitarra Ac├║stica Cl├ísica 6	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
7	STR-0007	Viol├¡n 4/4 Estudio 7	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
8	STR-0008	Bajo El├®ctrico Pasivo 8	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
9	STR-0009	Guitarra Ac├║stica Cl├ísica 9	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
10	STR-0010	Viol├¡n 4/4 Estudio 10	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
11	STR-0011	Bajo El├®ctrico Pasivo 11	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
12	STR-0012	Guitarra Ac├║stica Cl├ísica 12	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
13	STR-0013	Viol├¡n 4/4 Estudio 13	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
14	STR-0014	Bajo El├®ctrico Pasivo 14	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
15	STR-0015	Guitarra Ac├║stica Cl├ísica 15	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
16	STR-0016	Viol├¡n 4/4 Estudio 16	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
17	STR-0017	Bajo El├®ctrico Pasivo 17	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
18	STR-0018	Guitarra Ac├║stica Cl├ísica 18	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
19	STR-0019	Viol├¡n 4/4 Estudio 19	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
20	STR-0020	Bajo El├®ctrico Pasivo 20	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
21	STR-0021	Guitarra Ac├║stica Cl├ísica 21	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
22	STR-0022	Viol├¡n 4/4 Estudio 22	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
23	STR-0023	Bajo El├®ctrico Pasivo 23	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
24	STR-0024	Guitarra Ac├║stica Cl├ísica 24	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
25	STR-0025	Viol├¡n 4/4 Estudio 25	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
26	STR-0026	Bajo El├®ctrico Pasivo 26	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
27	STR-0027	Guitarra Ac├║stica Cl├ísica 27	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
28	STR-0028	Viol├¡n 4/4 Estudio 28	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
29	STR-0029	Bajo El├®ctrico Pasivo 29	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
30	STR-0030	Guitarra Ac├║stica Cl├ísica 30	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
31	WND-0031	Saxof├│n Alto 31	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
32	WND-0032	Clarinete Bb 32	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
33	WND-0033	Flauta Traversa 33	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
34	WND-0034	Saxof├│n Alto 34	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
35	WND-0035	Clarinete Bb 35	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
36	WND-0036	Flauta Traversa 36	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
37	WND-0037	Saxof├│n Alto 37	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
38	WND-0038	Clarinete Bb 38	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
39	WND-0039	Flauta Traversa 39	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
40	WND-0040	Saxof├│n Alto 40	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
41	WND-0041	Clarinete Bb 41	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
42	WND-0042	Flauta Traversa 42	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
43	WND-0043	Saxof├│n Alto 43	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
44	WND-0044	Clarinete Bb 44	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
45	WND-0045	Flauta Traversa 45	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
46	WND-0046	Saxof├│n Alto 46	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
47	WND-0047	Clarinete Bb 47	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
48	WND-0048	Flauta Traversa 48	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
49	WND-0049	Saxof├│n Alto 49	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
50	WND-0050	Clarinete Bb 50	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
51	WND-0051	Flauta Traversa 51	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
52	WND-0052	Saxof├│n Alto 52	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
53	WND-0053	Clarinete Bb 53	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
54	WND-0054	Flauta Traversa 54	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
55	WND-0055	Saxof├│n Alto 55	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
56	WND-0056	Clarinete Bb 56	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
57	WND-0057	Flauta Traversa 57	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
58	WND-0058	Saxof├│n Alto 58	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
59	WND-0059	Clarinete Bb 59	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
60	WND-0060	Flauta Traversa 60	viento	AVAILABLE	t	2026-10-31 19:00:54.255494+00
62	PRC-0062	Tarola de Concierto 62	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
63	PRC-0063	Xil├│fono Orquestal 63	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
64	PRC-0064	Tarola de Concierto 64	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
65	PRC-0065	Xil├│fono Orquestal 65	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
66	PRC-0066	Tarola de Concierto 66	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
67	PRC-0067	Xil├│fono Orquestal 67	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
68	PRC-0068	Tarola de Concierto 68	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
69	PRC-0069	Xil├│fono Orquestal 69	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
70	PRC-0070	Tarola de Concierto 70	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
71	PRC-0071	Xil├│fono Orquestal 71	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
72	PRC-0072	Tarola de Concierto 72	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
73	PRC-0073	Xil├│fono Orquestal 73	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
74	PRC-0074	Tarola de Concierto 74	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
75	PRC-0075	Xil├│fono Orquestal 75	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
76	PRC-0076	Tarola de Concierto 76	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
77	PRC-0077	Xil├│fono Orquestal 77	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
78	PRC-0078	Tarola de Concierto 78	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
79	PRC-0079	Xil├│fono Orquestal 79	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
80	PRC-0080	Tarola de Concierto 80	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
81	PRC-0081	Xil├│fono Orquestal 81	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
82	PRC-0082	Tarola de Concierto 82	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
83	PRC-0083	Xil├│fono Orquestal 83	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
84	PRC-0084	Tarola de Concierto 84	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
85	PRC-0085	Xil├│fono Orquestal 85	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
86	PRC-0086	Tarola de Concierto 86	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
3	STR-0003	Guitarra Ac├║stica Cl├ísica 3	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
2	STR-0002	Bajo El├®ctrico Pasivo 2	cuerda	AVAILABLE	t	2026-10-31 19:00:54.250361+00
61	PRC-0061	Xil├│fono Orquestal 61	percusion	MAINTENANCE	t	2026-10-31 19:00:54.257598+00
87	PRC-0087	Xil├│fono Orquestal 87	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
88	PRC-0088	Tarola de Concierto 88	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
89	PRC-0089	Xil├│fono Orquestal 89	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
90	PRC-0090	Tarola de Concierto 90	percusion	AVAILABLE	t	2026-10-31 19:00:54.257598+00
91	KEY-0091	Sintetizador Anal├│gico 91	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
92	KEY-0092	Teclado MIDI 61 Teclas 92	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
93	KEY-0093	Sintetizador Anal├│gico 93	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
94	KEY-0094	Teclado MIDI 61 Teclas 94	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
95	KEY-0095	Sintetizador Anal├│gico 95	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
96	KEY-0096	Teclado MIDI 61 Teclas 96	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
97	KEY-0097	Sintetizador Anal├│gico 97	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
98	KEY-0098	Teclado MIDI 61 Teclas 98	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
99	KEY-0099	Sintetizador Anal├│gico 99	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
100	KEY-0100	Teclado MIDI 61 Teclas 100	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
101	KEY-0101	Sintetizador Anal├│gico 101	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
102	KEY-0102	Teclado MIDI 61 Teclas 102	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
103	KEY-0103	Sintetizador Anal├│gico 103	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
104	KEY-0104	Teclado MIDI 61 Teclas 104	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
105	KEY-0105	Sintetizador Anal├│gico 105	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
106	KEY-0106	Teclado MIDI 61 Teclas 106	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
107	KEY-0107	Sintetizador Anal├│gico 107	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
108	KEY-0108	Teclado MIDI 61 Teclas 108	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
109	KEY-0109	Sintetizador Anal├│gico 109	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
110	KEY-0110	Teclado MIDI 61 Teclas 110	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
111	KEY-0111	Sintetizador Anal├│gico 111	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
112	KEY-0112	Teclado MIDI 61 Teclas 112	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
113	KEY-0113	Sintetizador Anal├│gico 113	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
114	KEY-0114	Teclado MIDI 61 Teclas 114	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
115	KEY-0115	Sintetizador Anal├│gico 115	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
116	KEY-0116	Teclado MIDI 61 Teclas 116	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
117	KEY-0117	Sintetizador Anal├│gico 117	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
118	KEY-0118	Teclado MIDI 61 Teclas 118	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
119	KEY-0119	Sintetizador Anal├│gico 119	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
120	KEY-0120	Teclado MIDI 61 Teclas 120	teclado	AVAILABLE	t	2026-10-31 19:00:54.260218+00
1	STR-0001	Viol├¡n 4/4 Estudio 1	cuerda	AVAILABLE	f	2026-10-31 19:00:54.250361+00
\.


--
-- Data for Name: loans; Type: TABLE DATA; Schema: public; Owner: sonilab_user
--

COPY public.loans (id, user_id, instrument_id, status, start_date, due_date, return_date, created_at) FROM stdin;
1	1	1	RETURNED	2026-11-01	2026-11-08	2026-10-31	2026-10-31 19:47:39.375274+00
2	1	1	RETURNED	2026-11-01	2026-11-08	\N	2026-10-31 20:29:42.613657+00
3	1	2	RETURNED	2026-11-01	2026-11-08	2026-10-31	2026-10-31 20:37:19.590039+00
4	1	3	RETURNED	2026-11-01	2026-11-08	2026-10-31	2026-10-31 20:40:46.351415+00
5	1	1	RETURNED	2026-11-01	2026-11-08	2026-10-31	2026-10-31 20:43:32.198362+00
6	1	1	RETURNED	2026-10-31	2026-11-01	2026-10-31	2026-10-31 20:47:33.066534+00
7	1	3	RETURNED	2026-10-31	2026-11-01	2026-10-31	2026-10-31 20:48:03.484663+00
11	2	3	RETURNED	2026-10-31	2026-11-11	2026-10-31	2026-10-31 21:26:16.302973+00
12	2	3	RETURNED	2026-10-31	2026-11-11	2026-10-31	2026-10-31 21:27:52.485958+00
13	2	3	RETURNED	2026-10-31	2026-11-11	2026-10-31	2026-10-31 21:40:09.361169+00
14	2	2	RETURNED	2026-10-31	2026-11-11	2026-10-31	2026-10-31 21:46:42.061407+00
15	2	2	RETURNED	2026-10-31	2026-11-11	2026-10-31	2026-10-31 21:48:13.741272+00
16	2	1	REJECTED	2026-11-01	2026-11-11	\N	2026-11-01 00:27:25.300691+00
17	2	61	RETURNED_WITH_DAMAGE	2026-11-01	2026-11-11	2026-11-01	2026-11-01 00:41:18.441796+00
\.


--
-- Data for Name: outbox_events; Type: TABLE DATA; Schema: public; Owner: sonilab_user
--

COPY public.outbox_events (id, aggregate_id, event_type, payload, status, retry_count, created_at, processed_at) FROM stdin;
1	1	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento entregado en optimas condiciones", "passed": true, "status": "RETURNED", "loan_id": 1, "checklist": {"puente": "alineado", "cuerdas": "nuevas", "afinacion": "correcta"}, "inspected_at": "2026-10-31T19:48:16.184Z", "inspector_id": 1, "instrument_id": 1}	PROCESSED	0	2026-10-31 19:48:16.178582+00	2026-10-31 20:04:14.984613+00
2	3	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado y calibrado sin novedades", "passed": true, "status": "RETURNED", "loan_id": 3, "checklist": {"cuerdas": true, "limpieza": true, "afinacion": true}, "inspected_at": "2026-10-31T20:38:23.504Z", "inspector_id": 1, "instrument_id": 2}	PROCESSED	0	2026-10-31 20:38:23.499218+00	\N
3	4	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado y calibrado sin novedades", "passed": true, "status": "RETURNED", "loan_id": 4, "checklist": {"cuerdas": true, "limpieza": true, "afinacion": true}, "inspected_at": "2026-10-31T20:42:36.955Z", "inspector_id": 1, "instrument_id": 3}	PROCESSED	0	2026-10-31 20:42:36.948834+00	\N
4	5	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado y calibrado sin novedades", "passed": true, "status": "RETURNED", "loan_id": 5, "checklist": {"cuerdas": true, "limpieza": true, "afinacion": true}, "inspected_at": "2026-10-31T20:43:40.631Z", "inspector_id": 1, "instrument_id": 1}	PROCESSED	0	2026-10-31 20:43:40.627273+00	\N
5	6	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado sin novedades.", "passed": true, "status": "RETURNED", "loan_id": 6, "checklist": {"mastil": true, "cuerdas": true, "afinacion": true, "pastillas": true}, "inspected_at": "2026-10-31T20:47:52.861Z", "inspector_id": 1, "instrument_id": 1}	PROCESSED	0	2026-10-31 20:47:52.858828+00	\N
6	7	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado sin novedades.", "passed": true, "status": "RETURNED", "loan_id": 7, "checklist": {"teclas": true, "pantalla": true, "conectores": true, "electronica": true}, "inspected_at": "2026-10-31T20:48:16.693Z", "inspector_id": 1, "instrument_id": 3}	PROCESSED	0	2026-10-31 20:48:16.691098+00	\N
7	11	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado sin novedades.", "passed": true, "status": "RETURNED", "loan_id": 11, "checklist": {"mastil": true, "cuerdas": true, "afinacion": true, "pastillas": true}, "inspected_at": "2026-10-31T21:27:03.939Z", "inspector_id": 1, "instrument_id": 3}	PROCESSED	0	2026-10-31 21:27:03.936053+00	\N
8	12	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado sin novedades.", "passed": true, "status": "RETURNED", "loan_id": 12, "checklist": {"mastil": true, "cuerdas": true, "afinacion": true, "pastillas": true}, "inspected_at": "2026-10-31T21:28:43.198Z", "inspector_id": 1, "instrument_id": 3}	PROCESSED	0	2026-10-31 21:28:43.190171+00	\N
9	13	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado sin novedades.", "passed": true, "status": "RETURNED", "loan_id": 13, "checklist": {"mastil": true, "cuerdas": true, "afinacion": true, "pastillas": true}, "inspected_at": "2026-10-31T21:40:48.932Z", "inspector_id": 1, "instrument_id": 3}	PROCESSED	0	2026-10-31 21:40:48.927985+00	\N
10	14	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado sin novedades.", "passed": true, "status": "RETURNED", "loan_id": 14, "checklist": {"mastil": true, "cuerdas": true, "afinacion": true, "pastillas": true}, "inspected_at": "2026-10-31T21:46:59.263Z", "inspector_id": 1, "instrument_id": 2}	PROCESSED	0	2026-10-31 21:46:59.261089+00	\N
11	15	LOAN_RETURNED_INSPECTION	{"notes": "Instrumento verificado sin novedades.", "passed": true, "status": "RETURNED", "loan_id": 15, "checklist": {"mastil": true, "cuerdas": true, "afinacion": true, "pastillas": true}, "inspected_at": "2026-10-31T22:02:13.099Z", "inspector_id": 1, "instrument_id": 2}	PROCESSED	0	2026-10-31 22:02:13.093976+00	\N
12	17	LOAN_RETURNED_INSPECTION	{"notes": "manchas de comida sobre las teclas", "passed": false, "status": "RETURNED_WITH_DAMAGE", "loan_id": 17, "user_id": 2, "category": "percusion", "checklist": {"estetica": true, "limpieza": false, "piezas_completas": true}, "user_name": "Alumno Juan Perez", "user_email": "juan.perez@sonilab.edu", "inspected_at": "2026-11-01T00:42:39.067Z", "inspector_id": 1, "instrument_id": 61, "serial_number": "PRC-0061", "instrument_name": "Xil├│fono Orquestal 61"}	PROCESSED	0	2026-11-01 00:42:39.02838+00	2026-11-01 00:42:39.078312+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: sonilab_user
--

COPY public.users (id, name, email, password_hash, role, active, created_at) FROM stdin;
3	Alumna Maria Lopez	maria.lopez@sonilab.edu	\\\\\\/I.Z1HkJz6L2a9E6y2Q5zX0j9K1w8XJ0g6	STUDENT	t	2026-10-31 19:00:54.247093+00
1	Profesor Administrador	admin@sonilab.edu	$2b$10$pP4SCU0xCYtyJYmcrzVzPu8k15YO2tnxv5XH5vVfcJqXclgkYYC7a	ADMIN	t	2026-10-31 19:00:54.247093+00
2	Alumno Juan Perez	juan.perez@sonilab.edu	$2b$10$PZgS8v39kcxRADnUSODG2.47HJ2N9ATox4cYbof1ikgAO.m9covzC	STUDENT	t	2026-10-31 19:00:54.247093+00
\.


--
-- Name: instruments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sonilab_user
--

SELECT pg_catalog.setval('public.instruments_id_seq', 120, true);


--
-- Name: loans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sonilab_user
--

SELECT pg_catalog.setval('public.loans_id_seq', 17, true);


--
-- Name: outbox_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sonilab_user
--

SELECT pg_catalog.setval('public.outbox_events_id_seq', 12, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sonilab_user
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: instruments instruments_pkey; Type: CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.instruments
    ADD CONSTRAINT instruments_pkey PRIMARY KEY (id);


--
-- Name: instruments instruments_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.instruments
    ADD CONSTRAINT instruments_serial_number_key UNIQUE (serial_number);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_instruments_category_status; Type: INDEX; Schema: public; Owner: sonilab_user
--

CREATE INDEX idx_instruments_category_status ON public.instruments USING btree (category, status);


--
-- Name: idx_loans_status; Type: INDEX; Schema: public; Owner: sonilab_user
--

CREATE INDEX idx_loans_status ON public.loans USING btree (status);


--
-- Name: idx_loans_user_id; Type: INDEX; Schema: public; Owner: sonilab_user
--

CREATE INDEX idx_loans_user_id ON public.loans USING btree (user_id);


--
-- Name: idx_outbox_pending; Type: INDEX; Schema: public; Owner: sonilab_user
--

CREATE INDEX idx_outbox_pending ON public.outbox_events USING btree (status) WHERE ((status)::text = 'PENDING'::text);


--
-- Name: loans loans_instrument_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES public.instruments(id) ON DELETE RESTRICT;


--
-- Name: loans loans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sonilab_user
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict aN4XkxCe8gZUWn97vyijKX5kUXPE6fBVaLA2eafJsTi9y5FRXfUvpFbEv0iU55J

