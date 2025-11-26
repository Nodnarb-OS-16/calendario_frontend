// ===========================================
// CONFIGURACIÓN DE LA API
// ===========================================
const API_BASE_URL = 'http://localhost:8080/api';

// ===========================================
// VARIABLES GLOBALES Y DATOS BASE
// ===========================================

const horas = [
  "08:00", "08:30", "09:00", "09:45", "10:30",
  "11:15", "12:00", "13:00", "14:00", "15:15", "16:00"
];

const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const meses = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

const calendario = document.getElementById("calendario");
const contenedorVistas = document.getElementById("contenedorVistas");

let mesActual = new Date().getMonth();
let anioActual = new Date().getFullYear();
let semanaActual = obtenerSemanaActual();
let vistaActual = "semana";

// Datos del usuario logueado
let usuarioActual = {
  id: null,
  nombre: null,
  correoElectronico: null,
  rol: null
};

// Cache de datos
let cursosDisponibles = [];
let asignaturasDisponibles = [];
let evaluacionesCache = [];
let tareasCache = [];
let asignacionesDocenteCache = [];

// ===========================================
// FUNCIONES DE UTILIDAD (FECHAS)
// ===========================================

function obtenerSemanaActual() {
  const hoy = new Date();
  const diaSemana = hoy.getDay();
  const dif = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
  return new Date(hoy.setDate(dif));
}

function obtenerRangoFechas() {
  const inicio = new Date(semanaActual);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 4);

  const formatoFecha = (fecha) => `${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
  return `${formatoFecha(inicio)} — ${formatoFecha(fin)}`;
}

function obtenerFechaDelDia(indiceDia) {
  const fecha = new Date(semanaActual);
  fecha.setDate(semanaActual.getDate() + indiceDia);
  return fecha.toISOString().split('T')[0];
}

function formatearFecha(fechaStr) {
  const fecha = new Date(fechaStr + 'T00:00:00');
  return `${fecha.getDate()}/${fecha.getMonth() + 1}/${fecha.getFullYear()}`;
}

function obtenerDiaSemana(fechaStr) {
  const fecha = new Date(fechaStr + 'T00:00:00');
  const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return diasSemana[fecha.getDay()];
}

// ===========================================
// FUNCIONES DE API
// ===========================================

async function apiCall(endpoint, method = 'GET', body = null, params = {}) {
  try {
    mostrarCargando(true);
    
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error en API:', error);
    throw error;
  } finally {
    mostrarCargando(false);
  }
}

function mostrarCargando(mostrar) {
  const indicator = document.getElementById('loadingIndicator');
  if (indicator) {
    indicator.classList.toggle('hidden', !mostrar);
  }
}

function mostrarError(mensaje) {
  const errorDiv = document.getElementById('mensajeError');
  if (errorDiv) {
    errorDiv.textContent = mensaje;
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 5000);
  } else {
    alert(mensaje);
  }
}

// ===========================================
// GESTIÓN DE LOGIN/LOGOUT
// ===========================================

async function iniciarSesion() {
  const correo = document.getElementById("correo").value;
  const clave = document.getElementById("clave").value;

  if (!correo || !clave) {
    mostrarError("Por favor, completa todos los campos");
    return;
  }

  try {
    const response = await apiCall('/login', 'POST', {
      correoElectronico: correo,
      contrasena: clave
    });

    usuarioActual = response;
    
    document.getElementById("login").classList.add("hidden");
    document.getElementById("appContainer").classList.remove("hidden");
    document.getElementById("tituloBienvenida").textContent = 
      `Bienvenido(a) ${response.nombre}`;

    document.getElementById("panelAlumno").classList.add("hidden");
    document.getElementById("panelProfesor").classList.add("hidden");
    document.getElementById("panelDirector").classList.add("hidden");

    // Cargar catálogos
    await cargarCatalogos();

    switch (response.rol) {
      case 'Docente':
        document.getElementById("panelProfesor").classList.remove("hidden");
        await cargarAsignacionesDocente();
        await cargarEvaluacionesDocente();
        break;
      case 'Alumno':
        document.getElementById("panelAlumno").classList.remove("hidden");
        await cargarTareasAlumno();
        break;
      case 'Director':
        document.getElementById("panelDirector").classList.remove("hidden");
        await cargarConfiguracion();
        break;
    }

    cambiarVista('semana');
  } catch (error) {
    mostrarError("Credenciales incorrectas");
  }
}

function cerrarSesion() {
  usuarioActual = { id: null, nombre: null, correoElectronico: null, rol: null };
  evaluacionesCache = [];
  tareasCache = [];
  
  document.getElementById("login").classList.remove("hidden");
  document.getElementById("appContainer").classList.add("hidden");
  document.getElementById("correo").value = '';
  document.getElementById("clave").value = '';
}

// ===========================================
// CARGAR CATÁLOGOS
// ===========================================

async function cargarCatalogos() {
  try {
    cursosDisponibles = await apiCall('/catalogos/cursos');
    asignaturasDisponibles = await apiCall('/catalogos/asignaturas');
  } catch (error) {
    console.error('Error al cargar catálogos:', error);
  }
}

// ===========================================
// FUNCIONES DEL DOCENTE
// ===========================================

async function cargarAsignacionesDocente() {
  try {
    asignacionesDocenteCache = await apiCall(`/evaluaciones/docente/${usuarioActual.id}`);
    
    // Poblar select de cursos
    const selectCurso = document.getElementById('cursoProfesor');
    selectCurso.innerHTML = '<option value="" disabled selected>Seleccione curso</option>';
    
    const cursosUnicos = [...new Set(asignacionesDocenteCache.map(a => a.cursoAsignaturaDocente?.curso?.id))];
    cursosUnicos.forEach(cursoId => {
      const curso = cursosDisponibles.find(c => c.id === cursoId);
      if (curso) {
        const option = document.createElement('option');
        option.value = curso.id;
        option.textContent = curso.nombre;
        selectCurso.appendChild(option);
      }
    });

    // Poblar select de asignaturas
    const selectAsignatura = document.getElementById('asignaturaProfesor');
    selectAsignatura.innerHTML = '<option value="" disabled selected>Seleccione asignatura</option>';
    
    const asignaturasUnicas = [...new Set(asignacionesDocenteCache.map(a => a.cursoAsignaturaDocente?.asignatura?.id))];
    asignaturasUnicas.forEach(asignaturaId => {
      const asignatura = asignaturasDisponibles.find(a => a.id === asignaturaId);
      if (asignatura) {
        const option = document.createElement('option');
        option.value = asignatura.id;
        option.textContent = asignatura.nombre;
        selectAsignatura.appendChild(option);
      }
    });
  } catch (error) {
    console.error('Error al cargar asignaciones:', error);
  }
}

async function cargarEvaluacionesDocente() {
  try {
    evaluacionesCache = await apiCall(`/evaluaciones/docente/${usuarioActual.id}`);
    mostrarEvaluacionesProfesor();
  } catch (error) {
    console.error('Error al cargar evaluaciones:', error);
  }
}

function mostrarEvaluacionesProfesor() {
  const select = document.getElementById("evaluacionesProfesor");
  select.innerHTML = '';

  if (evaluacionesCache.length === 0) {
    const option = document.createElement('option');
    option.disabled = true;
    option.textContent = 'No hay evaluaciones agendadas';
    select.appendChild(option);
    return;
  }

  evaluacionesCache.forEach(ev => {
    const option = document.createElement('option');
    option.value = ev.id;
    const curso = ev.cursoAsignaturaDocente?.curso?.nombre || 'N/A';
    const asignatura = ev.cursoAsignaturaDocente?.asignatura?.nombre || 'N/A';
    option.textContent = `${formatearFecha(ev.fecha)} ${ev.hora} - ${ev.descripcion} (${curso} - ${asignatura})`;
    select.appendChild(option);
  });
}

async function guardarPrueba() {
  const descripcion = document.getElementById("evaluacion").value;
  const cursoId = document.getElementById("cursoProfesor").value;
  const asignaturaId = document.getElementById("asignaturaProfesor").value;
  const fecha = document.getElementById("fechaProfesor").value;
  const hora = document.getElementById("horaProfesor").value;

  if (!descripcion || !cursoId || !asignaturaId || !fecha || !hora) {
    mostrarError("Por favor, completa todos los campos");
    return;
  }

  // Buscar la asignación correspondiente
  const asignacion = asignacionesDocenteCache.find(a => 
    a.cursoAsignaturaDocente?.curso?.id == cursoId && 
    a.cursoAsignaturaDocente?.asignatura?.id == asignaturaId
  );

  if (!asignacion) {
    mostrarError("No tienes asignada esta combinación de curso y asignatura");
    return;
  }

  try {
    await apiCall('/evaluaciones', 'POST', {
      fecha: fecha,
      hora: hora + ':00',
      descripcion: descripcion,
      cursoAsignaturaDocente: {
        id: asignacion.cursoAsignaturaDocente.id
      }
    }, { docenteId: usuarioActual.id });

    alert("Evaluación agendada correctamente");
    document.getElementById("evaluacion").value = '';
    await cargarEvaluacionesDocente();
    construirCalendario();
  } catch (error) {
    mostrarError(error.message);
  }
}

async function eliminarEvaluacionSeleccionada() {
  const select = document.getElementById("evaluacionesProfesor");
  const evaluacionId = select.value;

  if (!evaluacionId) {
    mostrarError("Selecciona una evaluación");
    return;
  }

  if (!confirm("¿Estás seguro de eliminar esta evaluación?")) {
    return;
  }

  try {
    await apiCall(`/evaluaciones/${evaluacionId}`, 'DELETE', null, {
      docenteId: usuarioActual.id
    });

    alert("Evaluación eliminada");
    await cargarEvaluacionesDocente();
    construirCalendario();
  } catch (error) {
    mostrarError(error.message);
  }
}

// ===========================================
// FUNCIONES DEL ALUMNO
// ===========================================

async function cargarTareasAlumno() {
  try {
    tareasCache = await apiCall(`/tareas/alumno/${usuarioActual.id}`);
    mostrarTareasDelAlumno();
  } catch (error) {
    console.error('Error al cargar tareas:', error);
  }
}

function mostrarTareasDelAlumno() {
  const select = document.getElementById("tareasAlumno");
  select.innerHTML = '';

  if (tareasCache.length === 0) {
    const option = document.createElement('option');
    option.disabled = true;
    option.textContent = 'No hay tareas registradas';
    select.appendChild(option);
    return;
  }

  tareasCache.forEach(tarea => {
    const option = document.createElement('option');
    option.value = tarea.id;
    option.textContent = `${formatearFecha(tarea.fecha)} ${tarea.hora} - ${tarea.titulo}`;
    select.appendChild(option);
  });
}

async function guardarTarea() {
  const titulo = document.getElementById("tareaAlumno").value;
  const fecha = document.getElementById("fechaAlumno").value;
  const hora = document.getElementById("horaAlumno").value;

  if (!titulo || !fecha || !hora) {
    mostrarError("Por favor, completa todos los campos");
    return;
  }

  try {
    await apiCall('/tareas', 'POST', {
      titulo: titulo,
      descripcion: '',
      fecha: fecha,
      hora: hora + ':00',
      alumno: { id: usuarioActual.id },
      curso: { id: 1 } // Por ahora, curso por defecto
    }, { alumnoId: usuarioActual.id });

    alert("Tarea guardada correctamente");
    document.getElementById("tareaAlumno").value = '';
    await cargarTareasAlumno();
    construirCalendario();
  } catch (error) {
    mostrarError(error.message);
  }
}

async function eliminarTareaSeleccionada() {
  const select = document.getElementById("tareasAlumno");
  const tareaId = select.value;

  if (!tareaId) {
    mostrarError("Selecciona una tarea");
    return;
  }

  if (!confirm("¿Estás seguro de eliminar esta tarea?")) {
    return;
  }

  try {
    await apiCall(`/tareas/${tareaId}`, 'DELETE', null, {
      alumnoId: usuarioActual.id
    });

    alert("Tarea eliminada");
    await cargarTareasAlumno();
    construirCalendario();
  } catch (error) {
    mostrarError(error.message);
  }
}

// ===========================================
// FUNCIONES DEL DIRECTOR
// ===========================================

async function cargarConfiguracion() {
  try {
    const configs = await apiCall('/director/configuracion', 'GET', null, {
      directorId: usuarioActual.id
    });

    const configLimite = configs.find(c => c.clave === 'max_evaluaciones_por_dia');
    if (configLimite) {
      document.getElementById('limitePruebas').value = configLimite.valor;
    }
    
    // Cargar listas de CRUD
    await cargarListaDocentes();
    await cargarListaEstudiantes();
    
  } catch (error) {
    console.error('Error al cargar configuración:', error);
  }
}

async function guardarLimitePruebas() {
  const nuevoLimite = parseInt(document.getElementById("limitePruebas").value);

  if (isNaN(nuevoLimite) || nuevoLimite < 1 || nuevoLimite > 10) {
    mostrarError("Ingresa un número válido entre 1 y 10");
    return;
  }

  try {
    await apiCall('/director/configuracion/max-evaluaciones', 'PUT', {
      maxEvaluacionesPorDia: nuevoLimite
    }, { directorId: usuarioActual.id });

    alert(`Límite actualizado a ${nuevoLimite} evaluaciones por día`);
  } catch (error) {
    mostrarError(error.message);
  }
}

// ===========================================
// CONSTRUCCIÓN DEL CALENDARIO
// ===========================================

async function construirCalendario() {
  calendario.innerHTML = '';
  
  calendario.innerHTML += '<div class="celda header">Hora</div>';
  dias.forEach(dia => {
    calendario.innerHTML += `<div class="celda header">${dia}</div>`;
  });

  // Cargar eventos según el rol
  let eventosParaMostrar = [];
  
  if (usuarioActual.rol === 'Alumno') {
    const evaluaciones = await apiCall(`/evaluaciones/alumno/${usuarioActual.id}`);
    eventosParaMostrar = [...evaluaciones, ...tareasCache];
  } else if (usuarioActual.rol === 'Docente') {
    eventosParaMostrar = evaluacionesCache;
  } else {
    // Director ve todas las evaluaciones
    try {
      eventosParaMostrar = await apiCall(`/evaluaciones/curso/1`); // Simplificado
    } catch (error) {
      console.error('Error al cargar evaluaciones:', error);
    }
  }

  horas.forEach(hora => {
    calendario.innerHTML += `<div class="celda">${hora}</div>`;

    dias.forEach((dia, indiceDia) => {
      const celda = document.createElement('div');
      celda.className = 'celda';

      const fechaKey = obtenerFechaDelDia(indiceDia);
      const horaFormato = hora + ':00';
      
      const eventos = eventosParaMostrar.filter(e => 
        e.fecha === fechaKey && e.hora === horaFormato
      );

      eventos.forEach(evento => {
        if (evento.titulo) {
          // Es una tarea
          celda.classList.add('tarea');
          celda.innerHTML = `<div class="evento-tipo">TAREA</div>${evento.titulo}`;
        } else if (evento.descripcion) {
          // Es una evaluación
          celda.classList.add('prueba');
          const curso = evento.cursoAsignaturaDocente?.curso?.nombre || '';
          const asignatura = evento.cursoAsignaturaDocente?.asignatura?.nombre || '';
          celda.innerHTML = `<div class="evento-tipo">EVALUACIÓN</div>${asignatura} (${curso})<br><small>${evento.descripcion}</small>`;
        }
      });

      calendario.appendChild(celda);
    });
  });

  document.getElementById("rangoFechas").textContent = obtenerRangoFechas();
}

// ===========================================
// GESTIÓN DE VISTAS
// ===========================================

function cambiarVista(vista) {
  vistaActual = vista;
  
  document.querySelectorAll('#selectorVista .btn-view').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const vistaBtn = document.getElementById(`btn${vista.charAt(0).toUpperCase() + vista.slice(1)}`);
  if (vistaBtn) {
    vistaBtn.classList.add('active');
  }

  document.getElementById("contenedorVistas").innerHTML = "";
  document.getElementById("calendario").classList.add("hidden");
  
  const calendarNavBar = document.getElementById("calendarNavBar");
  if (vista === "semana") {
    calendarNavBar.classList.remove("hidden");
    document.getElementById("calendario").classList.remove("hidden");
    construirCalendario();
  } else {
    calendarNavBar.classList.add("hidden");
    if (vista === "anio") {
      mostrarVistaAnual();
    } else if (vista === "mes") {
      mostrarVistaMensual(mesActual, anioActual);
    }
  }
}

function navegarSemana(direccion) {
  const nuevaFecha = new Date(semanaActual);
  nuevaFecha.setDate(semanaActual.getDate() + (direccion * 7));
  semanaActual = nuevaFecha;
  construirCalendario();
}

function mostrarVistaAnual() {
  const contenedor = document.getElementById("contenedorVistas");
  contenedor.innerHTML = `<div class="nav-mes">
    <button onclick="anioActual--; mostrarVistaAnual()"><i class="fas fa-arrow-left"></i> Anterior</button>
    <h2>${anioActual}</h2>
    <button onclick="anioActual++; mostrarVistaAnual()">Siguiente <i class="fas fa-arrow-right"></i></button>
  </div>
  <div class="calendario-anual" id="mesesContenedor"></div>`;

  const mesesContenedor = document.getElementById("mesesContenedor");
  meses.forEach((nombreMes, indice) => {
    const mesMini = document.createElement('div');
    mesMini.className = 'mes-mini';
    mesMini.textContent = nombreMes;
    mesMini.onclick = () => {
      mesActual = indice;
      cambiarVista('mes');
    };
    mesesContenedor.appendChild(mesMini);
  });
}

function mostrarVistaMensual(mes, anio) {
  mesActual = mes;
  anioActual = anio;
  const contenedor = document.getElementById("contenedorVistas");
  const nombreMes = meses[mesActual];

  contenedor.innerHTML = `<div class="nav-mes">
    <button onclick="navegarMes(-1)"><i class="fas fa-arrow-left"></i> Anterior</button>
    <h2>${nombreMes} ${anioActual}</h2>
    <button onclick="navegarMes(1)">Siguiente <i class="fas fa-arrow-right"></i></button>
  </div>
  <div class="calendario-mensual" id="calendarioMensual"></div>`;

  const calendarioMensual = document.getElementById("calendarioMensual");
  const encabezados = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  encabezados.forEach(dia => {
    calendarioMensual.innerHTML += `<div class="celda header">${dia}</div>`;
  });

  const primerDiaDelMes = new Date(anioActual, mesActual, 1);
  const ultimoDiaDelMes = new Date(anioActual, mesActual + 1, 0);
  const diasEnElMes = ultimoDiaDelMes.getDate();

  let primerDiaSemana = primerDiaDelMes.getDay();
  primerDiaSemana = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;

  for (let i = 0; i < primerDiaSemana; i++) {
    calendarioMensual.innerHTML += `<div class="celda celda-vacia"></div>`;
  }

  for (let dia = 1; dia <= diasEnElMes; dia++) {
    const fecha = new Date(anioActual, mesActual, dia);
    const fechaKey = fecha.toISOString().split('T')[0];
    
    const celda = document.createElement('div');
    celda.className = 'celda';
    celda.innerHTML = `<strong>${dia}</strong>`;
    
    calendarioMensual.appendChild(celda);
  }
}

function navegarMes(direccion) {
  mesActual += direccion;
  if (mesActual < 0) {
    mesActual = 11;
    anioActual--;
  } else if (mesActual > 11) {
    mesActual = 0;
    anioActual++;
  }
  mostrarVistaMensual(mesActual, anioActual);
}

// ===========================================
// INICIALIZACIÓN
// ===========================================
(function inicializarInterfaz() {
  document.getElementById("rangoFechas").textContent = obtenerRangoFechas();
  const btnSemana = document.getElementById('btnSemana');
  if (btnSemana) {
    btnSemana.classList.add('active');
  }
  document.getElementById("calendarNavBar").classList.add("hidden");
  document.getElementById("calendario").classList.add("hidden");
  
  // Establecer fecha actual en los inputs
  const hoy = new Date().toISOString().split('T')[0];
  const inputsFecha = ['fechaAlumno', 'fechaProfesor'];
  inputsFecha.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = hoy;
  });
})

// ===========================================
// FUNCIONES DEL DIRECTOR - CRUD
// ===========================================

// Alternar entre vistas de CRUD
function mostrarCrudDocentes() {
  document.getElementById('crudDocentes').classList.remove('hidden');
  document.getElementById('crudEstudiantes').classList.add('hidden');
  document.getElementById('btnCrudDocentes').classList.add('active');
  document.getElementById('btnCrudEstudiantes').classList.remove('active');
}

function mostrarCrudEstudiantes() {
  document.getElementById('crudEstudiantes').classList.remove('hidden');
  document.getElementById('crudDocentes').classList.add('hidden');
  document.getElementById('btnCrudEstudiantes').classList.add('active');
  document.getElementById('btnCrudDocentes').classList.remove('active');
}

// ===========================================
// CRUD DOCENTES
// ===========================================

let docentesCache = [];

async function cargarListaDocentes() {
  try {
    docentesCache = await apiCall(`/director/docentes`, 'GET', null, {
      directorId: usuarioActual.id
    });
    
    mostrarListaDocentes();
  } catch (error) {
    console.error('Error al cargar docentes:', error);
    document.getElementById('listaDocentes').innerHTML = 
      '<p class="no-data">Error al cargar docentes</p>';
  }
}

function mostrarListaDocentes() {
  const container = document.getElementById('listaDocentes');
  
  if (docentesCache.length === 0) {
    container.innerHTML = '<p class="no-data">No hay docentes registrados</p>';
    return;
  }
  
  container.innerHTML = docentesCache.map(docente => `
    <div class="usuario-card">
      <div class="usuario-card-header">
        <span class="usuario-nombre">
          <i class="fas fa-chalkboard-teacher"></i> 
          ${docente.nombre} ${docente.apellidoPaterno} ${docente.apellidoMaterno}
        </span>
      </div>
      <div class="usuario-info">
        <i class="fas fa-envelope"></i> ${docente.correoElectronico}
      </div>
      <div class="usuario-info">
        <i class="fas fa-id-badge"></i> ID: ${docente.id}
      </div>
      <div class="usuario-actions">
        <button class="btn-edit" onclick="editarDocente(${docente.id})">
          <i class="fas fa-edit"></i> Editar
        </button>
        <button class="btn-delete" onclick="eliminarDocente(${docente.id})">
          <i class="fas fa-trash"></i> Eliminar
        </button>
      </div>
    </div>
  `).join('');
}

async function guardarDocente() {
  const id = document.getElementById('docenteIdEdit').value;
  const nombre = document.getElementById('docenteNombre').value;
  const apellidoP = document.getElementById('docenteApellidoP').value;
  const apellidoM = document.getElementById('docenteApellidoM').value;
  const correo = document.getElementById('docenteCorreo').value;
  const password = document.getElementById('docentePassword').value;
  
  if (!nombre || !apellidoP || !correo) {
    mostrarError('Por favor, completa los campos obligatorios (Nombre, Apellido Paterno y Correo)');
    return;
  }
  
  if (!id && !password) {
    mostrarError('La contraseña es obligatoria para nuevos docentes');
    return;
  }
  
  try {
    const body = {
      nombre,
      apellidoPaterno: apellidoP,
      apellidoMaterno: apellidoM,
      correoElectronico: correo
    };
    
    // Solo enviar contraseña si se ingresó
    if (password) {
      body.contrasena = password;
    }
    
    if (id) {
      // Actualizar
      await apiCall(`/director/docentes/${id}`, 'PUT', body, {
        directorId: usuarioActual.id
      });
      alert('Docente actualizado exitosamente');
    } else {
      // Crear
      await apiCall('/director/docentes', 'POST', body, {
        directorId: usuarioActual.id
      });
      alert('Docente creado exitosamente');
    }
    
    limpiarFormularioDocente();
    await cargarListaDocentes();
  } catch (error) {
    mostrarError(error.message);
  }
}

function editarDocente(id) {
  const docente = docentesCache.find(d => d.id === id);
  if (!docente) return;
  
  document.getElementById('docenteIdEdit').value = docente.id;
  document.getElementById('docenteNombre').value = docente.nombre;
  document.getElementById('docenteApellidoP').value = docente.apellidoPaterno;
  document.getElementById('docenteApellidoM').value = docente.apellidoMaterno;
  document.getElementById('docenteCorreo').value = docente.correoElectronico;
  document.getElementById('docentePassword').value = '';
  document.getElementById('docentePassword').placeholder = 'Dejar vacío para mantener la actual';
  
  document.getElementById('tituloFormDocente').innerHTML = 
    '<i class="fas fa-edit"></i> Editar Docente';
  document.getElementById('btnTextDocente').textContent = 'Actualizar Docente';
  document.getElementById('btnCancelarDocente').classList.remove('hidden');
  
  // Scroll al formulario
  document.getElementById('crudDocentes').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function eliminarDocente(id) {
  const docente = docentesCache.find(d => d.id === id);
  if (!docente) return;
  
  if (!confirm(`¿Estás seguro de eliminar al docente ${docente.nombre} ${docente.apellidoPaterno}?\n\nEsto eliminará también todas sus asignaciones y evaluaciones.`)) {
    return;
  }
  
  try {
    await apiCall(`/director/docentes/${id}`, 'DELETE', null, {
      directorId: usuarioActual.id
    });
    
    alert('Docente eliminado exitosamente');
    await cargarListaDocentes();
  } catch (error) {
    mostrarError(error.message);
  }
}

function cancelarEdicionDocente() {
  limpiarFormularioDocente();
}

function limpiarFormularioDocente() {
  document.getElementById('docenteIdEdit').value = '';
  document.getElementById('docenteNombre').value = '';
  document.getElementById('docenteApellidoP').value = '';
  document.getElementById('docenteApellidoM').value = '';
  document.getElementById('docenteCorreo').value = '';
  document.getElementById('docentePassword').value = '';
  document.getElementById('docentePassword').placeholder = 'Contraseña';
  
  document.getElementById('tituloFormDocente').innerHTML = 
    '<i class="fas fa-plus"></i> Agregar Docente';
  document.getElementById('btnTextDocente').textContent = 'Guardar Docente';
  document.getElementById('btnCancelarDocente').classList.add('hidden');
}

// ===========================================
// CRUD ESTUDIANTES (temporal)
// ===========================================

let estudiantesCache = [];

async function cargarListaEstudiantes() {
  // Por ahora solo inicializamos vacío
  estudiantesCache = [];
  const container = document.getElementById('listaEstudiantes');
  if (container) {
    container.innerHTML = '<p class="no-data">No hay estudiantes registrados</p>';
  }
}