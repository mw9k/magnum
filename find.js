"use strict";

let glb = { alreadySeen:[], defeatsChain:[], finished:false,
	currentlyLooking:false, endTable:undefined, chosenTime:"", cancelled:false };

function el(elem) {	// Custom shortener for document.getElementById()
	return document.getElementById(elem);
}

function lCase(input) {
	return String(input).toLowerCase();
}

function capitaliseFirstLetter(input) {
	return String(input)[0].toUpperCase() + String(input).slice(1);
}

function setState(state) {
	document.body.classList = state;
	if (state == "looking" || state == "keepGoing") {
		el("uName").setAttribute("disabled", "");
		el("timeClass").setAttribute("disabled", "");
		el("launchSearch").setAttribute("disabled", "");
	} else {
		el("uName").removeAttribute("disabled");
		el("timeClass").removeAttribute("disabled");
		el("launchSearch").removeAttribute("disabled");
	}
}


window.addEventListener("load", (event) => {
	// Prevent interaction & display waiting animation until JSON data is loaded
	loadData();
	const interval = setInterval(function() {
		if (glb.endTable == "error") {
			displayError("Failed to load necessary data. Try refreshing the page.");
			document.body.style.cursor = "default";
			clearInterval(interval);
		} else if (glb.endTable && Object.keys(glb.endTable)) {
			setState("loaded");
			clearInterval(interval);
		}
	}, 100);
});


async function loadData() {
	// Load pre-baked JSON data containing last few generations of search.
	// Like an endgame table to resolve the search; & cuts repetitive API fetches
	let found = false;
	// Plan A:
	// glb.endTable = await fetch("./endtable.json")
	// Plan B:
	glb.endTable = await fetch("https://api.npoint.io/a769d4a5fc9905b6d8a9")	
	.then((res)=>{
		if(res.ok) {
			found = true;
			return res.json();
		}
	});
	if (!found) glb.endTable = "error";  glb.cancelled = false;
  glb.finished = false;
}


document.addEventListener("click", function(e) {
	if (e.target.id == "launchSearch" || e.target.id == "keepLooking" ||
			e.target.id == "keepLooking2") {
		if (!glb.currentlyLooking) {
			runSearch();
			el("loading").scrollIntoView({ behavior: "smooth", block: "center" });
		}
	} else if (e.target.id == "viewResults") {
		document.body.scrollIntoView({ behavior: "smooth", block:"end"});
	} else if (e.target.id == "reset") {
		glb.cancelled = true;
		if (!glb.currentlyLooking) clearSearch();
	} else if (e.target.id == "faqLink") {
		el("moreInfoTrigger").classList.add("shown");
		el("moreInfo").classList.add("shown");
	} else if (e.target.classList.contains("revealTrigger")) {
		let targetElem = el(e.target.dataset.targetid);
		e.target.parentNode.classList.toggle("shown");
		targetElem.classList.toggle("shown");
	}
});

window.addEventListener("keyup", (event) => {
	if (event.key == "Enter" && !glb.currentlyLooking) {
		if (document.body.classList.contains("keepGoing") ||
        event.target.id == "uName") {
			runSearch();
		}
	}
});


async function runSearch() {
	if (glb.currentlyLooking || !glb.endTable || glb.endTable == "error") {
		return false;
	} 
	if (glb.finished || !glb.defeatsChain.length) clearSearch();
	glb.currentlyLooking = true;
	glb.cancelled = false;
	glb.finished = false;
  setState("looking");
	if (!glb.defeatsChain.length) {	// Initiate search if not already initiated
		let validated = await validate([el("uName").value]);
		if (!validated.valid) {
			if (validated.msg) displayError(validated.msg);
			return false;
		} else {
			glb.defeatsChain = [validated.username];
			glb.alreadySeen = [lCase(glb.defeatsChain[0])];
			glb.chosenTime = el("timeClass").value;
		}
	}

	let stats = {}, bestMonth = {};

	for (let i = 0; i < 8; i++) {	
		// Only look 8x, require manual intervention to look further.
		// Prevents infinite loops etc
		if (glb.cancelled) {
			handleResult("cancelled");	// (Mult. pts of cancellation)
			return;
		}
		const user = glb.defeatsChain[glb.defeatsChain.length - 1];
		if (!stats[user]) {  // Don't re-download if already present
			stats[user] = await downloadStats(user, glb.chosenTime);
			if (stats[user]) {
				if (glb.cancelled) {
					handleResult("cancelled");	// (Mult. pts of cancellation)
					return;
				}
				bestMonth[user] = await getBestMonthGames(user, glb.chosenTime, stats[user]);
			}	
		}
		if (glb.cancelled) handleResult("cancelled");	// (Mult. pts of cancellation)

		if (bestMonth[user]) {
			var result = await findBestWin(user, glb.chosenTime, bestMonth[user]);
		} else {
			backtrack(user, glb.chosenTime);
		}
		handleResult(result, user);
		if (!glb.currentlyLooking) return;
  }
	if (!glb.finished && glb.currentlyLooking && glb.defeatsChain.length) {
    // Reveal options to manually continue search...
    setState("keepGoing");
		glb.currentlyLooking = false;
  }
}


function handleResult(result, user) {
	if (glb.cancelled || result == "cancelled") {
    clearSearch();
    return;
  }
	if (result == "MagnusCarlsen") {
		el("defeatsList").innerHTML = `<li class='noNumber'>0. <span>MagnusCarlsen 
		is MagnusCarlsen.</span></li>`;

		showResults(`<h2>Results</h2><p>Search complete. <b>0 
		${el("timeClass").value} wins</b> separate MagnusCarlsen from MagnusCarlsen.`);
		return;
	}
  if (result && Object.keys(result)) {
		if (result.loser == "MagnusCarlsen") {
			addEntry(result);
      showResults();
    } else {
			addEntry(result);
			glb.alreadySeen.push( lCase(result.winner) );
			glb.defeatsChain.push(result.loser);
    }
	}
}

async function downloadStats(user, timeClass) {
	// Return all stats for each user
	// Store for re-use; reducing API calls needed in case of backtracking
	const stats = await fetch(`https://api.chess.com/pub/player/${user}/stats`)
		.then(stats => stats.json());
	if ((!stats[`chess_${timeClass}`]) ||
		stats[`chess_${timeClass}`].best === undefined) {
		return false;
	} else {
		return stats;
	}
}

async function getBestMonthGames(user, timeClass, stats) {
	// Get all games for month in which user attained highest rating... 
	// (indirect, closest to "best win" I can get from API)
	let best = stats[`chess_${timeClass}`].best,
		bestGameDate = new Date(best.date * 1000),
		bestGameMonth = ((bestGameDate.getMonth() + 1) + "").padStart(2, "0"),
		bestGameYear = bestGameDate.getFullYear();

	const gameList = await fetch(`https://api.chess.com/pub/player/${user}/games/${bestGameYear}/${bestGameMonth}`)
		.then((res) => {
			return (res.ok) ? res.json() : false;
		})
	return gameList;
}

async function validate(username="", msg="") {
	const badChars = String(username).match(/[^a-z^A-Z^0-9^_^-]+/g) || ""; 
	if (username == "") {
		msg = "Username cannot be blank.";
	} else if (badChars.length) {
		msg = "Username contains invalid characters.";
	}
	if (msg) return {username:username, valid:false, msg:msg};
	const profile = await fetch(`https://api.chess.com/pub/player/${username}`)
	.then((res)=>{
		return (res.ok) ? res.json() : undefined;
	});
	if (profile === undefined) {
		msg = `User "${username}" not found.`;
		return {username:username, valid:false, msg:msg};
	}
  // Get correctly capitalised username from end of URL...
	username = profile.url.match(/[^/]*$/g)[0];
	if (username == "MagnusCarlsen") {
		handleResult("MagnusCarlsen");
		return { username: username, valid:false, msg: undefined };
	}
	return {username:username, valid:true, msg:undefined};
}



async function findBestWin(user, timeClass, gameList) {
	if (glb.cancelled) return "cancelled";	// (Multiple points of cancellation)

	const inEndTable = await findInEndTable(user, timeClass);
	if (inEndTable !== undefined) return inEndTable;

	if (glb.cancelled) return "cancelled";	// (Multiple points of cancellation)
	let opponent = "", playingAs = "", topWin = 0, bestGameURL = "",
			bestOpp = "", ratingAttained = 0, winDate = undefined;

	// Look for top rated opponent in game list
	for (const game of gameList.games) {
		if (glb.cancelled) return "cancelled";	// (Multiple points of cancellation)
		if (game.time_class !==  timeClass) continue;
		playingAs = (lCase(game.white.username) == lCase(user)) ? "white" : "black";
		opponent = (playingAs == "white") ? "black" : "white";

		// Exclude undesired games...
		if (glb.alreadySeen.includes(lCase(game[opponent].username))) continue;
		if (game[playingAs].result !== "win") continue;
		const stdSetup = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
		if (game.initial_setup !== stdSetup) continue;
		if (game.rules !== "chess") continue;
		if (!game.pgn) continue;
		let blackMoveCount = game.pgn.match(/[0-9](\.\.\.)/g);
		if (!blackMoveCount || blackMoveCount.length < 2) continue;

    // While here, check every defeated user for occurence in "end table"
    const defInEndTable = await findInEndTable(game[opponent].username, timeClass);

    if ( game[opponent].rating > topWin || defInEndTable ) {
      winDate = new Date(game.end_time * 1000).toLocaleDateString();
      topWin = game[opponent].rating;
      bestOpp = game[opponent].username;
      bestGameURL = game.url;
      ratingAttained = game[playingAs].rating;
      if (defInEndTable) break;	// Stop looking if found user in endTable
    }
  }

	if (bestOpp == "") return undefined;

	if (glb.cancelled) return "cancelled";	// (Multiple points of cancellation)
	return { url:bestGameURL, date:winDate, winner:user,
		  		 winnerRating:ratingAttained, loser:bestOpp, loserRating:topWin};
}



async function backtrack(user, timeClass="selected") {
  // Prune a "dead-end" user from the search...
	if (glb.defeatsChain.length <= 1) {
		if (glb.alreadySeen.length > 1) {
			displayError(`Could not complete search for user '${user}'
                    in time class ${capitaliseFirstLetter(timeClass)}.`);
		} else {
			displayError(`User '${user}' has no recorded
                    ${capitaliseFirstLetter(timeClass)} wins.`);
		}
		return false;
	}
	let matches = el("defeatsList").innerHTML.match(/<li>.*?<\/li>/sg);
	matches.pop();
	el("defeatsList").innerHTML = matches.join("");
	glb.alreadySeen.push( lCase(user) );
	glb.defeatsChain.pop();
	return undefined;
}


async function findInEndTable(user, timeClass) {
	// Look for user in pre-baked data of the 1st 1-3 gens of Magnus defeaters...
	let def = "", date = "", url = "";
	for (let gen=1; gen < 6; gen++) {	// 6 gen max - room for expansion
		const defeaters = glb.endTable[`${timeClass}DefeatersGen${gen}`];
		if (defeaters == undefined) break;  // Only look to depth that data exists
		if (gen == 1) { // Check for a direct defeat of Magnus
			for (const d in defeaters) {
				if (d == user) {
					def = defeaters[d];
					date = new Date(def.date * 1000).toLocaleDateString();
					url = `https://www.chess.com/game/live/${def.url}`;
					return { url, date, winner:user, winnerRating:def.oppRating,
						  		 loser:"MagnusCarlsen", loserRating:def.rating};
				}
			}
		} else {  // Check for successive generation defeats
			for (const d in defeaters) {
				if (defeaters[d].beatBy$.includes(user)) {
					def = defeaters[d][user];
					date = new Date(def.date * 1000).toLocaleDateString();
					url = `https://www.chess.com/game/live/${def.url}`;
					return { url, date, winner:user, winnerRating:def.oppRating,
						 			 loser:d, loserRating:def.rating};
				}
			}
		}
	}
}


function addEntry(eData) {
	// Visually display each found user in the search
	var entry = document.createElement("li");
	entry.innerHTML = `
		<span><a href=${eData.url} target="_blank" rel="noopener noreferrer">
		On ${eData.date}</a> <b>${eData.winner}</b>&thinsp;(${eData.winnerRating})
		defeated <b> ${eData.loser}</b>&thinsp;(${eData.loserRating})</span>`;
		el("defeatsList").appendChild(entry);
}


function clearSearch() {
	// Reset interface and variables, ready for a new search
	setState("reset");
	el("moreInfo").classList.remove("shown");
	el("moreInfoTrigger").classList.remove("shown");

	el("defeatsList").innerHTML = "";
	glb.defeatsChain = [];
	glb.alreadySeen = [];
	glb.chosenTime = "";
	glb.currentlyLooking = false;
}


function showResults(msg) {
  setState("success");
	glb.finished = true;
	glb.currentlyLooking = false;
	const plural1 = (glb.defeatsChain.length > 1) ? "s" : "";
	const plural2 = (glb.defeatsChain.length > 1) ? "" : "s";

  if (!msg) msg = `<h2>Results</h2><p>Search complete. 
	<b>${glb.defeatsChain.length} ${glb.chosenTime} win${plural1}</b>
	separate${plural2} ${glb.defeatsChain[0]} from MagnusCarlsen.`;
	
  el("resultsText").innerHTML = msg;
}


function displayError(msg) {
	clearSearch();
  setState("error");
  let heading = `<h2><i class="fa fa-exclamation-triangle"></i></h2>`;
	el("resultsText").innerHTML = `${heading}<p>${msg}</p>`;
}
