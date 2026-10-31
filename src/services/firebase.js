// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCtiZcD2neeqwA4vLSRQlgJvgCWOHeJoio",
  authDomain: "cic-os-miniapps.firebaseapp.com",
  projectId: "cic-os-miniapps",
  storageBucket: "cic-os-miniapps.firebasestorage.app",
  messagingSenderId: "417923746374",
  appId: "1:417923746374:web:e38eb57255fff1358cd847",
  measurementId: "G-MTBKJCMM0R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
      console.log("[Firebase] Inicializado con éxito (Proyecto: cic-os-miniapps)");
    }
  }).catch((err) => {
    console.warn("[Firebase Analytics] No soportado en este entorno:", err.message);
  });
}

export { app, analytics, firebaseConfig };
export default app;
