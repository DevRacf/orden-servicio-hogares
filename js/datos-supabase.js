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

export async function completarOrden(id, cierre) {
  const { data, error } = await obtenerCliente().rpc('completar_orden', {
    p_id: id,
    p_trabajo_realizado: cierre.trabajo_realizado,
    p_materiales: cierre.materiales,
    p_firma_tecnico: cierre.firma_tecnico,
    p_firma_cliente: cierre.firma_cliente,
    p_completed_at: cierre.completed_at || new Date().toISOString()
  });
  if (error) throw error;
  return data;
}
