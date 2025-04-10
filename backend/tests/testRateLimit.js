const axios = require("axios");
// basic class to see that raet limit works and all information returned in
// server busy scenarios
async function testRequests() {
  const baseurl = "http://localhost:5000/api/search?query=test";

  let promises = [];
  for (let i = 1; i <= 50; i++) {
    const url = `${baseurl}${i}`;

    promises.push(
      axios.get(url)
        .then((response) => {
          const data = response.data;
          const firstSongGenre = data.songs?.[0]?.genre 
            ? data.songs[0].genre 
            : "Unknown Genre";
          const firstAlbumGenre = data.albums?.[0]?.genre 
            ? data.albums[0].genre 
            : "Unknown Genre";
          const firstArtist = data.artists?.[0] 
            ? data.artists[0].name 
            : "No Artists";

          console.log(`✅ Request ${i}
            🎵 Song Genre: ${firstSongGenre} 
            💿 Album Genre: ${firstAlbumGenre} 
            🎤 Artist: ${firstArtist}`);
        })
        .catch(error => {
          console.log(`❌ Request ${i} (${url}) failed:`, error.response ? error.response.data : error.message);
        })
    );
  }

  await Promise.allSettled(promises);
  console.log("🎯 Test finished.");
}

testRequests();
