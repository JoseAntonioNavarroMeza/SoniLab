import React, { useState, useEffect } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

const FALLBACK_INSTRUMENTS = [
  { id: 1, name: "Guitarra Acústica Yamaha C40", serial_number: "GTR-001", category: "cuerda", status: "AVAILABLE", active: true },
  { id: 2, name: "Bajo Eléctrico Fender Jazz Bass", serial_number: "BASS-002", category: "cuerda", status: "AVAILABLE", active: true },
  { id: 3, name: "Teclado Roland GO:KEYS", serial_number: "KEY-003", category: "teclado", status: "AVAILABLE", active: true }
];

const getChecklistTemplate = (instrumentName, category) => {
  const name = (instrumentName || "").toLowerCase();
  const cat = (category || "").toLowerCase();
  if (cat === "teclado" || name.includes("teclado") || name.includes("sintetizador")) {
    return { teclas: true, pantalla: true, electronica: true, conectores: true };
  }
  if (cat === "cuerda" || name.includes("guitarra") || name.includes("bajo") || name.includes("viol")) {
    return { cuerdas: true, afinacion: true, mastil: true, pastillas: true };
  }
  if (cat === "viento" || name.includes("flauta") || name.includes("saxof") || name.includes("clarinete")) {
    return { zapatillas: true, llaves: true, tudel: true, afinacion: true };
  }
  return { limpieza: true, estetica: true, piezas_completas: true };
};

export default function Dashboard() {
  const { user, logout } = useAuth();

  const isAdmin = user?.role === "ADMIN";
  const isStudent = user?.role === "STUDENT";

  // Navegación principal: "operacion" (Catálogo, Préstamos, MongoDB) | "usuarios" (CRUD Usuarios / Perfil)
  const [activeTab, setActiveTab] = useState("operacion");

  // --- Estado de Instrumentos (Catálogo Paginado + Filtros + CRUD) ---
  const [instruments, setInstruments] = useState(FALLBACK_INSTRUMENTS);
  const [instPage, setInstPage] = useState(1);
  const [instPagination, setInstPagination] = useState({ total_records: 3, total_pages: 1, current_page: 1 });
  const [instSearch, setInstSearch] = useState("");
  const [instCategory, setInstCategory] = useState("");
  const [instStatusFilter, setInstStatusFilter] = useState("");
  const [showInstModal, setShowInstModal] = useState(false);
  const [editingInst, setEditingInst] = useState(null);
  const [instForm, setInstForm] = useState({ serial_number: "", name: "", category: "cuerda", status: "AVAILABLE" });

  // --- Estado de Préstamos y Reporte ---
  const [loans, setLoans] = useState([]);
  const [loanFilterMode, setLoanFilterMode] = useState("ACTIVE"); // "ACTIVE" | "CLOSED"
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [closedReportSummary, setClosedReportSummary] = useState(null);

  // --- Solicitud de Préstamo (Alumno) ---
  const [selectedInst, setSelectedInst] = useState(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");

  // --- Inspección Técnica y MongoDB ---
  const [inspections, setInspections] = useState([]);
  const [inspectingLoan, setInspectingLoan] = useState(null);
  const [notes, setNotes] = useState("Instrumento verificado sin novedades.");
  const [checklist, setChecklist] = useState({});

  // --- Estado de Usuarios y Perfil (Entidad 1 CRUD) ---
  const [usersList, setUsersList] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPagination, setUsersPagination] = useState({ total_records: 0, total_pages: 1, current_page: 1 });
  const [userSearch, setUserSearch] = useState("");
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "STUDENT", active: true });
  const [profileForm, setProfileForm] = useState({ name: user?.name || "", email: user?.email || "", password: "" });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const notify = (text, type = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "" }), 5000);
  };

  // Cargar catálogo de instrumentos con filtros y paginación
  const loadInstruments = async (page = instPage) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "8" });
      if (instSearch.trim()) params.append("search", instSearch.trim());
      if (instCategory) params.append("category", instCategory);
      if (instStatusFilter) params.append("status", instStatusFilter);

      const instRes = await api.get(`/instruments?${params.toString()}`);
      const dbInstruments = instRes.data?.data || [];
      if (Array.isArray(dbInstruments) && (dbInstruments.length > 0 || instSearch || instCategory || instStatusFilter)) {
        setInstruments(dbInstruments);
        if (instRes.data?.pagination) {
          setInstPagination(instRes.data.pagination);
        }
      }
    } catch (e) {
      console.warn("Error cargando instrumentos:", e);
    }
  };

  // Cargar préstamos activos o reporte de préstamos cerrados
  const loadLoans = async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (loanFilterMode === "CLOSED") {
        params.append("status", "CLOSED");
      }
      if (fromDate) params.append("from_date", fromDate);
      if (toDate) params.append("to_date", toDate);

      const loansRes = await api.get(`/loans?${params.toString()}`);
      const loansData = loansRes.data?.loans || loansRes.data?.data || loansRes.data;
      setLoans(Array.isArray(loansData) ? loansData : []);

      if (loanFilterMode === "CLOSED") {
        const repParams = new URLSearchParams();
        if (fromDate) repParams.append("from_date", fromDate);
        if (toDate) repParams.append("to_date", toDate);
        const repRes = await api.get(`/loans/report?${repParams.toString()}`);
        setClosedReportSummary(repRes.data?.summary || null);
      } else {
        setClosedReportSummary(null);
      }
    } catch (e) {
      console.warn("Ruta /loans falló", e);
    }
  };

  // Cargar inspecciones de MongoDB
  const loadInspections = async (resetLocal = false) => {
    try {
      const inspRes = await api.get("/inspections/recent").catch(() => api.get("/inspections"));
      const rawInsp = inspRes.data?.data || inspRes.data?.inspections || inspRes.data;
      if (Array.isArray(rawInsp)) {
        if (resetLocal) {
          setInspections(rawInsp);
        } else {
          setInspections(prev => {
            const remoteIds = new Set(rawInsp.map(i => Number(i.loan_id)));
            const localPending = prev.filter(i => !remoteIds.has(Number(i.loan_id)));
            return [...localPending, ...rawInsp];
          });
        }
      }
    } catch (e) {
      console.warn("Ruta de inspecciones no disponible", e);
    }
  };

  // Cargar lista de usuarios (Solo ADMIN)
  const loadUsers = async (page = usersPage) => {
    if (!isAdmin) return;
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "8",
        include_inactive: String(includeInactiveUsers)
      });
      if (userSearch.trim()) params.append("search", userSearch.trim());

      const res = await api.get(`/auth/users?${params.toString()}`);
      setUsersList(res.data?.data || []);
      if (res.data?.pagination) {
        setUsersPagination(res.data.pagination);
      }
    } catch (e) {
      console.warn("Error al cargar usuarios:", e);
    }
  };

  const loadData = async (resetLocal = false) => {
    setLoading(true);
    try {
      await Promise.all([
        loadInstruments(instPage),
        loadLoans(),
        loadInspections(resetLocal),
        isAdmin ? loadUsers(usersPage) : Promise.resolve()
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoans([]);
    setInspections([]);
    setSelectedInst(null);
    setInspectingLoan(null);
    setProfileForm({ name: user?.name || "", email: user?.email || "", password: "" });
    loadData(true);
  }, [user?.id, user?.email, user?.role]);

  useEffect(() => {
    loadInstruments(instPage);
  }, [instPage, instCategory, instStatusFilter]);

  useEffect(() => {
    loadLoans();
  }, [loanFilterMode, fromDate, toDate]);

  useEffect(() => {
    if (isAdmin && activeTab === "usuarios") {
      loadUsers(usersPage);
    }
  }, [activeTab, usersPage, includeInactiveUsers]);

  // --- Acciones CRUD de Instrumentos ---
  const handleSaveInstrument = async (e) => {
    e.preventDefault();
    try {
      if (editingInst) {
        await api.put(`/instruments/${editingInst.id}`, instForm);
        notify(`Instrumento #${editingInst.id} actualizado correctamente`, "success");
      } else {
        await api.post("/instruments", instForm);
        notify("Nuevo instrumento agregado al inventario", "success");
      }
      setShowInstModal(false);
      setEditingInst(null);
      setInstForm({ serial_number: "", name: "", category: "cuerda", status: "AVAILABLE" });
      await loadInstruments(instPage);
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  const handleDeactivateInstrument = async (instId) => {
    try {
      await api.delete(`/instruments/${instId}`);
      notify(`Instrumento #${instId} dado de baja lógica (active = false).`, "success");
      await loadInstruments(instPage);
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  const handleRestoreInstrument = async (instId) => {
    try {
      await api.put(`/instruments/${instId}`, { status: "AVAILABLE" });
      notify(`Instrumento #${instId} habilitado a estado AVAILABLE.`, "success");
      await loadData();
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  // --- Acciones de Préstamos e Inspección ---
  const handleRequestLoan = async (e) => {
    e.preventDefault();
    try {
      await api.post("/loans/request", {
        instrument_id: selectedInst.id,
        start_date: startDate,
        due_date: dueDate
      });
      notify("Préstamo registrado exitosamente", "success");
      setSelectedInst(null);
      await loadData();
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
      await loadData();
    }
  };

  const updateLoanStatus = async (loanId, endpoint, msg) => {
    try {
      await api.put(`/loans/${loanId}/${endpoint}`);
      notify(msg, "success");
      await loadData();
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  const handleCloseInspection = async (e) => {
    e.preventDefault();
    try {
      const passed = Object.values(checklist).every(val => val === true);
      const inst = safeInstruments.find(i => i.id === inspectingLoan.instrument_id) || {};

      const res = await api.post(`/loans/${inspectingLoan.id}/close-inspection`, {
        passed,
        notes,
        checklist
      });

      const returnedInsp = res.data?.inspection || {};
      const newInspItem = {
        loan_id: inspectingLoan.id,
        instrument_id: inspectingLoan.instrument_id,
        instrument_name: returnedInsp.instrument_name || inspectingLoan.instrument_name || inst.name || `Instrumento #${inspectingLoan.instrument_id}`,
        serial_number: returnedInsp.serial_number || inspectingLoan.serial_number || inst.serial_number || inst.serial || "",
        user_id: returnedInsp.user_id || inspectingLoan.user_id || null,
        user_name: returnedInsp.user_name || inspectingLoan.user_name || "Alumno",
        user_email: returnedInsp.user_email || inspectingLoan.user_email || "",
        notes,
        checklist,
        passed,
        status: passed ? "RETURNED" : "RETURNED_WITH_DAMAGE",
        inspected_at: returnedInsp.inspected_at || new Date().toISOString()
      };

      setInspections(prev => [newInspItem, ...prev.filter(i => Number(i.loan_id) !== Number(inspectingLoan.id))]);
      notify(
        passed
          ? `Préstamo #${inspectingLoan.id} cerrado sin fallas y sincronizado en MongoDB.`
          : `Préstamo #${inspectingLoan.id} cerrado CON FALLAS. Instrumento enviado a mantenimiento y registrado en MongoDB.`,
        "success"
      );

      setInspectingLoan(null);
      await loadData();
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  // --- Acciones CRUD de Usuarios y Perfil ---
  const handleUpdateOwnProfile = async (e) => {
    e.preventDefault();
    try {
      const payload = { name: profileForm.name, email: profileForm.email };
      if (profileForm.password.trim()) {
        payload.password = profileForm.password.trim();
      }
      await api.put("/auth/profile", payload);
      notify("Tu perfil ha sido actualizado correctamente", "success");
      setProfileForm(prev => ({ ...prev, password: "" }));
      if (isAdmin) await loadUsers(usersPage);
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  const handleSaveUserAdmin = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const payload = {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          active: userForm.active
        };
        if (userForm.password.trim()) payload.password = userForm.password.trim();
        await api.put(`/auth/users/${editingUser.id}`, payload);
        notify(`Usuario #${editingUser.id} actualizado correctamente`, "success");
      } else {
        await api.post("/auth/users", userForm);
        notify("Usuario registrado exitosamente", "success");
      }
      setEditingUser(null);
      setUserForm({ name: "", email: "", password: "", role: "STUDENT", active: true });
      await loadUsers(usersPage);
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  const handleDeactivateUser = async (uId) => {
    try {
      await api.delete(`/auth/users/${uId}`);
      notify(`Usuario #${uId} dado de baja lógica (active = false)`, "success");
      await loadUsers(usersPage);
    } catch (err) {
      notify(err.response?.data?.error || err.message, "error");
    }
  };

  const safeLoans = Array.isArray(loans) ? loans : [];
  const safeInstruments = Array.isArray(instruments) ? instruments : [];

  // Filtrar inspecciones para que los estudiantes SOLO vean las que ellos mismos solicitaron
  const visibleInspections = (inspections || []).filter(insp => {
    if (!isStudent) return true;
    if (insp.user_id && user?.id && Number(insp.user_id) === Number(user.id)) return true;
    if (insp.user_email && user?.email && insp.user_email.toLowerCase() === user.email.toLowerCase()) return true;
    return false;
  });

  const failedChecklistItems = Object.entries(checklist)
    .filter(([, ok]) => !ok)
    .map(([k]) => k.replace("_", " "));

  const getInstrumentEffectiveState = (inst) => {
    const activeLoanForInst = safeLoans.find(
      l =>
        Number(l.instrument_id) === Number(inst.id) &&
        ["PENDING", "REQUESTED", "APPROVED", "ACTIVE", "IN_INSPECTION"].includes((l.status || "").toUpperCase())
    );
    const loanSt = (activeLoanForInst?.status || inst.active_loan_status || "").toUpperCase();
    const dbStatus = (inst.status || "AVAILABLE").toUpperCase();

    if (dbStatus === "MAINTENANCE") {
      return {
        code: "MAINTENANCE",
        label: "MANTENIMIENTO",
        badgeClass: "bg-amber-200 text-amber-900",
        cardClass: "bg-amber-50/60 border-amber-200",
        canRequest: false
      };
    }
    if (loanSt === "IN_INSPECTION") {
      return {
        code: "IN_INSPECTION",
        label: "EN INSPECCIÓN",
        badgeClass: "bg-purple-100 text-purple-800",
        cardClass: "bg-purple-50/40 border-purple-200",
        canRequest: false
      };
    }
    if (loanSt === "PENDING" || loanSt === "REQUESTED") {
      return {
        code: "PENDING",
        label: "SOLICITADO (PENDING)",
        badgeClass: "bg-amber-100 text-amber-800",
        cardClass: "bg-amber-50/30 border-amber-200",
        canRequest: false
      };
    }
    if (dbStatus === "BORROWED" || loanSt === "APPROVED" || loanSt === "ACTIVE") {
      return {
        code: "BORROWED",
        label: "PRESTADO (BORROWED)",
        badgeClass: "bg-rose-100 text-rose-800",
        cardClass: "bg-slate-50 border-slate-200",
        canRequest: false
      };
    }
    return {
      code: "AVAILABLE",
      label: "DISPONIBLE (AVAILABLE)",
      badgeClass: "bg-emerald-100 text-emerald-800",
      cardClass: "bg-white border-slate-200",
      canRequest: true
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      <header className="max-w-7xl mx-auto flex flex-wrap justify-between items-center mb-6 pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Panel SoniLab</h1>
          <p className="text-sm text-slate-500">
            Usuario: <span className="font-semibold text-slate-700">{user?.email}</span> | 
            Rol: <span className="ml-1 px-2 py-0.5 text-xs font-semibold rounded bg-sky-100 text-sky-800">{user?.role || "STUDENT"}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab("operacion")}
            className={`px-3 py-1.5 text-sm font-medium rounded border ${
              activeTab === "operacion"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Taller y Préstamos
          </button>
          <button
            onClick={() => setActiveTab("usuarios")}
            className={`px-3 py-1.5 text-sm font-medium rounded border ${
              activeTab === "usuarios"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {isAdmin ? "Usuarios y Perfil" : "Mi Perfil"}
          </button>
          <button onClick={() => loadData()} disabled={loading} className="px-3 py-1.5 text-sm bg-white border hover:bg-slate-100 rounded text-slate-700">
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          <button onClick={logout} className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded">Cerrar Sesión</button>
        </div>
      </header>

      {message.text && (
        <div className={`max-w-7xl mx-auto mb-6 p-4 rounded-lg text-sm border font-medium ${message.type === "error" ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
          {message.text}
        </div>
      )}

      {activeTab === "operacion" ? (
        <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLUMNA 1: Catálogo de Instrumentos con Filtros, Paginación y CRUD */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <h2 className="text-lg font-bold">Catálogo de Instrumentos</h2>
              {isAdmin && (
                <button
                  onClick={() => {
                    setEditingInst(null);
                    setInstForm({ serial_number: "", name: "", category: "cuerda", status: "AVAILABLE" });
                    setShowInstModal(!showInstModal);
                  }}
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded"
                >
                  {showInstModal ? "Cerrar" : "+ Nuevo Equipo"}
                </button>
              )}
            </div>

            {/* Formulario Admin Alta / Edición de Instrumento */}
            {showInstModal && isAdmin && (
              <form onSubmit={handleSaveInstrument} className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg space-y-2">
                <h3 className="text-xs font-bold text-sky-900">
                  {editingInst ? `Editar Instrumento #${editingInst.id}` : "Registrar Nuevo Instrumento"}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="No. Serie (ej. GTR-009)"
                    value={instForm.serial_number}
                    onChange={e => setInstForm({ ...instForm, serial_number: e.target.value })}
                    className="text-xs p-1.5 border rounded bg-white"
                  />
                  <select
                    value={instForm.category}
                    onChange={e => setInstForm({ ...instForm, category: e.target.value })}
                    className="text-xs p-1.5 border rounded bg-white"
                  >
                    <option value="cuerda">Cuerda</option>
                    <option value="viento">Viento</option>
                    <option value="percusion">Percusión</option>
                    <option value="teclado">Teclado</option>
                  </select>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Nombre del instrumento"
                  value={instForm.name}
                  onChange={e => setInstForm({ ...instForm, name: e.target.value })}
                  className="w-full text-xs p-1.5 border rounded bg-white"
                />
                {editingInst && (
                  <select
                    value={instForm.status}
                    onChange={e => setInstForm({ ...instForm, status: e.target.value })}
                    className="w-full text-xs p-1.5 border rounded bg-white"
                  >
                    <option value="AVAILABLE">AVAILABLE (Disponible)</option>
                    <option value="BORROWED">BORROWED (Prestado)</option>
                    <option value="MAINTENANCE">MAINTENANCE (Mantenimiento)</option>
                  </select>
                )}
                <div className="flex gap-2">
                  <button type="submit" className="w-full py-1.5 bg-sky-600 text-white text-xs font-semibold rounded">
                    {editingInst ? "Guardar Cambios" : "Crear Instrumento"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInstModal(false);
                      setEditingInst(null);
                    }}
                    className="w-full py-1.5 bg-slate-200 text-slate-700 text-xs rounded"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {/* Filtros de búsqueda por nombre/serie, categoría y estado */}
            <div className="mb-3 space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Buscar por nombre o serie..."
                  value={instSearch}
                  onChange={e => setInstSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (setInstPage(1), loadInstruments(1))}
                  className="w-full text-xs p-1.5 border rounded bg-white"
                />
                <button
                  onClick={() => {
                    setInstPage(1);
                    loadInstruments(1);
                  }}
                  className="px-2.5 py-1 bg-slate-800 text-white text-xs rounded"
                >
                  Buscar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={instCategory}
                  onChange={e => {
                    setInstCategory(e.target.value);
                    setInstPage(1);
                  }}
                  className="text-xs p-1.5 border rounded bg-white"
                >
                  <option value="">Todas las categorías</option>
                  <option value="cuerda">Cuerda</option>
                  <option value="viento">Viento</option>
                  <option value="percusion">Percusión</option>
                  <option value="teclado">Teclado</option>
                </select>
                <select
                  value={instStatusFilter}
                  onChange={e => {
                    setInstStatusFilter(e.target.value);
                    setInstPage(1);
                  }}
                  className="text-xs p-1.5 border rounded bg-white"
                >
                  <option value="">Todos los estados</option>
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="BORROWED">BORROWED</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {safeInstruments.length === 0 && (
                <p className="text-xs text-slate-500">No se encontraron instrumentos con esos filtros.</p>
              )}
              {safeInstruments.map((inst) => {
                const stInfo = getInstrumentEffectiveState(inst);
                const serialStr = inst.serial_number || inst.serial || "";
                return (
                  <div key={inst.id} className={`p-3 border rounded-lg flex justify-between items-center gap-2 ${stInfo.cardClass}`}>
                    <div>
                      <h3 className="font-semibold text-sm text-slate-900">{inst.name}</h3>
                      <p className="text-xs text-slate-500 mb-1">
                        ID: {inst.id} | {serialStr} {inst.category ? `• ${inst.category}` : ""}
                      </p>
                      <span className={`inline-block text-[10px] px-2 py-0.5 font-bold rounded uppercase ${stInfo.badgeClass}`}>
                        Estado: {stInfo.label}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isStudent ? (
                        stInfo.canRequest ? (
                          <button
                            onClick={() => setSelectedInst(inst)}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded"
                          >
                            Solicitar
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400 px-2 py-1 bg-slate-100 rounded">
                            No disponible
                          </span>
                        )
                      ) : (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {stInfo.code === "MAINTENANCE" && (
                            <button
                              onClick={() => handleRestoreInstrument(inst.id)}
                              className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold rounded"
                            >
                              Habilitar
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingInst(inst);
                              setInstForm({
                                serial_number: serialStr,
                                name: inst.name,
                                category: inst.category || "cuerda",
                                status: inst.status || "AVAILABLE"
                              });
                              setShowInstModal(true);
                            }}
                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-semibold rounded"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeactivateInstrument(inst.id)}
                            className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 text-[10px] font-semibold rounded"
                          >
                            Baja
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Paginación del Catálogo */}
            {instPagination.total_pages > 1 && (
              <div className="mt-3 pt-2 border-t flex justify-between items-center text-xs text-slate-600">
                <span>
                  Pág. {instPagination.current_page} de {instPagination.total_pages} ({instPagination.total_records} equipos)
                </span>
                <div className="flex gap-1">
                  <button
                    disabled={instPage <= 1}
                    onClick={() => setInstPage(p => Math.max(1, p - 1))}
                    className="px-2 py-1 border rounded bg-white disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={instPage >= instPagination.total_pages}
                    onClick={() => setInstPage(p => p + 1)}
                    className="px-2 py-1 border rounded bg-white disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {selectedInst && isStudent && (
              <div className="mt-4 p-4 border border-sky-200 bg-sky-50 rounded-lg">
                <h3 className="text-xs font-bold text-sky-900 mb-2">Solicitar: {selectedInst.name}</h3>
                <form onSubmit={handleRequestLoan} className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-sky-900 font-medium mb-0.5">Fecha de inicio:</label>
                    <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full text-xs p-1.5 border rounded bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-sky-900 font-medium mb-0.5">Fecha de devolución:</label>
                    <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full text-xs p-1.5 border rounded bg-white" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="w-full py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded">Confirmar</button>
                    <button type="button" onClick={() => setSelectedInst(null)} className="w-full py-1.5 bg-slate-200 text-slate-700 text-xs rounded">Cancelar</button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* COLUMNA 2: Préstamos Activos y Reporte de Préstamos Cerrados */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
              <h2 className="text-lg font-bold">
                {loanFilterMode === "ACTIVE" ? "Préstamos Activos" : "Reporte Préstamos Cerrados"}
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={() => setLoanFilterMode("ACTIVE")}
                  className={`px-2 py-1 text-[11px] font-semibold rounded ${
                    loanFilterMode === "ACTIVE" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Activos
                </button>
                <button
                  onClick={() => setLoanFilterMode("CLOSED")}
                  className={`px-2 py-1 text-[11px] font-semibold rounded ${
                    loanFilterMode === "CLOSED" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  Cerrados
                </button>
              </div>
            </div>

            {/* Filtro por rango de fechas */}
            <div className="mb-3 p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500">Desde (Inicio):</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="w-full text-xs p-1 border rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500">Hasta (Devolución):</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full text-xs p-1 border rounded bg-white"
                />
              </div>
            </div>

            {/* Resumen estadístico cuando está en modo Reporte Cerrados */}
            {loanFilterMode === "CLOSED" && closedReportSummary && (
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded">
                  <span className="block text-sm font-bold text-emerald-800">{closedReportSummary.returned_ok || 0}</span>
                  <span className="text-[10px] text-emerald-700">Sin Fallas</span>
                </div>
                <div className="p-2 bg-rose-50 border border-rose-200 rounded">
                  <span className="block text-sm font-bold text-rose-800">{closedReportSummary.returned_damaged || 0}</span>
                  <span className="text-[10px] text-rose-700">Con Daño</span>
                </div>
                <div className="p-2 bg-slate-100 border border-slate-200 rounded">
                  <span className="block text-sm font-bold text-slate-800">{closedReportSummary.rejected || 0}</span>
                  <span className="text-[10px] text-slate-600">Rechazados</span>
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {safeLoans.length === 0 && (
                <p className="text-xs text-slate-500">
                  {loanFilterMode === "ACTIVE" ? "Sin préstamos activos." : "No hay préstamos cerrados en este rango."}
                </p>
              )}
              {safeLoans.map((loan) => {
                const inst = safeInstruments.find(i => i.id === loan.instrument_id) || {};
                const st = (loan.status || "PENDING").toUpperCase();
                return (
                  <div key={loan.id} className="p-3 border rounded-lg bg-slate-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-bold text-sm text-slate-900">Préstamo #{loan.id}</span>
                        <p className="text-xs text-slate-700 font-medium mt-1">
                          {loan.instrument_name || inst.name || "Instrumento Desconocido"}
                          {loan.serial_number ? ` (${loan.serial_number})` : ""}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Solicitante: {loan.user_name ? `${loan.user_name} (${loan.user_email})` : (loan.user_email || user?.email)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Periodo: {loan.start_date ? String(loan.start_date).substring(0, 10) : ""} → {loan.due_date ? String(loan.due_date).substring(0, 10) : "No definida"}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                        st === "APPROVED" || st === "ACTIVE" || st === "RETURNED" ? "bg-emerald-100 text-emerald-800" :
                        st === "IN_INSPECTION" ? "bg-purple-100 text-purple-800" :
                        st === "RETURNED_WITH_DAMAGE" || st === "REJECTED" ? "bg-rose-100 text-rose-800" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {st}
                      </span>
                    </div>

                    {loanFilterMode === "ACTIVE" && (
                      <div className="flex gap-2 mt-3 border-t pt-2">
                        {/* Fase 1: PENDING -> ADMIN */}
                        {(st === "PENDING" || st === "REQUESTED") && isAdmin && (
                          <>
                            <button onClick={() => updateLoanStatus(loan.id, "approve", `Préstamo #${loan.id} aprobado`)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded">
                              Aprobar
                            </button>
                            <button onClick={() => updateLoanStatus(loan.id, "reject", `Préstamo #${loan.id} rechazado`)} className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs rounded">
                              Rechazar
                            </button>
                          </>
                        )}
                        
                        {/* Fase 2: APPROVED / ACTIVE -> ADMIN registra retorno */}
                        {(st === "APPROVED" || st === "ACTIVE") && isAdmin && (
                          <button onClick={() => updateLoanStatus(loan.id, "return", `Préstamo #${loan.id} recibido en taller para revisión`)} className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded">
                            Registrar Retorno
                          </button>
                        )}

                        {(st === "APPROVED" || st === "ACTIVE") && isStudent && (
                          <span className="text-xs text-emerald-700 italic">En posesión. Entregar en taller para concluir.</span>
                        )}
                        
                        {/* Fase 3: IN_INSPECTION -> ADMIN realiza inspección técnica */}
                        {st === "IN_INSPECTION" && isAdmin && (
                          <button onClick={() => {
                            setChecklist(getChecklistTemplate(loan.instrument_name || inst.name, loan.category || inst.category));
                            setNotes("Instrumento verificado sin novedades.");
                            setInspectingLoan(loan);
                          }} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded">
                            Inspección Técnica
                          </button>
                        )}

                        {st === "IN_INSPECTION" && isStudent && (
                          <span className="text-xs text-purple-700 italic">En taller bajo revisión técnica.</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal de Inspección Técnica */}
            {inspectingLoan && isAdmin && (
              <div className="mt-4 p-4 border border-purple-200 bg-purple-50 rounded-lg">
                <div className="mb-2">
                  <h3 className="text-xs font-bold text-purple-900">
                    Inspección Técnica — Préstamo #{inspectingLoan.id}
                  </h3>
                  <p className="text-[11px] text-purple-700">
                    <strong>Instrumento:</strong> {inspectingLoan.instrument_name || (safeInstruments.find(i => i.id === inspectingLoan.instrument_id)?.name)}
                  </p>
                  <p className="text-[11px] text-purple-700">
                    <strong>Alumno:</strong> {inspectingLoan.user_name ? `${inspectingLoan.user_name} (${inspectingLoan.user_email})` : inspectingLoan.user_email}
                  </p>
                </div>

                <form onSubmit={handleCloseInspection} className="space-y-3">
                  <div className="bg-white p-2.5 rounded border border-purple-100 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-700">
                      Checklist físico (desmarca los puntos que presenten fallas):
                    </p>
                    {Object.keys(checklist).map((key) => (
                      <label key={key} className="flex items-center justify-between text-xs capitalize cursor-pointer py-0.5">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checklist[key]}
                            onChange={(e) => setChecklist({ ...checklist, [key]: e.target.checked })}
                            className="rounded"
                          />
                          {key.replace("_", " ")}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          checklist[key] ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        }`}>
                          {checklist[key] ? "OK" : "CON FALLA"}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className={`text-[11px] px-2.5 py-1.5 rounded font-semibold ${
                    failedChecklistItems.length === 0
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  }`}>
                    {failedChecklistItems.length === 0
                      ? "Dictamen: APROBADO (Sin fallas detectadas)"
                      : `Dictamen: CON FALLAS (${failedChecklistItems.join(", ")}) — Pasa a Mantenimiento`}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-purple-900 mb-1">
                      Observaciones y detalle de fallas:
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Describe las observaciones o fallas encontradas al devolver el instrumento..."
                      className="w-full text-xs p-1.5 border rounded bg-white"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button type="submit" className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded">
                      Cerrar y Sincronizar
                    </button>
                    <button type="button" onClick={() => setInspectingLoan(null)} className="w-full py-1.5 bg-slate-200 text-slate-700 text-xs rounded">
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* COLUMNA 3: MongoDB Inspections */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-lg font-bold">
                {isStudent ? "Mis Préstamos Finalizados (MongoDB)" : "Registros MongoDB"}
              </h2>
            </div>
            <div className="space-y-3 max-h-[550px] overflow-y-auto">
              {visibleInspections.length === 0 && (
                <p className="text-xs text-slate-500">
                  {isStudent
                    ? "Aún no tienes préstamos finalizados con reporte de inspección."
                    : "No hay inspecciones guardadas en MongoDB."}
                </p>
              )}
              {visibleInspections.map((insp, idx) => {
                const localInst = safeInstruments.find(i => Number(i.id) === Number(insp.instrument_id));
                const displayInstName = insp.instrument_name || localInst?.name || `Instrumento #${insp.instrument_id || ""}`;
                const displaySerial = insp.serial_number || localInst?.serial_number || localInst?.serial || "";
                const isPassed = insp.passed !== false;

                const checklistEntries = insp.checklist && typeof insp.checklist === "object"
                  ? Object.entries(insp.checklist)
                  : [];
                const faults = checklistEntries
                  .filter(([, val]) => val === false || val === "falla" || val === "dañado")
                  .map(([key]) => key.replace("_", " "));

                return (
                  <div
                    key={insp._id || `${insp.loan_id}-${idx}`}
                    className={`p-3 border rounded-lg text-xs space-y-1.5 ${
                      isPassed
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-rose-200 bg-rose-50/40"
                    }`}
                  >
                    <div className="flex justify-between items-center font-bold">
                      <span className={isPassed ? "text-emerald-900" : "text-rose-900"}>
                        Préstamo #{insp.loan_id}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isPassed
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}>
                        {isPassed ? "APROBADO" : "CON FALLAS / DAÑADO"}
                      </span>
                    </div>

                    <div className="text-slate-700 space-y-0.5 border-t border-slate-200/60 pt-1.5">
                      <p>
                        <strong>Instrumento:</strong> {displayInstName}
                        {displaySerial ? <span className="text-slate-500"> ({displaySerial})</span> : null}
                      </p>
                      <p>
                        <strong>Solicitante:</strong>{" "}
                        {insp.user_name || insp.user_email
                          ? `${insp.user_name || ""}${insp.user_email ? ` (${insp.user_email})` : ""}`.trim()
                          : "Alumno"}
                      </p>
                    </div>

                    {faults.length > 0 ? (
                      <p className="text-[11px] font-semibold text-rose-700 bg-rose-100/70 px-2 py-1 rounded">
                        Fallas detectadas: {faults.join(", ")}
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-700 font-medium">
                        Fallas al devolver: Ninguna (entrega en buen estado)
                      </p>
                    )}

                    <p className="text-slate-800">
                      <strong>Observaciones:</strong> {insp.notes || "Sin observaciones adicionales."}
                    </p>

                    {checklistEntries.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                          Checklist de inspección:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {checklistEntries.map(([key, val]) => {
                            const ok = val !== false && val !== "falla" && val !== "dañado";
                            const label = typeof val === "boolean"
                              ? `${ok ? "✓" : "✗"} ${key.replace("_", " ")}`
                              : `${key}: ${val}`;
                            return (
                              <span
                                key={key}
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                  ok
                                    ? "bg-white border-emerald-200 text-emerald-800"
                                    : "bg-rose-100 border-rose-300 text-rose-800 font-semibold"
                                }`}
                              >
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {insp.inspected_at && (
                      <p className="text-[10px] text-slate-400 pt-1">
                        {new Date(insp.inspected_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      ) : (
        /* VISTA DE USUARIOS Y PERFIL (CRUD Entidad 1) */
        <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Edición de Mi Perfil */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 border-b pb-2">Mi Perfil</h2>
            <form onSubmit={handleUpdateOwnProfile} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre completo:</label>
                <input
                  type="text"
                  required
                  value={profileForm.name}
                  onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full text-xs p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Correo institucional:</label>
                <input
                  type="email"
                  required
                  value={profileForm.email}
                  onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full text-xs p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nueva contraseña (opcional):
                </label>
                <input
                  type="password"
                  placeholder="Dejar en blanco para mantener actual"
                  value={profileForm.password}
                  onChange={e => setProfileForm({ ...profileForm, password: e.target.value })}
                  className="w-full text-xs p-2 border rounded"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded">
                Actualizar Mi Perfil
              </button>
            </form>
          </section>

          {/* CRUD de Usuarios para ADMIN */}
          {isAdmin && (
            <section className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold mb-4 border-b pb-2">Gestión de Usuarios (CRUD y Baja Lógica)</h2>

              <form onSubmit={handleSaveUserAdmin} className="mb-4 p-3 bg-slate-50 border rounded-lg grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">Nombre</label>
                  <input
                    type="text"
                    required
                    placeholder="Nombre completo"
                    value={userForm.name}
                    onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                    className="w-full text-xs p-1.5 border rounded bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="correo@sonilab.edu"
                    value={userForm.email}
                    onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full text-xs p-1.5 border rounded bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    {editingUser ? "Contraseña (opc.)" : "Contraseña"}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    placeholder="Mín. 6 caracteres"
                    value={userForm.password}
                    onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full text-xs p-1.5 border rounded bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">Rol</label>
                  <select
                    value={userForm.role}
                    onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full text-xs p-1.5 border rounded bg-white"
                  >
                    <option value="STUDENT">STUDENT</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <div className="flex gap-1">
                  <button type="submit" className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded">
                    {editingUser ? "Guardar" : "Registrar"}
                  </button>
                  {editingUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(null);
                        setUserForm({ name: "", email: "", password: "", role: "STUDENT", active: true });
                      }}
                      className="px-2 py-1.5 bg-slate-200 text-slate-700 text-xs rounded"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </form>

              <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Buscar usuario por nombre o correo..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && loadUsers(1)}
                    className="text-xs p-1.5 border rounded"
                  />
                  <button onClick={() => loadUsers(1)} className="px-3 py-1 bg-slate-800 text-white text-xs rounded">
                    Buscar
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInactiveUsers}
                    onChange={e => setIncludeInactiveUsers(e.target.checked)}
                  />
                  Mostrar dados de baja (inactivos)
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-slate-600">
                      <th className="p-2">ID</th>
                      <th className="p-2">Nombre</th>
                      <th className="p-2">Correo</th>
                      <th className="p-2">Rol</th>
                      <th className="p-2">Estado</th>
                      <th className="p-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map(u => (
                      <tr key={u.id} className="border-b hover:bg-slate-50">
                        <td className="p-2 font-mono">{u.id}</td>
                        <td className="p-2 font-medium">{u.name}</td>
                        <td className="p-2 text-slate-600">{u.email}</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">
                            {u.role}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            u.active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
                            {u.active ? "ACTIVO" : "BAJA LÓGICA"}
                          </span>
                        </td>
                        <td className="p-2 text-right space-x-1">
                          <button
                            onClick={() => {
                              setEditingUser(u);
                              setUserForm({
                                name: u.name,
                                email: u.email,
                                password: "",
                                role: u.role,
                                active: u.active
                              });
                            }}
                            className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px]"
                          >
                            Editar
                          </button>
                          {u.active ? (
                            <button
                              onClick={() => handleDeactivateUser(u.id)}
                              className="px-2 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-[11px]"
                            >
                              Baja Lógica
                            </button>
                          ) : (
                            <button
                              onClick={async () => {
                                await api.put(`/auth/users/${u.id}`, { active: true });
                                notify(`Usuario #${u.id} reactivado`, "success");
                                loadUsers(usersPage);
                              }}
                              className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-[11px]"
                            >
                              Reactivar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
