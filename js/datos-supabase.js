import { CONFIG } from './config.js';

let cliente = null;

function obtenerCliente() {
  if (!cliente) {
    cliente = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return cliente;
}

export async function iniciarSesion(clave) {
  const intentoOficina = await obtenerCliente().auth.signInWithPassword({
    email: CONFIG.LOGIN_EMAIL,
    password: clave
  });
  if (!intentoOficina.error) return { ok: true };

  const intentoTecnico = await obtenerCliente().auth.signInWithPassword({
    email: CONFIG.LOGIN_EMAIL_TECNICOS,
    password: clave
  });
  if (!intentoTecnico.error) return { ok: true };

  return { ok: false, error: 'Clave incorrecta' };
}

export async function haySesion() {
  const { data } = await obtenerCliente().auth.getSession();
  return Boolean(data.session);
}

export async function obtenerRol() {
  const { data: sesion } = await obtenerCliente().auth.getSession();
  const uid = sesion.session?.user?.id;
  if (!uid) return 'tecnico';
  const { data, error } = await obtenerCliente()
    .from('perfiles').select('rol').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error('Sin perfil para la cuenta activa; se asume rol de técnico por seguridad.');
    return 'tecnico';
  }
  return data.rol;
}

export async function cerrarSesion() {
  await obtenerCliente().auth.signOut();
}

export async function listarTecnicos() {
  const { data, error } = await obtenerCliente()
    .from('tecnicos').select('nombre').eq('activo', true).order('nombre');
  if (error) throw error;
  return data.map(t => t.nombre);
}

export async function listarOrdenes() {
  const { data, error } = await obtenerCliente()
    .from('ordenes').select('*');
  if (error) throw error;
  return data;
}

export async function obtenerOrden(id) {
  const { data, error } = await obtenerCliente()
    .from('ordenes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearOrden(datos) {
  const { data, error } = await obtenerCliente()
    .from('ordenes').insert(datos).select().single();
  if (error) throw error;
  return data;
}

// Solo oficina puede llamar esto (lo impone la política RLS "actualizar
// ordenes solo oficina"); el filtro por estado evita pisar una orden que ya
// se haya completado mientras se editaba.
export async function actualizarOrden(id, cambios) {
  const { data, error } = await obtenerCliente()
    .from('ordenes').update(cambios).eq('id', id).eq('estado', 'pendiente').select().single();
  if (error) throw error;
  return data;
}

// Solo oficina puede llamar esto (misma política RLS que actualizarOrden);
// el filtro por estado evita marcar un cobro en una orden que aún no cierra.
export async function actualizarEstatusCobro(id, estatusCobro) {
  const { data, error } = await obtenerCliente()
    .from('ordenes').update({ estatus_cobro: estatusCobro }).eq('id', id).eq('estado', 'completada').select().single();
  if (error) throw error;
  return data;
}

// Solo oficina puede borrar (política RLS "borrar ordenes completadas solo
// oficina"), y solo si ya está completada — la propia política de Postgres
// ya lo exige, el filtro aquí es nada más para dar un error claro si alguien
// intenta borrar una pendiente en vez de un "0 filas" silencioso.
export async function eliminarOrden(id) {
  const { data, error } = await obtenerCliente()
    .from('ordenes').delete().eq('id', id).eq('estado', 'completada').select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo borrar la orden');
}

export async function listarClientes() {
  const { data, error } = await obtenerCliente()
    .from('clientes')
    .select('id, nombre, telefono, direcciones_cliente(id, direccion)')
    .order('nombre');
  if (error) throw error;
  return data.map(({ direcciones_cliente, ...c }) => ({ ...c, direcciones: direcciones_cliente }));
}

// Vincula la orden recién creada con la base de clientes: si el nombre no
// existía, se da de alta; si la dirección es nueva para ese cliente, se
// agrega. Se llama después de guardar la orden — un fallo aquí no debe
// tumbar la creación de la orden, así que quien la llama lo maneja aparte.
export async function registrarClienteDesdeOrden({ cliente_nombre, cliente_telefono, cliente_direccion }) {
  const nombre = (cliente_nombre || '').trim();
  if (!nombre) return;
  const db = obtenerCliente();
  let clienteId;
  const { data: existente, error: errBuscar } = await db
    .from('clientes').select('id, telefono').ilike('nombre', nombre).maybeSingle();
  if (errBuscar) throw errBuscar;
  if (existente) {
    clienteId = existente.id;
    if (!existente.telefono && cliente_telefono) {
      const { error } = await db.from('clientes').update({ telefono: cliente_telefono }).eq('id', clienteId);
      if (error) throw error;
    }
  } else {
    const { data: nuevo, error: errCrear } = await db
      .from('clientes').insert({ nombre, telefono: cliente_telefono || null }).select('id').single();
    if (errCrear) throw errCrear;
    clienteId = nuevo.id;
  }
  const direccion = (cliente_direccion || '').trim();
  if (!direccion) return;
  const { data: direccionExistente, error: errDir } = await db
    .from('direcciones_cliente').select('id').eq('cliente_id', clienteId).ilike('direccion', direccion).maybeSingle();
  if (errDir) throw errDir;
  if (!direccionExistente) {
    const { error } = await db.from('direcciones_cliente').insert({ cliente_id: clienteId, direccion });
    if (error) throw error;
  }
}

export async function actualizarCliente(id, cambios) {
  const { data, error } = await obtenerCliente()
    .from('clientes').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function agregarDireccion(clienteId, direccion) {
  const { data, error } = await obtenerCliente()
    .from('direcciones_cliente').insert({ cliente_id: clienteId, direccion }).select().single();
  if (error) throw error;
  return data;
}

export async function actualizarDireccion(id, direccion) {
  const { data, error } = await obtenerCliente()
    .from('direcciones_cliente').update({ direccion }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function eliminarDireccion(id) {
  const { error } = await obtenerCliente().from('direcciones_cliente').delete().eq('id', id);
  if (error) throw error;
}

export async function completarOrden(id, cierre) {
  const { data, error } = await obtenerCliente().rpc('completar_orden', {
    p_id: id,
    p_trabajo_realizado: cierre.trabajo_realizado,
    p_materiales: cierre.materiales,
    p_materiales_cliente: cierre.materiales_cliente,
    p_firma_tecnico: cierre.firma_tecnico,
    p_firma_cliente: cierre.firma_cliente,
    p_completed_at: cierre.completed_at || new Date().toISOString()
  });
  if (error) throw error;
  return data;
}
