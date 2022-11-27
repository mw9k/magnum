# MagNum
A website that uses the chess.com Public API to find a given user's 'Magnus Number'; a chain of victories that leads to GM Magnus Carlsen.

Live at https://mw9k.github.io/magnum/


## Current Algorithm:
Essentially it works by finding the (approximately) best rated 
opponent that each user defeated, then 
following that chain upwards until it finds 
someone in a hard-coded tree containing the 
last 2-3 generations of direct Magnus defeaters.

This approach arises from limitations of
the API, but it is often not shortest path.

## Not Open Source (yet)
I am not adding an open source licence just yet, until 
I improve the search algorithm somewhat. I'd just like to get it to a
reasonable level before opening it up. Of course, all the source code is inspectable.

## Acknowledgements:
- Favicon ["rooklab-brand-color"](https://www.favicon.cc/?action=icon&file_id=639359) found at favicon.cc, created by user sabrewolf.
  License: Creative Commons, no attribution
