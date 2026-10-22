// Same Firebase project and the same two logins as Latin Practice.
// The web config is safe to publish: the Claude key never touches this app. It lives in the
// Cloud Function, which only answers these two accounts.
export const firebaseConfig = {
  apiKey: 'AIzaSyBe52hKFuyXZVKtc8CHuO-1mAjZ5HJLPuo',
  authDomain: 'burke-latin.firebaseapp.com',
  projectId: 'burke-latin',
  storageBucket: 'burke-latin.firebasestorage.app',
  messagingSenderId: '987041583677',
  appId: '1:987041583677:web:62403ee43c175e354ed054',
};
export const STUDENT_UID = 'mhP5pRPUlXg3nooLBIsjMyHvF6j2';
export const PARENT_UID = 'xFqJAFGGioUUadmrgbY7Fpbixwm2';
export const STUDENT_NAME = 'Burke';
export const MOM_EMAIL = 'ashley@ashleyfisher.com';
export const APP_VERSION = '1.0.0';
