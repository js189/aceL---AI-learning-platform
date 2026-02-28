# Google Sign-In Setup Checklist

If "Continue with Google" fails, check these in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

## 1. Authorized redirect URIs
Add this **exact** URI (no trailing slash):
```
http://localhost:3000/api/auth/callback/google
```

## 2. Authorized JavaScript origins
Add:
```
http://localhost:3000
```

## 3. OAuth consent screen
- If your app is in **Testing** mode: add your Google account email under "Test users"
- Only test users can sign in until you publish the app

## 4. Restart the dev server
After changing `.env.local`, restart: `npm run dev`
