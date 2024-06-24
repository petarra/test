const admin = require('firebase-admin');
const fbpath = require('./test-cfdfa-firebase-adminsdk-jeie3-7bbdea5786.json');
require('dotenv').config();

admin.initializeApp({
    credential: admin.credential.cert(fbpath),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
})

const bucket = admin.storage().bucket();

bucket.getFiles()
  .then(files => {
    console.log('Connected to Firebase Storage successfully');
  })
  .catch(error => {
    console.error('Error connecting to Firebase Storage:', error);
  });
module.exports = bucket;