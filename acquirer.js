// Scraping functions.
//--------------------------------------------------------------------------------
// Scraping for a locally hosted JSON tree of Magnus' losses,
// like an endgame table for the last few steps of the search.
// Cuts down on fetch requests to chess.com API.
// For my internal use. Not completely automated nor obvious in how to use.
// Leaving this stuff in incase anyone notices an error in how I collected the
// data, or in case its useful to anyone trying to achieve similar.


document.addEventListener("click", function(e) {
  if (e.target.id == "launchSearch") {
    // localStorage.clear();
    scrapeGen("rapid", 1);
    // after scraping each full gen (all 3 TCs), remember to upload the new JSON.
  }
});


async function scrapeGen(timeClass, generation) {
  makeTextArea();
  if (generation == 1) {
    firstGenScrape(timeClass);
    return;
  }

  const objName = `${timeClass}DefeatersGen${generation}`;
  if (!localStorage.data) localStorage.data = JSON.stringify({})
  let localdata = JSON.parse(localStorage.data);

  if (!localdata[objName]) {  // create blank obj if doesn't already exist in localdata
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

    let alreadySeen = ["MagnusCarlsen"]; // prevent repeating users from prev. generations
    for (let i = generation - 1; i > 0; i--) {
      let users = data[`${timeClass}DefeatersGen${i}`];
      for (let u in users) {
        alreadySeen.push(u);
      }
    }

    for (let u in localdata[objName]) { // prevent repeat users from same generation
      alreadySeen.push(u);  // equivalent to the prev gen's "beatBy$"
      if (localdata[objName][u].beatBy$ && localdata[objName][u].beatBy$.length) {
        for (let d in localdata[objName][u].beatBy$) {
            alreadySeen.push(d);  // this gen's beatBy$
        }
      }
    }

    if (!el("uName").value) {
      let toScrape = await findNextToScrape(localdata[objName], timeClass, generation);
      if(toScrape.unscraped.length > 0) {
        const first10 = toScrape.unscraped.slice(0, 10);
        console.log("Reordered: " + first10 + "...");
        el("uName").value = toScrape.unscraped[0];
        return;
      } else {
        el("uName").value = toScrape.lastUser;
      }
    } else {
      if (localdata[objName][el("uName").value]) {
        const sizeLimit = (Object.keys(localdata[objName]).length > 200) ? 40 : 0;
              // ^ in big gens, only scrape the top-rated x many losses per user.
              // Should help w/ the app's assumption: higher == closer to Magnus.
        let losses = await scrapeLosses(el("uName").value, timeClass, alreadySeen, sizeLimit);
        if (!losses.beatBy$ || !losses.beatBy$.length) {
          delete localdata[objName][el("uName").value]; // exclude 0 loss users
        } else {
          localdata[objName][el("uName").value] = losses;
        }

        localStorage.data = JSON.stringify(localdata);
        el("txtA").value = `"${objName}": ${JSON.stringify(localdata[objName])}`;

        let toScrape = await findNextToScrape(localdata[objName], timeClass, generation);
        if(toScrape.unscraped.length) {
          el("uName").value = toScrape.unscraped[0];
        } else {
          el("uName").value = "All done."
        }
        let count = 0;
        if ((toScrape).totalScraped > 4000) {
          if (confirm("Enough users scraped. Auto-delete unused users?")) {
            for (let u in localdata[objName]) {
              if(Object.keys(localdata[objName][u]).length === 0) {
                delete localdata[objName][u];
                count++;
              }
            }
            console.log(count + " Unused users deleted.");
            el("txtA").value = `"${objName}": ${JSON.stringify(localdata[objName])}`;
          } else {
            console.log("Unused users not deleted yet.");
            return;
          }
        }
        console.log(`${toScrape.unscraped.length} remaining to scrape (of ${toScrape.totalUsers} users).`);
        console.log(toScrape.totalScraped + " losses found in total.");
      } else {
        el("txtA").value = "Username not found in data. Try clearing the textbox to get the next empty user.";
      }

    }
  }
}


async function findNextToScrape(obj, timeClass, generation) {
  let localdata = JSON.parse(localStorage.data);
  let unscraped = [], totalScraped = 0, totalUsers = 0, lastUser = "";
  for (let u in obj) {
    lastUser = u; // if all already scraped, still offer a username to re-scrape
    totalUsers++;
    if(Object.keys(obj[u]).length === 0) {
      unscraped.push(u);
    } else {
      totalScraped += Object.keys(obj[u]).length - 1;
    }
  }

  // Order incoming names by their rating in the last generation.
  // Varies ancestry for partially scraped gens,
  // But shouldn't fluctuate wildly on a rescrape (Fisher-Yates shuffle would).
  // Also goes w/ thesis that higher rating == closer to Magnus.
  unscraped.sort(function(a, b){
    let aRating = 0, bRating = 0;
    const lookIn = data[`${timeClass}DefeatersGen${generation - 1}`];
    for (let u in lookIn) {
      for (let u2 in lookIn[u]) {
        if (u2 == a) aRating = lookIn[u][u2].oppRating;
        if (u2 == b) bRating = lookIn[u][u2].oppRating;
      }
    }
    return bRating - aRating;
  });

  return {unscraped, totalScraped, totalUsers, lastUser}
}


async function firstGenScrape(timeClass) {
  // no need to manually call; called by "scrapeGen()"
  let scraped = await scrapeLosses("MagnusCarlsen",  timeClass);
  delete scraped.beatBy$;   // the $ is to prevent a username called that.
  txtA.value = `"${timeClass}DefeatersGen1": ${JSON.stringify(scraped)}`;
}


async function scrapeLosses(user,  timeClass, exclusions=[], sizeLimit = false) {
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
            // exclude undesirable games...
            if (game.initial_setup !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") continue;
            if (game.rules !== "chess") continue;
            if (!game.pgn) continue;
            let blackMoveCount = game.pgn.match(/[0-9](\.\.\.)/g);
            if (!blackMoveCount || blackMoveCount.length < 2) continue;

            let loss = {
              url:game.url.match(/[^/]*$/g)[0],
              date:game.end_time,
              rating:game[userColour].rating,
              oppRating:game[opponent].rating
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

  console.log(`${alreadyExcluded.length} users skipped; already seen.`);
  console.log("done");
  doneSfx.play();

  if (sizeLimit ) {  // Limit to top x many wins for larger gens.
                    // Inexact if certain users have same rating, but close enough.
    let topRated = [];
    if (!losses.beatBy$ || !losses.beatBy$.length) return {};
    for (let l in losses) {
      if (l == "beatBy$") continue;
      if (losses[l].oppRating) topRated.push(losses[l].oppRating);
    }
    if (topRated.length <= sizeLimit) return losses;
    topRated.sort(function(a, b){return b - a});  // sort reverse numerically
    const minRating = topRated[sizeLimit - 1];    // find min rating to keep
    for (let l in losses) {
      if (l == "beatBy$") continue;
      if (losses[l].oppRating && losses[l].oppRating < minRating) {
        delete losses[l];
      }
    }
    let newBeatBy = []; // now update the beatBy array to reflect the changes
    for (let b of losses.beatBy$) {
      if (losses[b]) newBeatBy.push(b);
    }
    losses.beatBy$ = newBeatBy;
  }


  return losses;
}


async function blankScrape(timeClass, generation) {
  // Build a blank stringified object from previous gen's data, ready to be filled.
  // No need to manually call, will be built if doesn't exist.

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

  let blanks = {};
  for (let d of defs) {
    blanks[d] = {}; // should auto-eliminate duplicates
  }

  console.log("Gen" + generation, "  Size " + Object.keys(blanks).length, defs);
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

async function findMinRatings() {

  // fixme: time the search in js to see which one...

  // final step, build a big index of every username; for simpler / quicker searching.


  // final step; build an object compiling the minimum ratings seen in each
  // generation, to give a quick check for whether it's worth searching.

}
