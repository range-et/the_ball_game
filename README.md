# the ball game

A gentle, responsive 2D brick breaker for iPhone browsers, built with native JavaScript and Canvas. No runtime dependencies or backend.

## Run

`npm run dev` then open http://localhost:5173. `npm test` checks seeded generation, obstacle spacing, collisions, and save validation. `npm run check` checks JavaScript syntax.

## Play

Slide one finger across the field, move the mouse, or use arrow keys. Space pauses and releases a sticky ball. Clear colored bricks; striped bricks are permanent. Dots show remaining armor. The outlined core clears neighboring bricks. Falling bonuses grant a wider paddle (18 seconds), slow motion (14 seconds), multiball, one-use floor shield, piercing (12 seconds), or a sticky catch (16 seconds). Paddle width stays between 22% and 30% of the field. Retry always keeps cleared bricks and the current level. Slower play is the default.

Progress is stored in localStorage on this device and origin. Active ball positions and temporary bonuses restart safely on reopening; brick damage, score, lives, seed and level persist. Clearing website data or private browsing can remove saves. Storage failures are reported in the interface.

Levels use repeatable seeds, five pattern families, isolated solid obstacles and gradually increasing armor. New levels adapt column count to screen width; existing boards preserve topology on rotation. There are no closed solid shells. Ball travel uses small collision steps; stall assistance redirects a ball after 28 seconds without progress.

## iPhone behavior

The playfield owns touch gestures; menus retain native text scaling. Viewport zoom detected through VisualViewport pauses the game and opens a recovery prompt. Safari does not provide a supported API to reset pinch zoom: the prompt explains the pinch-in gesture without pretending a button can force it. System Zoom and VoiceOver gestures cannot be overridden or reliably detected by the page. Device testing remains necessary, including large text, Display Zoom, pinch zoom, rotation, interruption and Home Screen mode. The game does not claim screen-reader accessibility for the real-time canvas.

The manifest supports Home Screen mode; a service worker caches game files after first load. Use HTTPS or localhost. An SVG icon is included; a PNG Apple touch icon can be added for older iPhones.

## GitHub Pages

The included workflow deploys static files on pushes to `main`. In repository Settings → Pages, choose **GitHub Actions** as the source. Relative URLs support https://range-et.github.io/the_ball_game/. No credentials or external services are required.

## Design credits

Palette based on [Monad System](https://github.com/range-et/monad_system), MIT license retained in `vendor/MONAD-LICENSE`. Original graphics and game implementation; no DX-Ball assets.
