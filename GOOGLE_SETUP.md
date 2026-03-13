# Google Sign-In Setup Checklist

If "Continue with Google" fails, check these in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

## 1. Authorized redirect URIs
Add this **exact** URI based on `NEXT_PUBLIC_BASE_URL` (no trailing slash):
```
${NEXT_PUBLIC_BASE_URL}/api/auth/callback/google
```

## 2. Authorized JavaScript origins
Add your base URL:
```
${NEXT_PUBLIC_BASE_URL}
```

## 3. OAuth consent screen
- If your app is in **Testing** mode: add your Google account email under "Test users"
- Only test users can sign in until you publish the app

## 4. Restart the dev server
After changing `.env.local`, restart: `npm run dev`
