# Phone layout and recovery verification

Tested October 29, 2026. Browser interaction used the desktop in-app browser. **These results do not certify native iPhone Safari gestures.** No physical iPhone or installed iOS simulator was available.

## Observed defects and fixes

- At 320 × 568 the Play button was below the clipped dialog viewport. Phone dialogs now use the available screen; decorative content is reduced on short screens, and overflowing content scrolls from its reachable top.
- The renamed brand wrapped at narrow widths. It now stays on one line.
- Backgrounding a retry or level-complete screen replaced it with a paused state with no ball. Only active play and countdowns can now be interrupted into a paused state.
- Rotation during a countdown did not stop play, and proportional rescaling could leave a ball below the paddle. Countdown rotation now pauses; ball positions map between the old and new playable regions.
- Secondary-finger release could clear the controlling pointer. Ownership is now tied to the primary pointer ID.
- Saves occurred on a timer; failed writes could cause the menu to discard current in-memory progress. Every brick hit now saves immediately, with a backup copy. Failed writes retain the session and show an explicit warning. Malformed settings cannot hide a valid game.
- Zoom instructions alone left recovery dependent on performing a pinch. The Fit button now counter-scales the app into the visible viewport without resetting browser zoom. It returns to the previous menu or paused/retry screen.
- At 4× simulated zoom plus doubled text, the recovery button could disappear below the instructions. Its action area now remains visible while the instructions scroll.

## Browser layout matrix

Measured actual DOM rectangles inside the test phone frame. The primary Play button was fully inside its card and screen at normal text size; no horizontal document overflow occurred.

| CSS viewport | Play visible | Card within screen | Horizontal overflow |
| --- | --- | --- | --- |
| 320 × 568 | Yes | Yes | No |
| 375 × 667 | Yes | Yes | No |
| 390 × 844 | Yes | Yes | No |
| 430 × 932 | Yes | Yes | No |
| 844 × 390 | Yes | Yes | No |
| 932 × 430 | Yes | Yes | No |

## Zoom and persistence checks

The local-only `/tests/phone-lab.html` loads the real app in a frame, magnifies its rendering, and supplies matching VisualViewport scale, offset, and size values. This exercises the real recovery UI and handlers; **it does not reproduce native iOS touch recognizers, system Zoom, or Safari's fixed-position quirks**.

- At 2× and 4× simulated magnification, recovery appeared at a readable size; Fit returned to readable controls without changing level, score, lives, or bricks.
- Starting and dragging the paddle after Fit kept the entire board and controls visible in the corrected non-scrolling test frame.
- Returning to scale 1 removed the fitted layout. Further magnification while fitted kept controls visible.
- At 320 × 568 with doubled dialog text and 4× simulated zoom, Fit remained visible and clickable. Normal enlarged dialogs could be scrolled to their controls.
- Actual gameplay broke another brick: score moved from 30 to 60 and remaining bricks from 39 to 38. After a normal missed ball, retry showed one chance. Zooming on retry and fitting the game preserved that state. Reload restored score 60, one chance, and 38 remaining bricks.
- New-game confirmation and cancellation preserved the saved run in the earlier browser pass.

## Automated regression coverage

`npm test`: **16 passing tests**, including eleven session regressions, using the real game module with DOM, viewport-event, and storage doubles. Coverage includes zoom thresholds 1.1×, 1.5×, 2× and 4×; paused recovery; one-tap fit; retry and completed-level interruptions; zero-chance reload; countdown backgrounding; pagehide without visibility events; rotation; immediate saves; damaged data fallback; refused writes; and pointer ownership. Engine checks cover 1,000 generated levels across three column counts, collision reflection, save validation, and landscape geometry.

`npm run check`: JavaScript syntax passes for all runtime modules and the service worker.

## Still required on a real iPhone

Test Safari and Home Screen mode with the toolbar expanded/collapsed, portrait/landscape rotation, actual pinch zoom and Fit, enlarged text and Display Zoom. Verify native finger tracking after fitting (desktop pointer dragging was checked in the simulation). Switch apps during both a countdown and retry, then close and reopen the page and compare progress. System accessibility Zoom is outside the page's control and needs a separate manual check.

Browser data deletion, private-mode cleanup, storage eviction, or an unsuccessful storage write followed by closing the page can still remove device-local saves. The game reports write failures; it cannot promise persistence when the browser refuses or deletes storage.
