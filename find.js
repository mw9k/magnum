let alreadySeen = [], winnerList = [], unfinished = false, loaded = false,
		currentlyLooking = false, data = undefined, chosenTime = "",
		cancelled = false;


function el(elem) {	// custom shortener for "document.getElementById()"
	return document.getElementById(elem);
}


function lCase(input) { // custom shortener for "String().toLowerCase()"
	return String(input).toLowerCase();
}


window.addEventListener('load', (event) => {
	// prevent interaction & display waiting animation until JSON data is loaded
	loadData();
	const interval = setInterval(function() {
		if (data == "error") {
			displayError("Failed to load necessary data. Try refreshing the page.");
			el("loadingCover").setAttribute("hidden",true);
			document.body.style.cursor = "default";
			clearInterval(interval);
		} else if (data && Object.keys(data)) {
			el("loadingCover").setAttribute("hidden",true);
			document.body.style.cursor = "default";
			el("controls").style.visibility = "visible";
			el("controls").style.opacity = "1";
			clearInterval(interval);
			loaded = true;
		}
	}, 100);
});


async function loadData() {
	// load pre-baked JSON data containing last few generations of search.
	// Like an endgame table to resolve the search; & cuts repetitive API fetches
	let found = false;
	data = await fetch("./data.json") // plan A
	// data = await fetch("https://api.npoint.io/00a5297c5864c8e0f404")	// plan B
	.then((res)=>{
		if(res.ok) {
			found = true;
			return res.json();
		}
	});
	if (!found) data = "error";
}


document.addEventListener("click", function(e) {
	if (e.target.id == "launchSearch" || e.target.id == "keepGoing") {
		if (!currentlyLooking) runSearch();
	} else if (e.target.id == "viewResults") {
		el('results').scrollIntoView({behavior:"smooth", block:"center"});
	} else if (e.target.id == "reset") {
		cancelled = true;
		if (!currentlyLooking) {
			clearSearch();
			enableControls(true);
		}
	}
});


window.addEventListener('keyup', (event) => {
	if(event.key == "Enter" && !currentlyLooking) {
		if (el("keepGoing").style.visibility == "visible" || event.target.id == "uName") {
			runSearch();
		}
	}
});


async function runSearch() {
	if (currentlyLooking || !loaded) return false;
	if (!winnerList.length) {	// initiate search if not already initiated
		let validated = await validate([el("uName").value]);
		if (!validated.valid) {
			displayError(validated.msg);
			currentlyLooking = false;
			return false;
		} else {
			clearSearch();
			winnerList = [validated.username];
			alreadySeen = [lCase(winnerList[0])];
			chosenTime = el("timeClass").value;
		}
	} else if (unfinished == false) { // if search has completed but not yet reset
		clearSearch();
		runSearch();
		return false;
	}
	// mark search as underway...
	el("keepGoing").style.opacity = "0";
	el("keepGoing").style.visibility = "hidden";
	el("launchSearch").textContent = "Searching...";
	disableControls();
	currentlyLooking = true;
	unfinished = true;
	for (let i = 0; i < 8; i++) {	// only look 8x, require manual intervention to
		 														// look further. Prevents infinite loops etc
		let winner = await findTopWin(winnerList[winnerList.length - 1], chosenTime);
		if (cancelled) {
			clearSearch();
			enableControls(true);
			return false;
		}
		if (winner == "MagnusCarlsen" || winner === false) {	// if search completed
			unfinished = false;
			enableControls(true);
			currentlyLooking = false;
			if (winner == "MagnusCarlsen") {	// if search SUCCESSFULLY completed
				el("results").style.display = "table";
				const plural1 = ( el("winChain").childNodes.length > 1 ) ? "s" : "";
				const plural2 = ( el("winChain").childNodes.length > 1 ) ? "" : "s";
				el("results").innerHTML = `Search complete. <b>${el("winChain").childNodes.length}
				 ${chosenTime} win${plural1}</b> separate${plural2} ${winnerList[0]} from MagnusCarlsen.`;
				 el("viewResults").style.visibility = "visible";
				 el("viewResults").style.opacity = "1";
			}
			return;
		}
		if (winner) winnerList.push(winner);
	}
	// reveal options to manually continue search...
	el("launchSearch").textContent = "Keep Going";
	el("keepGoing").style.visibility = "visible";
	el("keepGoing").style.opacity = "1";
	enableControls();
	currentlyLooking = false;
}


async function validate(username="", msg="", valid=false) {
	const badChars = String(username).match(/[^a-z^A-Z^0-9^_^-]+/g);
	if (username == "") {
		msg = "Username cannot be blank";
	} else if (badChars && badChars.length) {
		msg = "Username contains invalid characters.";
	}
	if (msg) return {username:username, valid:false, msg:msg};
	let found = false;
	const profile = await fetch(`https://api.chess.com/pub/player/${username}`)
	.then((res)=>{
		if(res.ok) {
			found = true;
			return res.json();
		}
	});
	if (!found) {
		msg = `User "${username}" not found.`;
		return {username:username, valid:false, msg:msg};
	}
	username = profile.url.match(/\w+$/g)[0];  // ensure correct capitalisation for URLs
	if (username == "MagnusCarlsen") {
		msg = `ERROR: Cannot compute the Magnus number for GM Magnus Carlsen.<br>Please choose literally anyone else ;-)`;
		return {username:username, valid:false, msg:msg};
	}
	return {username:username, valid:true, msg:undefined};
}


async function findTopWin(user,  timeClass) {			// the heavy lifting; find each user's "best" win.
	if (cancelled) return false;	// multiple points of cancellation
	const myStats = await fetch(`https://api.chess.com/pub/player/${user}/stats`)
	.then(myStats => myStats.json());
	if ((!myStats[`chess_${ timeClass}`]) || myStats[`chess_${ timeClass}`].best === undefined) {
		// sometimes can be missing stats on chess.com end for users who DO have stats, unsure why...
		let result = await backtrack(user);
		if (result === false) return false;
		return;
	}
	// find the month in which user attained best rating for time class
	let best = myStats[`chess_${ timeClass}`].best;
	let gameURL = "";
	let bestGameDate = new Date(best.date * 1000);
	let bestGameMonth = ((bestGameDate.getMonth() + 1) + "").padStart(2, "0");
	let bestGameYear = bestGameDate.getFullYear();

	const gamelist = await fetch(`https://api.chess.com/pub/player/${user}/games/${bestGameYear}/${bestGameMonth}`)
	.then(gamelist => gamelist.json());

	if (cancelled) return false;	// multiple points of cancellation
	// check if user appears in pre-baked data of the first 1-3 gens of Magnus defeaters
	let def = "";
	for (let gen=1; gen < 6; gen++) {	// why 6? room for expansion
		const defeaters = data[`${timeClass}DefeatersGen${gen}`];
		if (defeaters == undefined) break;  // only look at data gens that exist; varies by time control
		if (gen == 1) { // check for a direct defeat of Magnus
			if (defeaters.allDefeaters$.includes(user)) {
				def = defeaters[user];
				addEntry(def.url, def.date, user, def.rating, "MagnusCarlsen", def.opponentRating, timeClass);
				return "MagnusCarlsen";
			}
		} else {  // check for successive generation defeats
			for (const d in defeaters) {
				if (defeaters[d].allDefeaters$.includes(user)) {
					def = defeaters[d][user];
					addEntry(def.url, def.date, user, def.rating, d, def.opponentRating, timeClass);
					alreadySeen.push( lCase(d) );
					return d;
				}
			}
		}
	}

	if (cancelled) return false;	// multiple points of cancellation
	let opponent = "", playingAs = "", topWin = 0, bestGameURL = "",
			bestOpp = "", ratingAttained = 0;
	// look for top rated opponent in best month (indirect; best I can do w/ API)
	for (const game of gamelist.games) {
		if (game.time_class !==  timeClass) continue;
		playingAs = (lCase(game.white.username) == lCase(user)) ? "white" : "black";
		opponent = (playingAs == "white") ? "black" : "white";
		if (alreadySeen.includes(lCase(game[opponent].username))) continue;
		let won = (game[playingAs].result == "win");
		if (won && game[opponent].rating > topWin ) {
			winDate = new Date(game.end_time *1000).toLocaleDateString();
			topWin = game[opponent].rating;
			bestOpp = game[opponent].username;
			bestGameURL = game.url;
			ratingAttained = game[playingAs].rating;
		}
	}

	if (bestOpp == "") {  // if no best opponent was found, backtrack to a dif. user
		return await backtrack(user);
	}
	if (cancelled) return false;	// multiple points of cancellation
	alreadySeen.push( lCase(bestOpp) );
	addEntry(bestGameURL, winDate, user, ratingAttained, bestOpp, topWin, timeClass);
	return bestOpp;
}

async function backtrack(user) {		// prune a 'dead-end' user from the search
	if (winnerList.length == 1 || !winnerList.length) {
		displayError(`${user} has no recorded wins in selected time class.`);
		return false;
	}
	let matches = el("winChain").innerHTML.match(/<li>.*?<\/li>/sg);
	matches.pop();
	el("winChain").innerHTML = matches.join("");
	alreadySeen.push( lCase(user) );
	winnerList.pop();
	return undefined;
}


function addEntry(gameURL, gameDate, user, rating, opponent, oppRating, timeClass) {
	// visually display each found user in the search
	var entry = document.createElement("li");
	entry.innerHTML = `<span class=tc>${timeClass}</span>
		<span>On <a href=${gameURL} target="_blank" rel="noopener noreferrer">
		${gameDate}</a> <b>${user}</b>&thinsp;(${rating}) defeated <b>
		${opponent}</b>&thinsp;(${oppRating})</span>`;
		el("winChain").appendChild(entry);
	// el("keepGoing").scrollIntoView({behavior: "smooth"})		// too jarring, may revisit
}

function clearSearch() {
	// reset interface and variables, ready for a new search
	el("winChain").innerHTML = "";
	el("results").innerHTML = "";
	el("results").style.display = "none";
	el("viewResults").style.visibility = "hidden";
	el("viewResults").style.opacity = "0";
	el("keepGoing").style.visibility = "hidden";
	el("keepGoing").style.opacity = "0";
	cancelled = false;
	winnerList = [];
	alreadySeen = [];
	chosenTime = "";
	currentlyLooking = false;
}


function displayError(msg) {
	el("winChain").innerHTML = `<span class=errMsg>&#9888;${msg}</span>`;
}


function showMore() {
	el("showMore").setAttribute("hidden", "true");
	el("showLess").removeAttribute("hidden");
	el("moreInfo").removeAttribute("hidden");
}


function showLess() {
	el("showLess").setAttribute("hidden", "true");
	el("showMore").removeAttribute("hidden");
	el("moreInfo").setAttribute("hidden", "true");
}


function enableControls(all) {
	el("launchSearch").disabled = false;
	if (!all) return;
	el("launchSearch").textContent = "Search";
	el("reset").style.visibility = "hidden";
	el("reset").style.opacity = "0";
	el("uName").disabled = false;
	el("timeClass").disabled = false;
}


function disableControls() {
	el("reset").style.visibility = "visible";
	el("reset").style.opacity = "1";
	el("launchSearch").disabled = true;
	el("uName").disabled = true;
	el("timeClass").disabled = true;
}
