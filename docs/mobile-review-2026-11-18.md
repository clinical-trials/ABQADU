# Version 11 mobile review — November 18, 2026

Reviewed the public homeowner website and current React contractor app in Chrome browser emulation. This is a responsive-layout and interaction review, not a certification of every device or service integration.

## Results

- 33 screens or interaction states across eight viewports: **264 checks**.
- Portrait widths: 320, 375, 390, 430, 768, 1024, and 1440 pixels. Landscape: 844 × 390 pixels.
- No page-level horizontal overflow, JavaScript page errors, failed review actions, undersized checked buttons/form controls, or input text below 16px in the final checked states.
- Contractor screens passed the full run. After the last public touch-size correction, all 88 public screen checks were repeated and passed; contractor code was unchanged.
- 800 client tests passed in 46 suites; 80 public-site tests passed; production client build passed.

Coverage includes the homeowner navigation, contact preparation, model preview, all seven design-wizard steps, contractor-access page, admin sign-in form, contractor menu, expanded command-center sections, trade-bid form, indoor and outdoor estimator, client form, bid editor, invoice/check dialog, portfolio, schedule/activity editor, field task form, risk form, preconstruction demo, executive dashboard, project selection, payment-return page, and floor-plan editor.

## Corrections

- Compacted the phone/landscape design footer so model choices remain visible. Kept the top step navigation and draft status.
- Enlarged small touch controls, including tablet controls and image-preview close. Used 16px form text on touch layouts.
- Switched the homeowner header to its mobile menu through tablet widths.
- Fitted the drawing viewport to the available width and added Zoom in, Zoom out, Fit plan, and Move view controls.
- Fixed duplicate tap/click handling that immediately deselected a newly placed room. The real browser touch check places a room, confirms selection, changes the view, and verifies unchanged dimensions. Pointer event handling follows the [Konva pointer-event documentation](https://konvajs.org/docs/events/Pointer_Events.html).
- Increased schedule row height to 44px, enabled keyboard activation, and labeled the activity-editor close controls.

## Repeat the review

Install the existing client and server dependencies first, then run from the website repository:

```sh
cd platform/client
CI=true ./node_modules/.bin/react-scripts test --watchAll=false --runInBand
npm run build
cd ../..
node --test tests/*.test.js
node scripts/review-mobile.cjs
```

The review script creates a temporary loopback server, supplies fictional API responses, blocks external requests, and does not submit real messages, payments, or saved project changes. Results and 390px screenshots go to a temporary folder printed at completion. Set `MOBILE_REVIEW_OUTPUT` for a chosen folder, `BROWSER_EXECUTABLE_PATH` for Chrome/Chromium, `WIDTHS` for a comma-separated width subset, or `SCENES` for named scenarios. Build the client before starting the review; do not rebuild while it runs.

## Remaining verification boundaries

- Physical iPhone/iPad Safari and Android Chrome testing remains outstanding, including software keyboards, browser chrome, screen readers, gesture resizing, camera, dictation, and LiDAR handoff.
- Automated size checks cover visible HTML buttons, summary controls, and standard form controls. They do not certify every text link, canvas handle, contrast ratio, or accessibility requirement. Checkbox labels already have expanded hit areas but are not part of the automated size assertion.
- Review fixtures exercise populated layouts; they do not prove provider connectivity or backend delivery. External fonts/media are blocked in this isolated run.
- GitHub Pages publishes only the homeowner website. The contractor app still needs permanent backend hosting before its private workflows have a public review URL. The retired browser-local `platform.html` application is not published or included in this review.
