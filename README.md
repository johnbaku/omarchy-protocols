# Protocols

An [Omarchy](https://omarchy.org/) shell plugin that reminds you of daily health protocols at the moment they are worth doing. It starts with two from Andrew Huberman's light protocols:

| Protocol | Reminds you | Open until |
|---|---|---|
| Morning light | 30 minutes after sunrise | 3 hours after sunrise (best in the first hour) |
| Evening light | 45 minutes before sunset | sunset |

Sunrise and sunset are computed on your machine for where you are. If the computer was asleep or you sat down late, the reminder arrives as soon as you are back, as long as the window is still open.

## What you see

- **Bar icon.** A sun. It turns to a rising or setting sun in the urgent color while a protocol is due, and dims once nothing is left today.
- **Notification.** One per protocol, when it comes due. It says how long to stay out for the current cloud cover (about 10 minutes when clear, 20 when cloudy, 30 when overcast) and has a **Done** button. It stays on screen until you dismiss it, mark it done, or the window closes.
- **Card.** Left click the icon for today's sunrise and sunset, each protocol's window and status, and a Done / Undo button. Right click the icon to mark whatever is due as done.

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
- `https://api.open-meteo.com/` for the current cloud cover, with your coordinates rounded to two decimals: when a protocol comes due and when you open the card, at most every 15 minutes.

Without a network the reminders still fire, using the last known location and the general duration guide.

## Command line

```bash
omarchy-shell johnbaku.protocols status               # today's windows as JSON
omarchy-shell johnbaku.protocols done morning-light
omarchy-shell johnbaku.protocols undo morning-light
```

Today's marks are kept in `~/.local/state/omarchy-protocols/state.json`.

## Adding a protocol

Add a row to `PROTOCOLS` in `Protocols.js` (an anchor of `sunrise` or `sunset` and its window in minutes from it), then its four strings in `i18n/en.json`: `<id>.name`, `<id>.how`, `<id>.notify` and `<id>.notifyLate`.

## Tests

```bash
TZ=America/Vancouver node --test tests/
omarchy plugin validate .
```

Not medical advice. Never look straight at the sun.

## License

MIT
