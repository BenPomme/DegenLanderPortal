// Firebase configuration for DegenLander Portal.
//
// This file is loaded directly by static HTML on GitHub Pages, so it CANNOT use
// `process.env`, that is a Node-only global and referencing it throws
// "ReferenceError: process is not defined" in the browser, which previously killed
// the leaderboard completely.
//
// A Firebase *web* API key is not a secret: it is designed to be shipped in client
// code. Access is controlled by Realtime Database security rules (see
// js/firebase-rules.json), not by hiding this value.
var firebaseConfig = {
  apiKey: "AIzaSyCol18DWGnK9NgxDK2h7YwTOGGegNSlJGM",
  authDomain: "degenlander.firebaseapp.com",
  projectId: "degenlander",
  storageBucket: "degenlander.firebasestorage.app",
  messagingSenderId: "520104814068",
  appId: "1:520104814068:web:2c364bc0d0dcc0a3fa05a1",
  measurementId: "G-NH7W5BZST2"
};

// Also exposed on window so module scripts can read it without a global lookup.
window.firebaseConfig = firebaseConfig;
