# Behringer: WING CC/UL for Bitfocus Companion

A Companion connection module by **Grigoryan Dmitry** that mirrors the assignments of a Behringer WING Compact on a Stream Deck+. Version **1.7.0** was developed and tested on macOS with Companion **5.0.1**. Raspberry Pi deployment has yet to be tested.

## Install

1. Download `wing-userlayer-1.7.0.tgz` from the [GitHub releases](https://github.com/Dmitry-Grigoryan/Behringer-WING-CC-UL-COMPANION/releases) and import it in Companion under **Modules → Import module package**.
2. Add **Behringer: WING CC/UL** as a connection. Enter the WING IP address, or leave it blank for automatic discovery. If several consoles answer, enter the address of the one you want to control.
3. In **Presets**, choose **CUSTOM CONTROLS** for Layers 1–16, each with eight buttons and four encoders. **USER LAYER** lists the 16 buttons on WING Compact pages U1–U4.
4. For a Stream Deck+ LCD strip, place the encoder display preset in row 3. Place the corresponding preset in row 4 to receive rotation and physical encoder presses.

Encoder turns use separate **Rotate Left** and **Rotate Right** actions. The physical encoder presses default to page 1, no action, next page and previous page respectively. For this navigation, enable **TCP Remote Control** in Companion. The module uses the local port **16759** by default.

## Supported functions

### Buttons — Custom Controls and User Layer

- Channel Mute and Solo
- DCA Mute and Mute Group
- Insert Pre and Insert Post
- Sends on Fader
- Spill — DCA, FX, Bus, Main, Matrix, Automix X/Y
- Fader Page — fader bank selection
- CH Page → EQ and Global Page → FX
- FX Parameter — binary parameters
- Other — Talkback A/B, Main/Alt, DAW Switch, Monitor A/B/A+B, Monitor Dim/Mono/Swap/Mute, Automix X/Y, Channel Prev/Next, fader presets at −∞, −10 and 0 dB
- Show Control — Go, Prev, Next, Go Prev, Go Next
- Scene Recall — tags 1–128
- GPIO Toggle and GPIO Push
- USB Play/Rec — Stop, Play, Pause, Play/Stop, Play/Pause, Next, Prev, Rec Stop, Record, Rec Pause, Rec New File
- SD A/B — Stop, Play, Record, Pause, Play/Stop, Play/Pause, Add Marker, Prev/Next Marker, Go to Marker, Play Marker, Prev/Next Session, direct session and marker selection, Return to Zero

### Encoders — Custom Controls

- Fader and Pan
- DCA Fader
- Selected Send and Fixed Send
- FX Parameter — numeric parameters
- Monitor A/B levels
- Lamp, Glow and Patch brightness
- SD A/B — position, marker and session navigation

## Unsupported or not yet tested

### Unsupported

- **CH Page and Global Page beyond EQ and FX, and View Page** — the console uses numeric screen IDs. The remaining IDs and overview navigation have yet to be verified.
- **Solo Tap, Meter Tap and CC Bank** — command handling is not implemented.
- **Spill to SELCH or ACTCH** — target mapping has not been verified.
- **GPIO Delay and Fader Start** — trigger handling is not implemented.
- **FX buttons for non-binary parameters and encoder parameters with a list of values** — the module currently handles binary button parameters and numeric encoder parameters.
- **Talkback Level on an encoder and the SD Select Session menu** — command handling is not implemented.
- **DAW/MCU Buttons, V-Pots, Jog Wheel, MIDI CC, MIDI Note and Program Change** — not implemented or tested over USB/DIN. Direct network triggering has not been verified.

### Implemented but not fully tested on hardware

- Show Control and Scene Recall with a loaded show
- GPIO Toggle and Push with external equipment
- USB Play/Rec and SD A/B transport with media
- Talkback and individual monitor controls on a live mix
- Every fader bank, Spill target, send combination and FX parameter

## License and assets

Project code is MIT licensed. For attribution and licensing scope of the WING graphics, see [NOTICE](NOTICE).
