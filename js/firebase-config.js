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

/* ---- Seed de categorias padrão (roda 1x se Firestore vazio) ---- */
(async function seedCategories() {
  try {
    const snap = await fbDb.collection('categories').limit(1).get();
    if (!snap.empty) return;

    const defaults = [
      { name: 'Streetwear',  slug: 'streetwear'  },
      { name: 'Casual',      slug: 'casual'       },
      { name: 'Tênis',       slug: 'tenis'        },
      { name: 'Esportivo',   slug: 'esportivo'    },
      { name: 'Infantil',    slug: 'infantil'     },
      { name: 'Cueca',       slug: 'cueca'        },
      { name: 'Meia',        slug: 'meia'         },
      { name: 'Boné',        slug: 'bone'         },
      { name: 'Relógios',    slug: 'relogios'     },
      { name: 'Óculos',      slug: 'oculos'       }
    ];

    const batch = fbDb.batch();
    defaults.forEach(c => {
      const ref = fbDb.collection('categories').doc();
      batch.set(ref, { ...c, product_count: 0, created_at: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    console.log('Categorias padrão criadas no Firestore.');
  } catch (e) {
    /* Firestore não configurado ainda — normal antes de preencher o config */
  }
})();
