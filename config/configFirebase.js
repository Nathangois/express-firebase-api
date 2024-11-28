// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB3yRcUD8VGA92UcVJUR8kFxcrct4x97Ok",
  authDomain: "todolist-30df2.firebaseapp.com",
  projectId: "todolist-30df2",
  storageBucket: "todolist-30df2.firebasestorage.app",
  messagingSenderId: "40562822029",
  appId: "1:40562822029:web:e42454f807839b60a00bc4",
  measurementId: "G-C9YRTBHLYV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
module.exports = db;