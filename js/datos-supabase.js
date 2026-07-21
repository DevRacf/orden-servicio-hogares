import { CONFIG } from './config.js';

let cliente = null;

function obtenerCliente() {
  if (!cliente) {
    cliente = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return cliente;
}

export async function iniciarSesion(clave) {
  const { error } = await obtenerCliente().auth.signInWithPassword({
    email: CONFIG.LOGIN_EMAIL,
    password: clave
  });
  if (error) return { ok: false, error: 'Clave incorrecta' };
  return { ok: true };
}

export async function haySesion() {
  const { data } = await obtenerCliente().auth.getSession();
  return Boolean(data.session);
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

export async function completarOrden(id, cierre) {
  const { data, error } = await obtenerCliente()
    .from('ordenes')
    .update({ ...cierre, estado: 'completada', completed_at: cierre.completed_at || new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
