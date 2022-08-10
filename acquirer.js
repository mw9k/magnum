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
    // localStorage.clear();
    scrapeGen("blitz", 2);
  }
});


async function scrapeGen(timeClass, generation) {
  makeTextArea();
  if (generation == 1) {
    firstGenScrape(timeClass);
    return;
  }

  let alreadySeen = []; // prevent repeating users in later generations
  for (let i = generation - 1; i > 0; i--) {
    let users = data[`${timeClass}DefeatersGen${i}`];
    for (let u in users) {
      alreadySeen.push(u);
    }
  }

  const objName = `${timeClass}DefeatersGen${generation}`;
  if (!localStorage.data) localStorage.data = JSON.stringify({})
  let localdata = JSON.parse(localStorage.data);

  if (!localdata[objName]) {
    let scraped = await blankScrape(timeClass, generation);
    if (!Object.keys(scraped)) {
      console.log("Error. Couldn't start next generation");
    }
    localdata[objName] = scraped;
  }

  if (!localdata[objName]) {
    console.log("Error. Couldn't generate object. Try clearing localStorage, then retrying.");
  } else {  // if blank obj already present, look to fill in one user at a time
            // based on the textbox input.

    if (!el("uName").value) {
      let toScrape = findNextToScrape(localdata[objName]);
      el("uName").value = toScrape.unscraped[0];
    } else {
      if (localdata[objName][el("uName").value]) {
        let losses = await scrapeLosses(el("uName").value, timeClass, alreadySeen);
        if (!losses.beatBy$.length) console.log("NO LOSSES; FIXME");
        localdata[objName][el("uName").value] = losses;
        localStorage.data = JSON.stringify(localdata);
        el("txtA").value = `"${objName}": ${JSON.stringify(localdata[objName])}`;

        let toScrape = findNextToScrape(localdata[objName]);
        el("uName").value = toScrape.unscraped[0];
        console.log(`${toScrape.unscraped.length} remaining to scrape (of ${toScrape.totalUsers} users).`);
        console.log(toScrape.totalScraped + " losses found in total.");
      } else {
        el("txtA").value = "Username not found in data. Try clearing the textbox to get the next empty user.";
      }

    }
  }
}


function findNextToScrape(obj) {
  let unscraped = [], totalScraped = 0, totalUsers = 0;
  for (let u in obj) {
    totalUsers++;
    if(Object.keys(obj[u]).length === 0) {
      unscraped.push(u);
    } else {
      totalScraped += Object.keys(obj[u]).length - 1;
    }
  }
  return {unscraped, totalScraped, totalUsers}
}


async function firstGenScrape(timeClass) {
  // no need to manually call; called by "scrapeGen()"
  let scraped = await scrapeLosses("MagnusCarlsen",  timeClass);
  delete scraped.beatBy$;   // the $ is to prevent a username called that.
  txtA.value = `"${timeClass}DefeatersGen1": ${JSON.stringify(scraped)}`;
}


async function scrapeLosses(user,  timeClass, exclusions=[]) {
  makeTextArea();
  let doneSfx = new Audio("err.wav");
  console.clear();

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
  let losses = {beatBy$:[]};
  let alreadyExcluded = [];

  do {
    const gamelist = await fetch(`https://api.chess.com/pub/player/${user}/games/${lookYear}/${lookMonth}`)
    .then(gamelist => gamelist.json());

    if (gamelist.games.length) {
      for (const game of gamelist.games) {
        if (game.time_class !==  timeClass) continue;
        let opponent = (game.black.username == user) ? "white" : "black";
        let userColour = (opponent == "white") ? "black" : "white";
          if (game[opponent].result == "win") {
            if (losses.beatBy$.includes(game[opponent].username)) continue;
            if (alreadyExcluded.includes(game[opponent].username)) continue;
            if (exclusions.includes(game[opponent].username)) {
              alreadyExcluded.push(game[opponent].username);
              continue;
            }
            if (game.initial_setup !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") continue;
            if (game.rules !== "chess") continue;
            let loss = {
              url:game.url.match(/[^/]*$/g)[0],
              date:game.end_time,
              rating:game[opponent].rating,
              oppRating:game[userColour].rating,
            }
            losses[game[opponent].username] = loss;
            losses.beatBy$.push(game[opponent].username);
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
  } while ( lookYear < nowYear || lookMonth <= nowMonth );

  console.log(`${alreadyExcluded.length} users skipped; already seen in prev. gen`);
  console.log("done");
  doneSfx.play();
  return losses;
}


async function blankScrape(timeClass, generation) {
  //build a blank stringified object from previous gen's data, ready to be filled
  //no need to manually call, will be built if doesn't exist.

  let jsonObj = timeClass + "DefeatersGen" + (generation - 1);
  if (data[jsonObj] === undefined) {
    console.log("prev. gen object not yet in JSON data");
    return false;
  }
  makeTextArea();
  let defs = [];
  let obj = data[jsonObj];
  if (generation == 2) {  // different procedure to read from 1st gen.
    for (const u in obj) {
      defs.push(u);
    }
  } else {
    for (const u in obj) {
      if (!obj[u].beatBy$ || !obj[u].beatBy$.length) continue;
      for (const d of obj[u].beatBy$) {
        if (d != "MagnusCarlsen") defs.push(d);
      }
    }
  }
  console.log("Gen" + generation, "  Size " + defs.length, defs);

  let blanks = {};
  for (let d of defs) {
    blanks[d] = {}; // should auto-eliminate duplicates
  }

  return blanks;

}




async function makeTextArea() {
  if (!document.getElementById("txtA")) {
    var txtA = document.createElement("textarea");
    txtA.setAttribute("id", "txtA");
    txtA.setAttribute("style", "height:100em; width:100%;");
    document.body.appendChild(txtA);
  }
}
