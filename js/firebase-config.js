// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCol18DWGnK9NgxDK2h7YwTOGGegNSlJGM",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "degenlander.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "degenlander",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "degenlander.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "520104814068",
  appId: process.env.FIREBASE_APP_ID || "1:520104814068:web:2c364bc0d0dcc0a3fa05a1",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-NH7W5BZST2"
};

// For Github Pages hosting, we need to include the fallback values
// In production, use environment variables through a backend service