const backendUrl = 'https://soundcheck-backend-k7ec.onrender.com';

export const environment = {
    production: true,
    backendUrl: backendUrl,
    auth: `${backendUrl}/api/auth`,
    user: `${backendUrl}/api/users`,
    review: `${backendUrl}/api/reviews`,
    search: `${backendUrl}/api/search`,
    spotify: `${backendUrl}/api/spotify`
  };
