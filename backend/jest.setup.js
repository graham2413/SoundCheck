jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
    const suppressed = [
        'DB error',
        'Reset password error',
        'Resend error',
        'Failed to fetch genre',
        'Error during login'
      ];
      
      if (typeof msg === 'string' && suppressed.some(s => msg.includes(s))) {
        return;
      }      
  
    // Optional: log unexpected errors
    console.warn('Unexpected console.error:', msg, ...args);
  });
  