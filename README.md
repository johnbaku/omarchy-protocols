# Protocols

An [Omarchy](https://omarchy.org/) shell plugin that reminds you of daily health protocols at the moment they are worth doing. It includes three routines from Andrew Huberman:

| Protocol | Reminds you | Open until |
|---|---|---|
| Morning hydration | 6 a.m. local time, or when you return before noon | noon |
| Morning light | 30 minutes after sunrise | 3 hours after sunrise (best in the first hour) |
| Evening light | 45 minutes before sunset | sunset |

Morning hydration calls for 16–32 US fl oz (about 500 mL–1 L) of water soon after waking, with optional electrolytes. The 6 a.m.–noon window is a reminder schedule, not a physiological deadline; the plugin does not detect when you wake. It works even without a location. Sources: [Huberman’s hydration newsletter](https://www.hubermanlab.com/newsletter/optimize-your-water-quality-and-intake-for-health) and [his personal morning routine](https://www.hubermanlab.com/episode/how-nature-other-physical-environments-impact-your-focus-cognition-health-marc-berman), described in an electrolyte sponsor segment.

Sunrise and sunset are computed on your machine for where you are. If the computer was asleep or you sat down late, the reminder arrives as soon as you are back, as long as the window is still open.

## What you see

- **Bar icon.** A sun. It turns to a water drop, rising sun, or setting sun in the urgent color while a protocol is due, becomes a check once everything is done for the day, and dims if the day ran out with something missed.
- **Notification.** One per protocol, when it comes due. Light reminders say how long to stay out for the current cloud cover (about 10 minutes when clear, 20 when cloudy, 30 when overcast) and has a **Done** button. It stays on screen until you dismiss it, mark it done, or the window closes.
- **Card.** Left click the icon for today's sunrise and sunset, each protocol's status, and a circle to tick each one off (click a ticked one to untick it). Click a protocol for its time window and how to do it. Right click the icon to mark whatever is due as done.

## Install

```bash
omarchy plugin add https://github.com/johnbaku/omarchy-protocols --enable
omarchy bar put johnbaku.protocols --section right
```

To work on it from a checkout instead, link the checkout into the plugins folder:

```bash
ln -s "$PWD" ~/.config/omarchy/plugins/johnbaku.protocols
omarchy bar put johnbaku.protocols --section right
```

A linked checkout is not watched for changes, so run `omarchy restart shell` after editing.

## Location

The plugin uses the same location as Omarchy's weather panel: the one you set there (or with `omarchy-weather-location --set <name> <lat,lon>`), and otherwise the city `geo.omarchy.org` detects from your network. Detection runs again after the computer wakes, so the times follow you when you travel. Times are shown in your computer's time zone.

## Network use

- `https://geo.omarchy.org/` to find your city, only when no weather location is set: at start, after waking, and at midnight.
- `https://api.open-meteo.com/` for the current cloud cover, with your coordinates rounded to two decimals: when a light protocol comes due and when you open the card, at most every 15 minutes.

Without a network the reminders still fire, using the last known location and the general duration guide.

## Command line

```bash
omarchy-shell johnbaku.protocols status               # today's windows as JSON
omarchy-shell johnbaku.protocols progress             # history and individual streaks as JSON
omarchy-shell johnbaku.protocols done morning-light
omarchy-shell johnbaku.protocols undo morning-light
omarchy-shell johnbaku.protocols done morning-hydration
```

Today's marks and daily history are kept locally in `~/.local/state/omarchy-protocols/state.json`. Nothing is uploaded.

## Daily streaks

The main card shows **1 of 3 done today** and a separate streak beneath each protocol's name. A missed evening-light session does not reset your hydration or morning-light streak.

- Checking off a protocol extends its streak; undo updates it immediately.
- An unfinished protocol keeps yesterday's streak while its window is still open (or upcoming). Once the window closes without completion, that protocol's streak resets.
- A missing or unavailable day breaks that protocol's streak: consecutive completion cannot be assumed.
- No prior completions? The row says **Start your streak**.

Daily history remains stored locally across restarts. Existing marks are migrated, but older days that were never saved cannot be recovered. The `progress` command exposes the tracking start date, each current protocol's streak, and the saved history.

## Adding a protocol

Add a row to `PROTOCOLS` in `Protocols.js` (an anchor of `sunrise`, `sunset`, or `morning` (local midnight), its window in minutes from it, and `needsSky` for light protocols), then its four strings in `i18n/en.json`: `<id>.name`, `<id>.how`, `<id>.notify` and `<id>.notifyLate`.

## Tests

```bash
TZ=America/Vancouver node --test tests/
omarchy plugin validate .
```

Not medical advice. Never look straight at the sun.

## License

MIT
