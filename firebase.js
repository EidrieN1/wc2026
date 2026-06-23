// ─────────────────────────────────────────────────────────────────────────────
// PASUL 1: Înlocuiește valorile de mai jos cu cele din consola Firebase
// https://console.firebase.google.com → Proiectul tău → Project Settings → Your apps
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app'
import { getDatabase }   from 'firebase/database'

const firebaseConfig = {
  apiKey:            "AIzaSyBe5Z4skGJytXBluJ3C9a4wncfkmooJ7Is",
  authDomain:        "pariorii-ape.firebaseapp.com",
  databaseURL:       "https://pariorii-ape-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "pariorii-ape",
  storageBucket:     "pariorii-ape.firebasestorage.app",
  messagingSenderId: "446266768713",
  appId:             "1:446266768713:web:3b6c3f1e17f893bc8d2e98",
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
