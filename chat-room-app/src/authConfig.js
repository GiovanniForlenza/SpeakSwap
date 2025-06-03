console.log('CLIENT_ID:', process.env.REACT_APP_CLIENT_ID);
console.log('TENANT_ID:', process.env.REACT_APP_TENANT_ID);
console.log('All process.env:', Object.keys(process.env).filter(key => key.startsWith('REACT_APP')));

export const msalConfig = {
    auth: {
        clientId: process.env.REACT_APP_CLIENT_ID || 'MISSING_CLIENT_ID',
        authority: `https://login.microsoftonline.com/${process.env.REACT_APP_TENANT_ID}` || 'MISSING_TENANT_ID',
        redirectUri: window.location.origin
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false
    }
};