// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDZaU-AnRxHIjA5WgXBFXQG4P4VwOLj8Bs",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "degenlander-3b1c7.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "degenlander-3b1c7",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "degenlander-3b1c7.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "431855620245",
  appId: process.env.FIREBASE_APP_ID || "1:431855620245:web:80b5c8da3b688972cc5ce1"
};

// For Github Pages hosting, we need to include the fallback values
// In production, use environment variables through a backend service