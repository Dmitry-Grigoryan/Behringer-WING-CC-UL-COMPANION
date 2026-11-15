# Behringer: WING CC/UL for Bitfocus Companion
This is a separate Bitfocus Companion module that complements the main Behringer WING integration.

It turns your Stream Deck+ into a Custom Controls surface for the Behringer WING Compact, and any Stream Deck into a User Layers surface for the Behringer WING Full Size and WING Rack.

Assign functions directly on the WING, and your Stream Deck follows those assignments automatically, without having to open the Bitfocus Companion editor each time.
## Install

1. Download `wing-userlayer-1.7.0.tgz` from the [GitHub releases](https://github.com/Dmitry-Grigoryan/Behringer-WING-CC-UL-COMPANION/releases) and import it in Companion under **Modules → Import module package**.
2. Add **Behringer: WING CC/UL** as a connection. Enter the WING IP address, or leave it blank for automatic discovery. If several consoles answer, enter the address of the one you want to control.
3. In **Presets**, choose **CUSTOM CONTROLS** for Layers 1–16, each with eight buttons and four encoders. **USER LAYER** lists the 16 buttons on WING Compact pages U1–U4.
4. In the Companion **Buttons** grid, place the **same encoder preset twice in the same column**. Put it in **row 3** for the Stream Deck+ LCD display and in **row 4** for physical encoder turns and presses.

<img width="2320" height="1056" alt="download" src="https://github.com/user-attachments/assets/ad6a5416-05c3-4ca3-ab1d-aa20346613b4" />
<img width="1774" height="887" alt="exec-cbdacff4-b101-4cb9-bf73-be4e9f902972" src="https://github.com/user-attachments/assets/6ad4e491-e6d0-4b39-a354-fa73f3386e10" />



In row 4, each encoder uses separate **Rotate Left** and **Rotate Right** actions. Pressing **encoder 1** returns to the **main page (Companion page 1)**. **Encoder 2** has no press action. Press **encoder 3** for **Page Up** and **encoder 4** for **Page Down**. These page shortcuts use Companion's **TCP Remote Control**, with local port **16759** by default.

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
