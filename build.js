// Lo corre el deploy (.github/workflows/deploy.yml): pone la clave de Gemini en
// js/config.js desde el Secret GEMINI_API_KEY. En el repo queda el marcador.
const fs = require('fs');

const apiKey = process.env.GEMINI_API_KEY || '';
if (apiKey) {
  const config = fs.readFileSync('js/config.js', 'utf8');
  fs.writeFileSync('js/config.js', config.replace('%%GEMINI_API_KEY%%', apiKey));
  console.log('Clave de Gemini puesta.');
} else {
  console.warn('Falta el Secret GEMINI_API_KEY: la lectura del remito con IA no va a andar.');
}
