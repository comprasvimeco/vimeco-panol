// Base propia del pañol (separada de VIMECO OC): usuarios, obras y pañoles.
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD1EF_1Irwb021-UYKdDUNLgusqzuHgexU",
  authDomain:        "vimeco-panol.firebaseapp.com",
  databaseURL:       "https://vimeco-panol-default-rtdb.firebaseio.com",
  projectId:         "vimeco-panol",
  storageBucket:     "vimeco-panol.firebasestorage.app",
  messagingSenderId: "415782994202",
  appId:             "1:415782994202:web:529672dfc2af07e9566ca3"
};

// Clave de Google Gemini (la misma de VIMECO OC) para leer el remito con IA (js/gemini.js).
// La pone el deploy (build.js) desde el Secret GEMINI_API_KEY del repo: acá queda el marcador.
const GEMINI_API_KEY = "%%GEMINI_API_KEY%%";
