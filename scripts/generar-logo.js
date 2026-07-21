// Convierte recursos/logo-hi.png en js/logo.js (data-URL + dimensiones).
// Correr desde la raíz del proyecto: node scripts/generar-logo.js
import { readFileSync, writeFileSync } from 'node:fs';

const png = readFileSync('recursos/logo-hi.png');
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('recursos/logo-hi.png no es un PNG');
const ancho = png.readUInt32BE(16);
const alto = png.readUInt32BE(20);

writeFileSync('js/logo.js', `// Generado por scripts/generar-logo.js — no editar a mano.
export const LOGO_DATAURL = 'data:image/png;base64,${png.toString('base64')}';
export const LOGO_ANCHO = ${ancho};
export const LOGO_ALTO = ${alto};
`);
console.log(`js/logo.js generado (${ancho}x${alto}, ${Math.round(png.length / 1024)} KB)`);
