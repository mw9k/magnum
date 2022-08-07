# MagNum
A website to find a chess.com user's 'Magnus Number', using the Chess.com public API.

Live at https://mw9k.github.io/magnum/

- Unofficial hobby project; not associated with Chess.com.
- Attempts to find any Chess.com user's 'Magnus Number' - a chain of victories that leads to GM Magnus Carlsen.
  Even low rated players may find that they have 'defeated' Magnus in this way.
- Not necessarily shortest path. Therefore, might not find your TRUE Magnus number.
  For now, I have used some indirect workarounds to avoid overwhelming chess.com's public API.
- Work in progress. Dead ends may occur, despite best efforts to backtrack / avoid loops.
- Requires a modern browser.

## Current Algorithm Lacks Discernment...
Essentially it works by finding the (approximately) best rated 
opponent that each user defeated, then 
following that chain upwards until it finds 
someone in a hard-coded tree containing the 
last 2-3 generations of direct Magnus defeaters.

This approach arises from limitations of
the API, but it is often not shortest path.
I plan to update the algorithm soon to at least
consider some alternatives, and to
prefer more promising paths.

## Not Open Source (yet)
I am not adding an open source licence just yet, until 
I improve the search algorithm somewhat. I'd just like to get it to a
reasonable level before opening it up. Of course, all the source code is inspectable.

## Acknowledgements:
- Favicon ["rooklab-brand-color"](https://www.favicon.cc/?action=icon&file_id=639359) found at favicon.cc, created by user sabrewolf.
  License: Creative Commons, no attribution
