# Wander

A personal exploration map, and the photographs your friends leave behind in the places uncovered.

Every user starts with an empty map - a clean slate. Wander will track your location and reveal the map as you walk around, creating a path of where the user has been, and revealing the pictures surrounding that location that friends have uploaded, contributing to the collection. Users can contribute their own sights and views by taking or uploading pictures onto the map.

---

## Features

- Pixelated game-like interface with % exploration of the world
- SVG personal fog-of-war over the map - uncover places, street names, nearby photos as you go
- Leave photos at real-world locations for friends to discover once they've explored the area themselves
- Add friends by friend code, compete world-exploration through rankings, distance and steps
- Cross-device syncing through Supabase 

---

## Tech Stack

- **Frontend:** React, React Native, Expo, React Native Maps, Javascript
- **Backend:** Node.js, Supabase, PostgreSQL
- **Other:** Reve for UI design

---

## Setup Instructions

### 1. Node Server

Needs Node 22.5+ (uses the built-in `node:sqlite`).

```bash
cd server && node seed.js && node server.js
```

#### 2. Supabase Configuration

Before running the Expo app, create a mobile/.env file with your own Supabase credentials.

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project dashboard under Project Settings → API.
Do not commit your .env file or any secret keys to GitHub.

### 3. Expo App

1. Download Expo Go on your mobile device.
2. Install dependencies and start the development server

<img width="394" height="392" alt="image" src="https://github.com/user-attachments/assets/35dc1266-591f-4412-9f2c-71ffc6041a7a" />

```bash
cd mobile && npm install && npx expo start
```
3. Scan the QR code using your phone (camera), or press `i` for an iOS simulator / `a` for an Android emulator.
