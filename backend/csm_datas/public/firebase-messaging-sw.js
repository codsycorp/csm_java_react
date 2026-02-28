importScripts('https://www.gstatic.com/firebasejs/8.4.2/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.4.2/firebase-messaging.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
var firebaseConfig = {
  apiKey: "AIzaSyA75e286aCYll8uljT7qXNAWgoVApkvXQg",
  authDomain: "realestatecodsy.firebaseapp.com",
  databaseURL: "https://realestatecodsy.firebaseio.com",
  projectId: "realestatecodsy",
  storageBucket: "realestatecodsy.appspot.com",
  messagingSenderId: "70710046348",
  appId: "1:70710046348:web:143bd4533fc50191ca15a9",
  measurementId: "G-G1JZ7BX5PQ"
};
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = 'Background Message Title';
  const notificationOptions = {
    body: 'Background Message body.',
    icon: '/firebase-logo.png'
  };

  return self.registration.showNotification(notificationTitle,
      notificationOptions);
});
