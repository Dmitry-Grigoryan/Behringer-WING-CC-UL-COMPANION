# Behringer: WING CC/UL for Bitfocus Companion

A Companion connection module by **Grigoryan Dmitry** that mirrors the assignments of a Behringer WING Compact on a Stream Deck+. Version **1.7.0** was developed and tested on macOS with Companion **5.0.1**. Raspberry Pi deployment has yet to be tested.

## Install

1. Download `wing-userlayer-1.7.0.tgz` from the [GitHub releases](https://github.com/Dmitry-Grigoryan/Behringer-WING-CC-UL-COMPANION/releases) and import it in Companion under **Modules → Import module package**.
2. Add **Behringer: WING CC/UL** as a connection. Enter the WING IP address, or leave it blank for automatic discovery. If several consoles answer, enter the address of the one you want to control.
3. In **Presets**, choose **CUSTOM CONTROLS** for Layers 1–16, each with eight buttons and four encoders. **USER LAYER** lists the 16 buttons on WING Compact pages U1–U4.
4. For a Stream Deck+ LCD strip, place the encoder display preset in row 3. Place the corresponding preset in row 4 to receive rotation and physical encoder presses.

Encoder turns use separate **Rotate Left** and **Rotate Right** actions. The physical encoder presses default to page 1, no action, next page and previous page respectively. For this navigation, enable **TCP Remote Control** in Companion. The module uses the local port **16759** by default.

## Function coverage

The module reads assignments and supported target states from WING over OSC and displays the target name, color, icon and function. Supported assignments include Mute, Solo, DCA Mute, inserts, faders, pan, sends, FX parameters, and selected utility and transport commands. The built-in console screen shortcuts are **Global Page → FX** and **CH Page → EQ**, verified on the test WING Compact.

Picture and sound behavior for every assignment has not been verified on physical hardware. Scene recall, GPIO with external equipment, and USB and SD transport with media require additional testing. DAW/MCU, MIDI assignments, View Page, and other CH Page or Global Page screens are outside the implemented set for 1.7.0.

## Build the release package

Use Node.js **22.20 or later in the 22.x series**.

```sh
npm ci
npm run build
```

The build writes `wing-userlayer-1.7.0.tgz` in the project directory. Upload the package as an asset of the `v1.7.0` GitHub release.

## License and assets

Project code is MIT licensed. For attribution and licensing scope of the WING graphics, see [NOTICE](NOTICE).
