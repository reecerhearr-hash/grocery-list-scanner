# Grocery List Scanner

Photograph a handwritten grocery list and turn it into a checkable list on your phone, synced through Supabase.

## 📲 Install on your Android phone
1. On your phone, open **[Releases → latest](../../releases/latest)** (sign in to GitHub; this repo is private).
2. Tap **GroceryList.apk** to download it, then tap **Open**.
3. If Android asks, allow **Install unknown apps** for your browser, then tap **Install**.
4. Open **Grocery List** and create an account (each person uses their own email and password).
5. The first person taps **Create household**. Everyone else taps **Join someone's household** and enters the invite code from the first phone (⋯ → **Household & sharing**).

If Supabase sends a confirmation email after you sign up, tap the link in it, then come back to the app and sign in.

Direct link to the newest build: `https://github.com/reecerhearr-hash/grocery-list-scanner/releases/latest/download/GroceryList.apk`

**Updates:** every change pushed to `main` builds a new APK automatically (Actions tab → *Build Android app*). Install the new one over the old one and your list carries over. You can also start a build by hand: **Actions → Build Android app → Run workflow**.

## What it does
- **Upload from photos.** Tap **🖼️ Photos** to use pictures already in your gallery. You can pick several at once, for example a list that runs onto two pages; they're read together, and an item that appears in more than one photo only shows up once.
- **AI handwriting reader.** When you're online, photos are read by Claude through the `read-list` Supabase function (`supabase/functions/read-list`). It handles messy handwriting and multiple columns, skips crossed-out items, fixes spelling ("gatoraide" → Gatorade) and picks the aisle. It needs an `ANTHROPIC_API_KEY` secret in Supabase → Edge Functions → Secrets. With no signal, or if the AI reader isn't available, the app falls back to the basic on-phone reader and tells you why. You can turn it off on the review screen.
- **Scan a list.** Take a photo, or pick one from your gallery (⋯ menu). The image is cleaned up before reading: it's straightened for phone rotation, blue notebook lines are faded, and the contrast is boosted. You then get a **review screen** where you can untick junk lines, fix spelling and set quantities before anything is saved. Low-confidence lines are shown in orange. Items already on your list are unticked automatically.
- **Understands quantities.** For example `2 gal milk`, `eggs x2`, `3 cans black beans`, `apples - 6`, `two avocados`, and `ground beef 2 lbs` (it also corrects the common OCR misread "Ibs"). Bullets, `[ ]` boxes and `1.` numbering are removed.
- **Sorted by aisle.** Items are grouped automatically (Produce, Meat, Dairy, Bakery, Frozen, Pantry, Snacks & Drinks, Household, Personal Care, Pets, Other). Checked items move to "In cart".
- **Type to add.** Use the add bar. You can enter several items at once, separated by commas: `2 milk, eggs, bread`.
- **Edit or delete any item.** Tap its name to change the name, quantity, aisle or price, or to delete it.
- **Walmart price estimates.** When the AI reader scans a list it also estimates a typical Walmart price for each item (store brand unless a brand is written). Estimates show with a `~` (e.g. `~$3.48`). Any price you type replaces the estimate and is remembered for next time, and remembered prices are used before estimates.
- **Prices and running total.** Enter a price per unit, and the bottom bar shows an estimated total and how much is already in the cart. Prices are remembered per item, so next time you add "milk" the last price you paid fills in.
- **Shared household list.** Each person has their own login; everyone in the same household sees and edits one list, and check-offs show up on the other phones right away. ⋯ → **Household & sharing** shows the invite code, members, and lets you rename, make a new code, sign out or leave.
- **Works offline.** If there's no signal in the store, the list still opens and you can check items off and add new ones. Changes are saved on the phone and sync when you're back online. An orange dot marks items that haven't synced yet.
- **Menu (⋯):** scan from gallery, share/copy the list as text, uncheck all, remove checked items, clear the list, and Settings (change Supabase keys, copy the setup SQL, reset the cache, disconnect).
- Supports dark mode.

## Tips for better scans
- Lay the list flat in even light and fill the frame with it.
- Print-style handwriting with one item per line reads best. Cursive is hit-and-miss with any on-device reader.
- If results look worse than expected, untick **Enhance image** on the review screen and tap **Rescan**.

## How it's built
- `www/`: the app itself (`index.html`), plus `config.js` (the built-in Supabase URL and anon key), the PWA files and icons.
- `android/`: the Capacitor Android project that wraps `www/` into a native app. The OCR engine and English language data are **bundled inside the APK**, so scanning works with no signal.
- `scripts/vendor.mjs`: copies the Supabase and Tesseract libraries from `node_modules` into `www/vendor/`.
- `.github/workflows/android.yml`: builds a signed APK and publishes it as a GitHub Release.
- `setup.sql`: the database setup (households, members, row-level security, realtime). Re-running it is safe.

### Building on your own machine (optional)
```
npm ci
npm run build                      # bundles www/ into android/
cd android && ./gradlew assembleDebug
```
To use it as a website instead of an app, run `npm run serve`, or host the `www/` folder on any https host after running `npm run vendor`.

### Notes
- **Signing key:** `android/release.keystore` and its password (in the workflow file) are committed so every build is signed the same way and installs as an update. That's fine while the repo stays private. If you ever make the repo public, move the password into a repository secret first.
- **Supabase key:** the anon key in `www/config.js` is a public client key. The data is protected by Supabase Auth plus row-level security: a signed-in person can only read or change their own household's items and prices.

## Possible next steps
- **Better handwriting reading.** Add a cloud vision model (for example a Supabase Edge Function that calls a vision API). The API key would stay on the server, and messy cursive would read much better than with Tesseract.
- **Multiple lists** (e.g. Walmart vs. Aldi) with a list picker.
- **Store prices.** Walmart doesn't offer a public price API that a browser app can call, so prices are entered by hand and remembered.
