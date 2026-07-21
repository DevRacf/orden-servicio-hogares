// Lógica pura del modo sin internet: opera sobre datos planos, sin tocar
// localStorage ni red, para poder probarse en Node.

// Copia de la cola con el cierre agregado; si ya había un cierre encolado
// para la misma orden, lo reemplaza (el más reciente gana).
export function agregarACola(cola, ordenId, cierre, timestamp) {
  return [...(cola || []).filter(c => c.ordenId !== ordenId), { ordenId, cierre, timestamp }];
}

// Marca en la copia local las órdenes cuyo cierre está encolado: quedan
// completadas con bandera porEnviar para que la UI las muestre correctamente.
export function aplicarCierresPendientes(ordenes, cola) {
  if (!cola || cola.length === 0) return ordenes;
  const porId = new Map(cola.map(c => [c.ordenId, c]));
  return (ordenes || []).map(o => {
    const c = porId.get(o.id);
    if (!c) return o;
    return {
      ...o,
      ...c.cierre,
      estado: 'completada',
      completed_at: new Date(c.timestamp).toISOString(),
      porEnviar: true
    };
  });
}

export function quitarDeCola(cola, ordenId) {
  return (cola || []).filter(c => c.ordenId !== ordenId);
}
