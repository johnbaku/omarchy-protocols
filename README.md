# Protocols

An [Omarchy](https://omarchy.org/) shell plugin that reminds you of daily health protocols at the moment they are worth doing. It includes five routines from Andrew Huberman:

| Protocol | Reminds you | Open until |
|---|---|---|
| Morning hydration | at your wake time | 6 hours after it |
| Morning light | 30 minutes after sunrise | 3 hours after sunrise (best in the first hour) |
| NSDR | 2 p.m. | 5 p.m. |
| Evening light | 45 minutes before sunset | sunset |
| Dim the lights | 2 hours before your bedtime | an hour after it, or midnight |

The wake time is 7:00 and the bedtime 23:00, about when most adults get up and go to bed, until you [set your own](#wake-and-bed-times). Only the two light protocols need a location.

Morning hydration calls for 16–32 US fl oz (about 500 mL–1 L) of water soon after waking, with optional electrolytes. Its window is a reminder schedule, not a physiological deadline; the plugin does not detect when you wake. Sources: [Huberman’s hydration newsletter](https://www.hubermanlab.com/newsletter/optimize-your-water-quality-and-intake-for-health) and [his personal morning routine](https://www.hubermanlab.com/episode/how-nature-other-physical-environments-impact-your-focus-cognition-health-marc-berman), described in an electrolyte sponsor segment.

The other clock reminders:

- **NSDR.** A 10–30 minute non-sleep deep rest or yoga nidra session. It works at any time of day; the 2–5 p.m. window is when the afternoon dip usually lands. Source: [NSDR](https://www.hubermanlab.com/nsdr).
- **Dim the lights.** Avoid bright light, especially overhead lights, from 10 p.m. to 4 a.m. Huberman also advises low, warm lamps rather than overhead lights in the hours before bed, so the reminder arrives two hours before your bedtime (9 p.m. with the default) and closes by midnight, when the plugin's day ends. Sources: [Toolkit for Sleep](https://www.hubermanlab.com/newsletter/toolkit-for-sleep) and [How to Shift With the End of Daylight Saving Time](https://www.hubermanlab.com/newsletter/shift-end-daylight-saving-time).

Sunrise and sunset are computed on your machine for where you are. If the computer was asleep or you sat down late, the reminder arrives as soon as you are back, as long as the window is still open.

## What you see

- **Bar icon.** A sun. It turns to the due protocol's own icon in the urgent color while one is due, becomes a check once everything is done for the day, and dims if the day ran out with something missed.
- **Notification.** One per protocol, when it comes due, with a **Done** button and a **Snooze** button, which brings the reminder back in 5 minutes. Light reminders also say how long to stay out for the current cloud cover (about 10 minutes when clear, 20 when cloudy, 30 when overcast). It stays on screen until you dismiss it, snooze it, mark it done, or the window closes.
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

## Wake and bed times

Open the card, click the gear in its corner, and use the − and + buttons to move your wake time or bedtime in 15-minute steps. Or set an exact time, on the 24-hour clock, from the command line:

```bash
omarchy-shell johnbaku.protocols wake 6:30
omarchy-shell johnbaku.protocols bed 22:30
```

Each command answers with the time now in force, so one it did not understand shows as unchanged. A bedtime at or before the wake time counts as tomorrow's.

## Location

The plugin uses the same location as Omarchy's weather panel: the one you set there (or with `omarchy-weather-location --set <name> <lat,lon>`), and otherwise the city `geo.omarchy.org` detects from your network. Detection runs again after the computer wakes, so the times follow you when you travel. Times are shown in your computer's time zone.

## Network use

- `https://geo.omarchy.org/` to find your city, only when no weather location is set: at start, after waking, and at midnight.
- `https://api.open-meteo.com/` for the current cloud cover, with your coordinates rounded to two decimals: when a light protocol comes due and when you open the card, at most every 15 minutes.

Without a network the reminders still fire, using the last known location and the general duration guide.

## Command line

```bash
omarchy-shell johnbaku.protocols status               # today's windows as JSON
omarchy-shell johnbaku.protocols done morning-light
omarchy-shell johnbaku.protocols undo morning-light
omarchy-shell johnbaku.protocols done morning-hydration
```

Today's marks and your wake and bed times are kept in `~/.local/state/omarchy-protocols/state.json`.

## Adding a protocol

Add a row to `PROTOCOLS` in `Protocols.js` (an anchor of `sunrise`, `sunset`, `wake`, `bed`, or `clock` (local midnight), its window in minutes from it, a `glyph` from `GLYPHS`, and `needsSky` for light protocols), then its four strings in `i18n/en.json`: `<id>.name`, `<id>.how`, `<id>.notify` and `<id>.notifyLate`. A reminder with no real deadline takes `ownStatus` and three more strings for the card: `<id>.upcoming`, `<id>.due` and `<id>.ended`.

## Tests

```bash
TZ=America/Vancouver node --test tests/
omarchy plugin validate .
```

Not medical advice. Never look straight at the sun.

## License

MIT
