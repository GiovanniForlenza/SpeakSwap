export const msalConfig = {
    auth: {
        clientId: process.env.REACT_APP_CLIENT_ID || 'MISSING_CLIENT_ID',
        authority: `https://login.microsoftonline.com/organizations` || 'MISSING_TENANT_ID',
        redirectUri: window.location.origin
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false
    }
};