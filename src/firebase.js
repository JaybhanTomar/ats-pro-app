// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCssmMVEPiIeC0erV1P_MNRYl7YFhtBVrw",
  authDomain: "ats-pro-app.firebaseapp.com",
  projectId: "ats-pro-app",
  storageBucket: "ats-pro-app.firebasestorage.app",
  messagingSenderId: "225745873328",
  appId: "1:225745873328:web:299e5308ac9cc48fa70e75",
  measurementId: "G-HVXJ7X6K0M"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

export default app;