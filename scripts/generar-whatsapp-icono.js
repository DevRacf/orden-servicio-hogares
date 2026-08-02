// Convierte recursos/whatsapp-icono.png en js/whatsapp-icono.js (data-URL + dimensiones).
// Correr desde la raíz del proyecto: node scripts/generar-whatsapp-icono.js
import { readFileSync, writeFileSync } from 'node:fs';

const png = readFileSync('recursos/whatsapp-icono.png');
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('recursos/whatsapp-icono.png no es un PNG');
const ancho = png.readUInt32BE(16);
const alto = png.readUInt32BE(20);

writeFileSync('js/whatsapp-icono.js', `// Generado por scripts/generar-whatsapp-icono.js — no editar a mano.
export const WHATSAPP_ICONO_DATAURL = 'data:image/png;base64,${png.toString('base64')}';
export const WHATSAPP_ICONO_ANCHO = ${ancho};
export const WHATSAPP_ICONO_ALTO = ${alto};
`);
console.log(`js/whatsapp-icono.js generado (${ancho}x${alto}, ${Math.round(png.length / 1024)} KB)`);
