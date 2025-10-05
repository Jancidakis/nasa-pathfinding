import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCe8dpHOeUJYnWaaLGHw7RCakDyu9tmmRk",
  authDomain: "nasa-844f8.firebaseapp.com",
  projectId: "nasa-844f8",
  storageBucket: "nasa-844f8.firebasestorage.app",
  messagingSenderId: "312017469883",
  appId: "1:312017469883:web:09b2c8650e050e345cc49e"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
