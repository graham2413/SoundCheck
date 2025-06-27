const fetchWithRetry = async (fetchFn, retries = 3, delay = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchFn();
    } catch (err) {
      if (err.code === 'ECONNRESET') {
        console.warn(`ECONNRESET, retry ${i + 1}/${retries}`);
        if (i < retries - 1) {
          await new Promise(res => setTimeout(res, delay * (i + 1)));
        }
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed after ${retries} retries`);
};

module.exports = { fetchWithRetry };