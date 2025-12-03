// app.js - MADUREX Sistema de Monitoreo de Fresas
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// =========================
// CONFIGURACIÓN SUPABASE
// =========================
const SUPABASE_URL = "https://turxtauogrqniwinzykg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1cnh0YXVvZ3Jxbml3aW56eWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzOTc4MjMsImV4cCI6MjA3ODk3MzgyM30.AG9z89iDHn5KaGjwVvQOIbMwAozKV_PkhP7ALwxhH2M";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// UTILIDADES GENERALES
// =========================

function setActiveView(view) {
  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("active", v.id === `view-${view}`);
  });
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("es-PE", { 
    year: "numeric", 
    month: "2-digit", 
    day: "2-digit", 
    hour: "2-digit", 
    minute: "2-digit",
    timeZone: "America/Lima"
  });
}

function formatDateOnly(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("es-PE", {
    timeZone: "America/Lima"
  });
}

function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}%`;
}

function getStatusFromPercent(pct) {
  if (pct === null || pct === undefined) return "nodata";
  if (pct >= 60) return "ready";
  if (pct >= 30) return "partial";
  return "unripe";
}

function showMessage(elementId, message, type = 'success') {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.className = `form-msg ${type}`;
  setTimeout(() => {
    element.textContent = '';
    element.className = 'form-msg';
  }, 5000);
}

// =========================
// NAVEGACIÓN
// =========================

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.view;
    setActiveView(target);

    if (target === "dashboard") {
      loadDashboard();
    } else if (target === "plants") {
      loadPlantas();
    } else if (target === "detections") {
      loadDetecciones();
    } else if (target === "map") {
      loadMapa();
    }
  });
});

// =========================
// TEMA OSCURO/CLARO
// =========================

const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.querySelector('.theme-icon');

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('madurex-theme', isDark ? 'dark' : 'light');
  themeIcon.textContent = isDark ? '☀️' : '🌙';
  themeToggle.title = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}

themeToggle.addEventListener('click', toggleTheme);

// Cargar tema guardado
const savedTheme = localStorage.getItem('madurex-theme');
if (savedTheme === 'dark') {
  document.body.classList.add('dark-mode');
  themeIcon.textContent = '☀️';
  themeToggle.title = 'Cambiar a modo claro';
}

// =========================
// DASHBOARD
// =========================

async function loadDashboard() {
  try {
    const filtroCampo = document.getElementById('dash-filtro-campo').value;
    
    // Total plantas
    let plantasQuery = supabase.from("plantas").select("*", { count: "exact", head: true });
    if (filtroCampo) {
      plantasQuery = plantasQuery.eq('campo', parseInt(filtroCampo));
    }
    const { count: totalPlantas } = await plantasQuery;

    // Detecciones de hoy
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let detHoyQuery = supabase.from("detecciones")
      .select("*, plantas!inner(campo)", { count: "exact", head: true })
      .gte("fecha", startToday.toISOString());
    
    if (filtroCampo) {
      detHoyQuery = detHoyQuery.eq('plantas.campo', parseInt(filtroCampo));
    }
    const { count: detHoy } = await detHoyQuery;

    // Promedio porcentajes y plantas listas para cosecha
    let detAllQuery = supabase.from("detecciones")
      .select("porcentaje_maduras, plantas!inner(campo)");
    
    if (filtroCampo) {
      detAllQuery = detAllQuery.eq('plantas.campo', parseInt(filtroCampo));
    }
    
    const { data: detAll } = await detAllQuery;

    let avg = 0;
    let listasParaCosecha = 0;
    if (detAll && detAll.length > 0) {
      const sum = detAll.reduce((acc, d) => acc + (d.porcentaje_maduras || 0), 0);
      avg = sum / detAll.length;
      listasParaCosecha = detAll.filter(d => (d.porcentaje_maduras || 0) >= 60).length;
    }

    document.getElementById("kpi-total-plantas").textContent = totalPlantas ?? 0;
    document.getElementById("kpi-detecciones-hoy").textContent = detHoy ?? 0;
    document.getElementById("kpi-prom-maduras").textContent = formatPercent(avg);
    document.getElementById("kpi-listas-cosecha").textContent = listasParaCosecha;

    // Cargar resumen por campo
    await loadResumenCampos(filtroCampo);

    // Cargar gráficos
    await loadChartDetecciones(filtroCampo);
    await loadChartMadurez(filtroCampo);

    // Últimas detecciones
    let detQuery = supabase.from("detecciones")
      .select(`
        id, fecha, maduras, intermedias, inmaduras, porcentaje_maduras,
        recomendacion_cosecha, imagen_url, planta_id,
        plantas(codigo_qr, campo, fila, posicion)
      `)
      .order("fecha", { ascending: false })
      .limit(15);

    if (filtroCampo) {
      detQuery = detQuery.eq('plantas.campo', parseInt(filtroCampo));
    }

    const { data: detecciones } = await detQuery;

    const tbody = document.getElementById("dashboard-last-detections");
    tbody.innerHTML = "";

    if (!detecciones || detecciones.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No hay detecciones registradas</td></tr>';
      return;
    }

    detecciones.forEach(d => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(d.fecha)}</td>
        <td><strong>${d.plantas?.codigo_qr || `ID ${d.planta_id}`}</strong></td>
        <td>Campo ${d.plantas?.campo || '-'}</td>
        <td>${d.maduras}</td>
        <td>${d.intermedias}</td>
        <td>${d.inmaduras}</td>
        <td><strong>${formatPercent(d.porcentaje_maduras)}</strong></td>
        <td>${d.recomendacion_cosecha || '-'}</td>
        <td>${d.imagen_url ? `<a href="${d.imagen_url}" target="_blank" class="link-img">Ver imagen</a>` : '-'}</td>
      `;
      tbody.appendChild(tr);
    });

    // Llenar filtro campos
    await llenarFiltroCampos('dash-filtro-campo');

  } catch (e) {
    console.error("Error en loadDashboard:", e);
  }
}

async function loadResumenCampos(filtroCampo) {
  try {
    let query = supabase.from("plantas").select("campo");
    if (filtroCampo) {
      query = query.eq('campo', parseInt(filtroCampo));
    }
    const { data: plantas } = await query;

    const campos = [...new Set(plantas.map(p => p.campo))];
    const container = document.getElementById('resumen-campos');
    container.innerHTML = '';

    for (const campo of campos.sort((a, b) => a - b)) {
      const { count: totalPlantas } = await supabase
        .from("plantas")
        .select("*", { count: "exact", head: true })
        .eq('campo', campo);

      const { data: detecciones } = await supabase
        .from("detecciones")
        .select("porcentaje_maduras, plantas!inner(campo)")
        .eq('plantas.campo', campo);

      let promMadurez = 0;
      let listasParaCosecha = 0;
      if (detecciones && detecciones.length > 0) {
        promMadurez = detecciones.reduce((acc, d) => acc + (d.porcentaje_maduras || 0), 0) / detecciones.length;
        listasParaCosecha = detecciones.filter(d => (d.porcentaje_maduras || 0) >= 60).length;
      }

      const card = document.createElement('div');
      card.className = 'campo-resumen-card';
      card.innerHTML = `
        <h3>🌱 Campo ${campo}</h3>
        <div class="campo-stats">
          <div class="campo-stat">
            <span class="campo-stat-label">Total Plantas</span>
            <span class="campo-stat-value">${totalPlantas}</span>
          </div>
          <div class="campo-stat">
            <span class="campo-stat-label">Detecciones (Total)</span>
            <span class="campo-stat-value">${detecciones?.length || 0}</span>
          </div>
          <div class="campo-stat">
            <span class="campo-stat-label">% Madurez Prom.</span>
            <span class="campo-stat-value">${formatPercent(promMadurez)}</span>
          </div>
          <div class="campo-stat">
            <span class="campo-stat-label">Listas Cosecha</span>
            <span class="campo-stat-value">${listasParaCosecha}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    }
  } catch (e) {
    console.error("Error en loadResumenCampos:", e);
  }
}

async function loadChartDetecciones(filtroCampo) {
  try {
    let query = supabase.from("detecciones")
      .select("fecha, plantas!inner(campo)")
      .order("fecha", { ascending: true });

    if (filtroCampo) {
      query = query.eq('plantas.campo', parseInt(filtroCampo));
    }

    const { data: detecciones } = await query;

    // Agrupar por fecha
    const porFecha = {};
    detecciones.forEach(d => {
      const fecha = formatDateOnly(d.fecha);
      porFecha[fecha] = (porFecha[fecha] || 0) + 1;
    });

    const container = document.getElementById('chart-detecciones');
    container.innerHTML = '';

    const fechas = Object.keys(porFecha).slice(-7); // Últimos 7 días
    const maxCount = Math.max(...Object.values(porFecha));

    if (fechas.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem">No hay detecciones en los últimos 7 días</p>';
      return;
    }

    // Agregar descripción
    const desc = document.createElement('p');
    desc.style.cssText = 'text-align:center;color:var(--muted);font-size:0.85rem;margin-bottom:1rem';
    desc.textContent = `Mostrando las detecciones de los últimos ${fechas.length} días`;
    container.appendChild(desc);

    fechas.forEach(fecha => {
      const count = porFecha[fecha];
      const percentage = (count / maxCount) * 100;

      const barDiv = document.createElement('div');
      barDiv.className = 'chart-bar';
      barDiv.innerHTML = `
        <div class="chart-bar-header">
          <span class="chart-bar-label">${fecha}</span>
          <span class="chart-bar-value">${count} detecciones</span>
        </div>
        <div class="chart-bar-fill">
          <div class="chart-bar-progress" style="width: ${percentage}%">
            ${count}
          </div>
        </div>
      `;
      container.appendChild(barDiv);
    });

  } catch (e) {
    console.error("Error en loadChartDetecciones:", e);
  }
}

async function loadChartMadurez(filtroCampo) {
  try {
    let query = supabase.from("detecciones")
      .select("maduras, intermedias, inmaduras, plantas!inner(campo)");

    if (filtroCampo) {
      query = query.eq('plantas.campo', parseInt(filtroCampo));
    }

    const { data: detecciones } = await query;

    let totalMaduras = 0;
    let totalIntermedias = 0;
    let totalInmaduras = 0;

    detecciones.forEach(d => {
      totalMaduras += d.maduras || 0;
      totalIntermedias += d.intermedias || 0;
      totalInmaduras += d.inmaduras || 0;
    });

    const total = totalMaduras + totalIntermedias + totalInmaduras;

    const container = document.getElementById('chart-madurez');
    container.innerHTML = '';

    if (total === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem">No hay datos para mostrar</p>';
      return;
    }

    const madurasPct = (totalMaduras / total) * 100;
    const intermediasPct = (totalIntermedias / total) * 100;
    const inmadurasPct = (totalInmaduras / total) * 100;

    // Agregar descripción
    const desc = document.createElement('p');
    desc.style.cssText = 'text-align:center;color:var(--muted);font-size:0.85rem;margin-bottom:1rem';
    desc.textContent = `Total de ${total} fresas detectadas en todas las detecciones realizadas`;
    container.appendChild(desc);

    const chartsDiv = document.createElement('div');
    chartsDiv.innerHTML = `
      <div class="chart-bar">
        <div class="chart-bar-header">
          <span class="chart-bar-label">🍓 Maduras</span>
          <span class="chart-bar-value">${totalMaduras} (${madurasPct.toFixed(1)}%)</span>
        </div>
        <div class="chart-bar-fill">
          <div class="chart-bar-progress" style="width: ${madurasPct}%; background: linear-gradient(90deg, #15803d, #16a34a)">${totalMaduras}</div>
        </div>
      </div>

      <div class="chart-bar">
        <div class="chart-bar-header">
          <span class="chart-bar-label">🟡 Intermedias</span>
          <span class="chart-bar-value">${totalIntermedias} (${intermediasPct.toFixed(1)}%)</span>
        </div>
        <div class="chart-bar-fill">
          <div class="chart-bar-progress" style="width: ${intermediasPct}%; background: linear-gradient(90deg, #c2410c, #f59e0b)">${totalIntermedias}</div>
        </div>
      </div>

      <div class="chart-bar">
        <div class="chart-bar-header">
          <span class="chart-bar-label">🔵 Inmaduras</span>
          <span class="chart-bar-value">${totalInmaduras} (${inmadurasPct.toFixed(1)}%)</span>
        </div>
        <div class="chart-bar-fill">
          <div class="chart-bar-progress" style="width: ${inmadurasPct}%; background: linear-gradient(90deg, #1e40af, #3b82f6)">${totalInmaduras}</div>
        </div>
      </div>
    `;
    container.appendChild(chartsDiv);

  } catch (e) {
    console.error("Error en loadChartMadurez:", e);
  }
}

// Event listener para filtro de dashboard
document.getElementById('dash-filtro-campo').addEventListener('change', loadDashboard);

// =========================
// PLANTAS
// =========================

let cachedPlantas = [];
let editingPlantaId = null;

async function loadPlantas() {
  try {
    const { data, error } = await supabase
      .from("plantas")
      .select("*")
      .order("campo", { ascending: true })
      .order("fila", { ascending: true })
      .order("posicion", { ascending: true });

    if (error) throw error;

    cachedPlantas = data || [];
    await llenarFiltroCampos('filtro-campo-plantas');
    renderTablaPlantas();
  } catch (e) {
    console.error("Error en loadPlantas:", e);
  }
}

function renderTablaPlantas() {
  const tbody = document.getElementById("tabla-plantas");
  const filtroCampo = document.getElementById("filtro-campo-plantas").value;
  const busqueda = document.getElementById("buscar-planta").value.toLowerCase();
  
  let plantasFiltradas = cachedPlantas;
  
  if (filtroCampo) {
    plantasFiltradas = plantasFiltradas.filter(p => p.campo === parseInt(filtroCampo));
  }
  
  if (busqueda) {
    plantasFiltradas = plantasFiltradas.filter(p => 
      p.codigo_qr.toLowerCase().includes(busqueda) ||
      (p.variedad && p.variedad.toLowerCase().includes(busqueda))
    );
  }

  tbody.innerHTML = "";
  document.getElementById('contador-plantas').textContent = `${plantasFiltradas.length} plantas`;

  if (plantasFiltradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay plantas que coincidan con los filtros</td></tr>';
    return;
  }

  plantasFiltradas.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.codigo_qr}</strong></td>
      <td>Campo ${p.campo}</td>
      <td>Fila ${p.fila}</td>
      <td>Pos. ${p.posicion}</td>
      <td>${p.variedad || '-'}</td>
      <td>${p.descripcion || '-'}</td>
      <td><span class="badge ready">Activa</span></td>
      <td>
        <button class="btn small" onclick="descargarQR('${p.codigo_qr}')">📥 QR</button>
        <button class="btn small" onclick="editarPlanta(${p.id})">✏️</button>
        <button class="btn small danger" onclick="eliminarPlanta(${p.id}, '${p.codigo_qr}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Filtros
document.getElementById("filtro-campo-plantas").addEventListener("change", renderTablaPlantas);
document.getElementById("buscar-planta").addEventListener("input", renderTablaPlantas);

// Modal
const modal = document.getElementById('modal-planta');
const btnNuevaPlanta = document.getElementById('btn-nueva-planta');
const btnCerrarModal = document.getElementById('modal-close');
const btnCancelar = document.getElementById('btn-cancelar');
const formPlanta = document.getElementById('form-planta');

btnNuevaPlanta.addEventListener('click', () => {
  editingPlantaId = null;
  document.getElementById('modal-titulo').textContent = 'Agregar Nueva Planta';
  document.getElementById('btn-guardar-planta').textContent = 'Guardar Planta';
  formPlanta.reset();
  modal.classList.add('active');
});

btnCerrarModal.addEventListener('click', () => modal.classList.remove('active'));
btnCancelar.addEventListener('click', () => modal.classList.remove('active'));

modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.remove('active');
});

formPlanta.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const campo = parseInt(document.getElementById("campo-input").value);
  const fila = parseInt(document.getElementById("fila-input").value);
  const posicion = parseInt(document.getElementById("posicion-input").value);
  const variedad = document.getElementById("variedad-input").value.trim();
  const descripcion = document.getElementById("descripcion-input").value.trim();

  try {
    if (editingPlantaId) {
      // Editar
      const { error } = await supabase
        .from("plantas")
        .update({ campo, fila, posicion, variedad, descripcion })
        .eq('id', editingPlantaId);

      if (error) throw error;
      showMessage('msg-form-planta', 'Planta actualizada exitosamente', 'success');
    } else {
      // Crear nueva
      const { count } = await supabase
        .from("plantas")
        .select("*", { count: "exact", head: true });

      const nextNumber = (count || 0) + 1;
      const codigo_qr = `PLT-${String(nextNumber).padStart(6, "0")}`;

      const { error } = await supabase
        .from("plantas")
        .insert({ campo, fila, posicion, variedad, descripcion, codigo_qr });

      if (error) throw error;
      showMessage('msg-form-planta', `Planta creada: ${codigo_qr}`, 'success');
    }

    setTimeout(() => {
      modal.classList.remove('active');
      loadPlantas();
    }, 1500);

  } catch (err) {
    console.error("Error guardando planta:", err);
    showMessage('msg-form-planta', 'Error al guardar la planta', 'error');
  }
});

window.editarPlanta = async function(id) {
  const planta = cachedPlantas.find(p => p.id === id);
  if (!planta) return;

  editingPlantaId = id;
  document.getElementById('modal-titulo').textContent = 'Editar Planta';
  document.getElementById('btn-guardar-planta').textContent = 'Actualizar Planta';
  document.getElementById("campo-input").value = planta.campo;
  document.getElementById("fila-input").value = planta.fila;
  document.getElementById("posicion-input").value = planta.posicion;
  document.getElementById("variedad-input").value = planta.variedad || '';
  document.getElementById("descripcion-input").value = planta.descripcion || '';
  
  modal.classList.add('active');
};

window.eliminarPlanta = async function(id, codigo) {
  if (!confirm(`¿Estás seguro de eliminar la planta ${codigo}?`)) return;

  try {
    const { error } = await supabase
      .from("plantas")
      .delete()
      .eq('id', id);

    if (error) throw error;
    alert('Planta eliminada exitosamente');
    loadPlantas();
  } catch (err) {
    console.error("Error eliminando planta:", err);
    alert('Error al eliminar la planta');
  }
};

// =========================
// QR: DESCARGA
// =========================

window.descargarQR = async function(codigo) {
  try {
    // Método 1: Intentar con la librería QRCode si está disponible
    if (typeof QRCode !== 'undefined') {
      const canvas = document.getElementById("qr-canvas");
      if (!canvas) {
        throw new Error('Canvas QR no encontrado');
      }

      await new Promise((resolve, reject) => {
        QRCode.toCanvas(canvas, codigo, { 
          width: 512, 
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          },
          errorCorrectionLevel: 'H'
        }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `QR_${codigo}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`✅ QR descargado exitosamente: ${codigo}`);
      return;
    }
    
    // Método 2: Usar API externa como fallback
    console.log('Usando API externa para generar QR...');
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(codigo)}&color=000000&bgcolor=ffffff`;
    
    // Descargar la imagen
    const response = await fetch(qrUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `QR_${codigo}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.URL.revokeObjectURL(url);
    console.log(`✅ QR descargado exitosamente (API externa): ${codigo}`);
    
  } catch (e) {
    console.error("❌ Error al generar/descargar QR:", e);
    alert(`Error al generar el código QR: ${e.message || 'Error desconocido'}.\n\nPor favor, inténtalo de nuevo.`);
  }
};

// =========================
// DETECCIONES
// =========================

let cachedDetecciones = [];

async function loadDetecciones() {
  try {
    const { data, error } = await supabase
      .from("detecciones")
      .select(`
        id, fecha, maduras, intermedias, inmaduras, total, porcentaje_maduras,
        recomendacion_cosecha, imagen_url, planta_id,
        plantas(codigo_qr, campo, fila, posicion)
      `)
      .order("fecha", { ascending: false });

    if (error) throw error;

    cachedDetecciones = data || [];
    await llenarFiltroCampos('filtro-campo-detecciones');
    renderTablaDetecciones();
  } catch (e) {
    console.error("Error en loadDetecciones:", e);
  }
}

function renderTablaDetecciones() {
  const tbody = document.getElementById("tabla-detecciones");
  const filtroCampo = document.getElementById("filtro-campo-detecciones").value;
  const filtroPlanta = document.getElementById("filtro-planta-detecciones").value.trim().toUpperCase();
  const fechaDesde = document.getElementById("filtro-fecha-desde").value;
  const fechaHasta = document.getElementById("filtro-fecha-hasta").value;
  
  let data = cachedDetecciones;

  if (filtroCampo) {
    data = data.filter(d => d.plantas && d.plantas.campo === parseInt(filtroCampo));
  }

  if (filtroPlanta) {
    data = data.filter(d => {
      const codigo = d.plantas?.codigo_qr || "";
      return codigo.toUpperCase().includes(filtroPlanta);
    });
  }

  if (fechaDesde) {
    const desde = new Date(fechaDesde);
    data = data.filter(d => new Date(d.fecha) >= desde);
  }

  if (fechaHasta) {
    const hasta = new Date(fechaHasta);
    hasta.setHours(23, 59, 59);
    data = data.filter(d => new Date(d.fecha) <= hasta);
  }

  tbody.innerHTML = "";
  document.getElementById('contador-detecciones').textContent = `${data.length} detecciones`;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No hay detecciones que coincidan con los filtros</td></tr>';
    return;
  }

  data.forEach(d => {
    const planta = d.plantas || {};
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(d.fecha)}</td>
      <td><strong>${planta.codigo_qr || `ID ${d.planta_id}`}</strong></td>
      <td>Campo ${planta.campo || '-'}</td>
      <td>Fila ${planta.fila || '-'}</td>
      <td>Pos. ${planta.posicion || '-'}</td>
      <td><strong style="color: var(--accent)">${d.maduras}</strong></td>
      <td><strong style="color: var(--warning)">${d.intermedias}</strong></td>
      <td><strong style="color: var(--info)">${d.inmaduras}</strong></td>
      <td><strong>${formatPercent(d.porcentaje_maduras)}</strong></td>
      <td>${d.recomendacion_cosecha || '-'}</td>
      <td>${d.imagen_url ? `<a href="${d.imagen_url}" target="_blank" class="link-img">Ver imagen</a>` : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Filtros
document.getElementById("filtro-campo-detecciones").addEventListener("change", renderTablaDetecciones);
document.getElementById("filtro-planta-detecciones").addEventListener("input", renderTablaDetecciones);
document.getElementById("filtro-fecha-desde").addEventListener("change", renderTablaDetecciones);
document.getElementById("filtro-fecha-hasta").addEventListener("change", renderTablaDetecciones);

document.getElementById("btn-limpiar-filtros").addEventListener("click", () => {
  document.getElementById("filtro-campo-detecciones").value = "";
  document.getElementById("filtro-planta-detecciones").value = "";
  document.getElementById("filtro-fecha-desde").value = "";
  document.getElementById("filtro-fecha-hasta").value = "";
  renderTablaDetecciones();
});

// =========================
// MAPA DEL INVERNADERO
// =========================

async function loadMapa() {
  try {
    const { data: plantas, error: errPlantas } = await supabase
      .from("plantas")
      .select("*");
    if (errPlantas) throw errPlantas;

    const { data: dets, error: errD } = await supabase
      .from("detecciones")
      .select("planta_id, porcentaje_maduras, fecha")
      .order("fecha", { ascending: false });
    if (errD) throw errD;

    // Última detección por planta
    const lastDetByPlanta = {};
    if (dets) {
      for (const d of dets) {
        if (!lastDetByPlanta[d.planta_id]) {
          lastDetByPlanta[d.planta_id] = d;
        }
      }
    }

    const container = document.getElementById("mapa-campos");
    container.innerHTML = "";

    if (!plantas || plantas.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--muted)">No hay plantas registradas para construir el mapa</p>';
      return;
    }

    // Llenar filtro
    await llenarFiltroCampos('filtro-campo-mapa');

    const filtroCampo = document.getElementById("filtro-campo-mapa").value;
    let plantasFiltradas = plantas;
    if (filtroCampo) {
      plantasFiltradas = plantasFiltradas.filter(p => p.campo === parseInt(filtroCampo));
    }

    const porCampo = {};
    for (const p of plantasFiltradas) {
      if (!porCampo[p.campo]) porCampo[p.campo] = [];
      porCampo[p.campo].push(p);
    }

    for (const [campo, lista] of Object.entries(porCampo)) {
      const campoBlock = document.createElement("div");
      campoBlock.className = "campo-block";

      const header = document.createElement("div");
      header.className = "campo-header";
      header.innerHTML = `
        <div class="campo-title">🌱 Campo ${campo}</div>
        <div class="campo-title" style="font-weight: 400; font-size: 0.95rem;">${lista.length} plantas</div>
      `;

      const grid = document.createElement("div");
      grid.className = "campo-grid";

      const maxFila = Math.max(...lista.map(p => p.fila));
      const maxPos = Math.max(...lista.map(p => p.posicion));

      grid.style.gridTemplateColumns = `repeat(${maxPos}, minmax(90px, 1fr))`;

      for (let f = 1; f <= maxFila; f++) {
        for (let pos = 1; pos <= maxPos; pos++) {
          const planta = lista.find(p => p.fila === f && p.posicion === pos);
          const celda = document.createElement("div");
          celda.className = "celda-planta";

          if (planta) {
            const det = lastDetByPlanta[planta.id];
            const pct = det ? (det.porcentaje_maduras || 0) : null;
            const status = getStatusFromPercent(pct);
            celda.classList.add(status);
            celda.title = `${planta.codigo_qr} - F${planta.fila} P${planta.posicion}${pct !== null ? ' - ' + formatPercent(pct) : ' - Sin datos'}`;

            celda.innerHTML = `
              <span class="codigo">${planta.codigo_qr}</span>
              <span>F${planta.fila} P${planta.posicion}</span>
              <span><strong>${pct !== null ? formatPercent(pct) : 'Sin datos'}</strong></span>
            `;
          } else {
            celda.classList.add("nodata");
            celda.style.opacity = "0.3";
          }

          grid.appendChild(celda);
        }
      }

      campoBlock.appendChild(header);
      campoBlock.appendChild(grid);
      container.appendChild(campoBlock);
    }
  } catch (e) {
    console.error("Error en loadMapa:", e);
  }
}

document.getElementById("filtro-campo-mapa").addEventListener("change", loadMapa);

// =========================
// UTILIDADES
// =========================

async function llenarFiltroCampos(selectId) {
  const select = document.getElementById(selectId);
  const oldValue = select.value;
  
  const { data: plantas } = await supabase.from("plantas").select("campo");
  const campos = [...new Set(plantas.map(p => p.campo))].sort((a, b) => a - b);
  
  select.innerHTML = '<option value="">Todos</option>';
  campos.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = `Campo ${c}`;
    select.appendChild(opt);
  });
  
  if (oldValue) select.value = oldValue;
}

// =========================
// INICIALIZACIÓN
// =========================

(async function init() {
  setActiveView("dashboard");
  await loadDashboard();
})();
