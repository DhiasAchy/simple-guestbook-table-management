import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';

// GANTI DENGAN CONFIG DARI FIREBASE CONSOLE ANDA
const firebaseConfig = {
  apiKey: "AIzaSyAdndzcA6Qr1rTEB1DSK7v2_X6yJPo33M0",
  authDomain: "v1-project---guestbook-digital.firebaseapp.com",
  projectId: "v1-project---guestbook-digital",
  storageBucket: "v1-project---guestbook-digital.firebasestorage.app",
  messagingSenderId: "1076970841686",
  appId: "1:1076970841686:web:7643a76681e5255f57bdf7"
};

const app = initializeApp(firebaseConfig);

// Mengaktifkan Firestore dengan Offline Persistence (Cache Lokal + Auto Sync)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});