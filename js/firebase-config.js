/* ============================================================
   TEIXEIRA STYLE — Firebase Configuration
   -----------------------------------------------------------
   1. Crie um projeto em https://console.firebase.google.com
   2. Ative: Authentication (Email/Password), Firestore, Storage
   3. Crie o usuário admin em Authentication > Users
   4. Substitua os valores abaixo com suas credenciais
   ============================================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyA_t97V-U1y7p005CxiiAIykWN4njUO8PM",
  authDomain:        "teixeira-style.firebaseapp.com",
  projectId:         "teixeira-style",
  storageBucket:     "teixeira-style.firebasestorage.app",
  messagingSenderId: "83677282408",
  appId:             "1:83677282408:web:5ac2da7a3e09fdddc13bdd"
};

firebase.initializeApp(firebaseConfig);

/* ---- Instâncias globais ---- */
window.fbAuth    = firebase.auth();
window.fbDb      = firebase.firestore();
window.fbStorage = firebase.storage();
