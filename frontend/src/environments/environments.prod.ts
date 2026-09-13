const backendUrl = 'https://soundcheck-backend-k7ec.onrender.com';

export const environment = {
    production: true,
    backendUrl: backendUrl,
    auth: `${backendUrl}/api/auth`,
    user: `${backendUrl}/api/users`,
    review: `${backendUrl}/api/reviews`,
    search: `${backendUrl}/api/search`,
    spotify: `${backendUrl}/api/spotify`,
    cinema: `${backendUrl}/api/cinema`,
    vapidPublicKey: 'BK9_ebMaZEzSGx6RTfY0OmNsCXn7JYzFT_UF_gEp9cNsPcBORhDvXcBdnVR8G3oau7KUzRfy9vj_x8bgGM6-udM'
  };
