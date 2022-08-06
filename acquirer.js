//--------------------------------------------------------------------------------
// Scraping functions.
// Scraping for a locally hosted JSON tree of Magnus' losses,
//    like an endgame table for the last few steps of the search.
// Cuts down on fetch requests to chess.com API.
// For my internal use. Not completely automated nor obvious in how to use.
// Leaving this stuff in incase anyone notices an error in how I collected the data,
//    or in case its useful to anyone trying to achieve similar.


document.addEventListener("click", function(e) {
  if (e.target.id == "launchSearch") {
    // runSearch();
    // firstGenScrape("blitz");
    // blankScrape("rapid", 3);
    // localStorage.clear();
    scrapeLosses(el("uName").value, "rapid", "rapidDefeatersGen3");
  }
});

async function firstGenScrape(timeClass) {
  // to kick off the tree
  let magnus = { };
  let scraped = await scrapeLosses("MagnusCarlsen",  timeClass, magnus, "magnus");
  txtA.value = `"${timeClass}DefeatersGen1": ${JSON.stringify(scraped)}`;
}


async function blankScrape(timeClass, generation) {
  //build a blank stringified object from previous gen's data, ready to be filled
  let jsonObj = timeClass + "DefeatersGen" + (generation - 1);
  if (data[jsonObj] === undefined) {
    console.log("object not yet in data");
    return;
  }
  makeTextArea();
  let defs = [];
  let obj = data[jsonObj];
  if (generation == 2) {
    for (const u in obj) {
      if (u == "allDefeaters$") {
        defs = obj[u];
      }
    }
  } else {
    for (const u in obj) {
      if (!obj[u].allDefeaters$ || !obj[u].allDefeaters$.length) continue;
      for (const d of obj[u].allDefeaters$) {
        if (d != "MagnusCarlsen") defs.push(d);
      }
    }
  }
  console.log(generation, defs.length, defs);

  let blanks = {};
  for (let d of defs) {
    blanks[d] = {}; // should auto-eliminate duplicates
  }

  el("txtA").value = `"${timeClass}DefeatersGen${generation}": ${JSON.stringify(blanks)}`;

}


async function scrapeLosses(user,  timeClass, objName) {
  //objName: previously generated "blank" 2nd or 3rd gen obj in JSON
  makeTextArea();
  let doneSfx = new Audio("err.wav");
  console.clear();

  if (data[objName] === undefined) {
    console.log("object not yet in data");
    return;
  }

  if (!user) {  // go with "first" user if none supplied
    for (const u in data[objName]) {
      user = u;
      break;
    }
  }

  const stats = await fetch(`https://api.chess.com/pub/player/${user}`)
  .then(stats => stats.json());

  let joined = new Date(stats.joined * 1000),
      joinedYear = joined.getFullYear(),
      joinedMonth = ((joined.getMonth() + 1) + "").padStart(2, "0");

  let now = new Date(Date.now()),
      nowYear = now.getFullYear(),
      nowMonth = ((now.getMonth() + 1) + "").padStart(2, "0");

  let lookYear = joinedYear;
  let lookMonth = joinedMonth;
  let losses = {allDefeaters$:[]};

  do {
    const gamelist = await fetch(`https://api.chess.com/pub/player/${user}/games/${lookYear}/${lookMonth}`)
    .then(gamelist => gamelist.json());

    if (gamelist.games.length) {
      for (const game of gamelist.games) {
        if (game.time_class !==  timeClass) continue;
        let opponent = (game.black.username == user) ? "white" : "black";
        let userColour = (opponent == "white") ? "black" : "white";
          if (game[opponent].result == "win") {
            if (losses.allDefeaters$.includes(game[opponent].username)) continue;
            let loss = {
              url:game.url,
              date:new Date(game.end_time*1000).toLocaleDateString(),
              username: game[opponent].username,
              rating:game[opponent].rating,
              opponentRating:game[userColour].rating
            }
            losses[game[opponent].username] = loss;
            losses.allDefeaters$.push(game[opponent].username);
        }
      }
    }

    console.log(user, lookMonth, lookYear, losses);
    lookMonth++;
    lookMonth = (lookMonth + "").padStart(2, "0");
    if (lookMonth > 12) {
      lookYear++;
      lookMonth = "01";
    }
  } while ( lookYear < nowYear || lookMonth <= nowMonth )

  if(data[objName]) {
    if (localStorage[objName]) data[objName] = JSON.parse(localStorage[objName]);
    data[objName][user] = losses;
    localStorage[objName] = JSON.stringify(data[objName]);

    // list remaining users to be scraped
    let users = [];
    let totalScraped = 0;
    for (let u in data[objName]) {
      if(Object.keys(data[objName][u]).length === 0) {
        users.push(u);
      } else {
        totalScraped += Object.keys(data[objName][u]).length - 1;
      }
    }
    console.log(users);
    el("winChain").innerHTML = "Next Up: " + users[0] + "<p>Just Done: " + user + "<p>Total Scraped:" + totalScraped + "<p>From Class: " +  timeClass + ", " + users.length + " users remaining to scrape for this object";
    el("uName").value = users[0]
    el("txtA").value = `"${objName}":  ${localStorage[objName]}`;
  }

  console.log("done");
  doneSfx.play();
  return losses;
}


async function makeTextArea() {
  if (!document.getElementById("txtA")) {
    var txtA = document.createElement("textarea");
    txtA.setAttribute("id", "txtA");
    txtA.setAttribute("style", "height:100em; width:100%;");
    document.body.appendChild(txtA);
  }
}
